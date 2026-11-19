"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_NETWORK_ID, getNetwork, isNetworkId, type ForgeNetwork, type NetworkFlags, type NetworkId } from "@/lib/networks";
import { api } from "@/lib/client/api";

export interface AppConfig {
  storageMode: "local" | "supabase";
  networkFlags: NetworkFlags;
  testRunner: "disabled" | "solidity" | "all";
  githubConfigured: boolean;
  user: { id: string; label: string } | null;
  authError: string | null;
}

export type ClientNetwork = ForgeNetwork & { deploymentsAllowed: boolean; rpcOverride: string | null };

export interface RpcStatus {
  ok: boolean;
  actualChainId: number | null;
  expectedChainId: number;
  blockNumber: string | null;
  latencyMs: number | null;
  error: string | null;
  rpcUrl: string;
}

interface AppState {
  config: AppConfig | null;
  networks: ClientNetwork[];
  networkId: NetworkId;
  network: ClientNetwork;
  setNetworkId: (id: NetworkId) => void;
  rpcStatus: RpcStatus | null;
  rpcChecking: boolean;
  refreshRpc: () => Promise<void>;
  reloadNetworks: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);
const KEY = "4orge.network";

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [networks, setNetworks] = useState<ClientNetwork[]>([]);
  const [networkId, setNetworkIdState] = useState<NetworkId>(DEFAULT_NETWORK_ID);
  const [rpcStatus, setRpcStatus] = useState<RpcStatus | null>(null);
  const [rpcChecking, setRpcChecking] = useState(false);

  const reloadNetworks = useCallback(async () => {
    try {
      const n = await api<{ networks: ClientNetwork[]; defaultNetwork: NetworkId }>("/networks");
      setNetworks(n.networks);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(KEY);
      } catch {
        /* ignore */
      }
      const preferred = saved && isNetworkId(saved) && n.networks.some((x) => x.id === saved) ? saved : n.defaultNetwork;
      setNetworkIdState(preferred);
    } catch {
      /* unauthenticated — handled by the shell */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setConfig(await api<AppConfig>("/config"));
      } catch {
        /* config endpoint failure is surfaced by pages */
      }
      await reloadNetworks();
    })();
  }, [reloadNetworks]);

  // Only the latest request may update the status: a slow check for a previously
  // selected network must not overwrite the current one.
  const latestCheck = useRef(0);
  const refreshRpc = useCallback(async () => {
    const ticket = ++latestCheck.current;
    setRpcChecking(true);
    let next: RpcStatus;
    try {
      next = (await api<{ rpc: RpcStatus }>(`/networks/${networkId}/status`)).rpc;
    } catch (e) {
      next = { ok: false, actualChainId: null, expectedChainId: getNetwork(networkId).chainId, blockNumber: null, latencyMs: null, error: (e as Error).message, rpcUrl: "" };
    }
    if (ticket !== latestCheck.current) return;
    setRpcStatus(next);
    setRpcChecking(false);
  }, [networkId]);

  useEffect(() => {
    if (!config?.user) return;
    // Initial RPC health check for the selected network, then every minute.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshRpc();
    const t = setInterval(() => void refreshRpc(), 60_000);
    return () => clearInterval(t);
  }, [refreshRpc, config?.user]);

  const setNetworkId = useCallback((id: NetworkId) => {
    setNetworkIdState(id);
    setRpcStatus(null);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const network = useMemo<ClientNetwork>(
    () => networks.find((n) => n.id === networkId) ?? { ...getNetwork(networkId), deploymentsAllowed: false, rpcOverride: null },
    [networks, networkId],
  );

  const value = useMemo(
    () => ({ config, networks, networkId, network, setNetworkId, rpcStatus, rpcChecking, refreshRpc, reloadNetworks }),
    [config, networks, networkId, network, setNetworkId, rpcStatus, rpcChecking, refreshRpc, reloadNetworks],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}
