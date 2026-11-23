"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createWalletClient, custom, getAddress, type EIP1193Provider } from "viem";
import { getNetwork, toAddChainParams, toViemChain, type NetworkId } from "@/lib/networks";
import type { PreparedDeployment } from "@/lib/types";

/**
 * Browser wallet integration (MetaMask, Rabby and any EIP-1193 wallet).
 *
 * Wallets are discovered with EIP-6963 so several installed wallets can
 * coexist; `window.ethereum` is used as a fallback. 4ORGE never asks for,
 * receives, or stores seed phrases or private keys: the wallet signs every
 * transaction after the user approves it in the wallet's own UI.
 */

export interface WalletInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Discovered {
  info: WalletInfo;
  provider: EIP1193Provider;
}

interface WalletState {
  wallets: WalletInfo[];
  active: WalletInfo | null;
  address: `0x${string}` | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  connect: (rdns?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  switchNetwork: (id: NetworkId) => Promise<void>;
  sendDeployment: (prepared: PreparedDeployment) => Promise<`0x${string}`>;
  clearError: () => void;
}

const WalletContext = createContext<WalletState | null>(null);
const STORAGE_KEY = "4orge.wallet";

export class WalletError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

/** Translate raw wallet/RPC errors into clear guidance. */
export function describeWalletError(e: unknown): WalletError {
  const err = e as { code?: number; message?: string; shortMessage?: string; cause?: { code?: number; message?: string } };
  const code = err.code ?? err.cause?.code;
  const message = err.shortMessage ?? err.message ?? String(e);
  if (code === 4001 || /user (rejected|denied)|rejected the request/i.test(message)) {
    return new WalletError("You rejected the request in your wallet. Nothing was signed or sent.", 4001);
  }
  if (code === -32002) return new WalletError("Your wallet already has a pending request — open the wallet to respond.", code);
  if (/insufficient funds/i.test(message)) {
    return new WalletError("The deployer account does not have enough QIE to pay for gas. Fund it (Testnet faucet) and retry.", code);
  }
  if (/chain mismatch|does not match the target chain/i.test(message)) {
    return new WalletError("Your wallet is connected to a different network. Switch networks and retry.", code);
  }
  return new WalletError(message.split("\n")[0], code);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const discovered = useRef<Map<string, Discovered>>(new Map());
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [active, setActive] = useState<Discovered | null>(null);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // EIP-6963 discovery + legacy injected provider fallback.
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Discovered>).detail;
      if (!detail?.info?.uuid || !detail.provider) return;
      discovered.current.set(detail.info.rdns || detail.info.uuid, detail);
      setWallets([...discovered.current.values()].map((d) => d.info));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const fallback = setTimeout(() => {
      const injected = (window as unknown as { ethereum?: EIP1193Provider & { isMetaMask?: boolean; isRabby?: boolean } }).ethereum;
      if (injected && discovered.current.size === 0) {
        const name = injected.isRabby ? "Rabby" : injected.isMetaMask ? "MetaMask" : "Browser wallet";
        discovered.current.set("injected", {
          info: { uuid: "injected", name, rdns: "injected", icon: "" },
          provider: injected,
        });
        setWallets([...discovered.current.values()].map((d) => d.info));
      }
    }, 400);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(fallback);
    };
  }, []);

  // Silently restore a previous connection (eth_accounts never prompts).
  useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (!saved || active) return;
    const d = discovered.current.get(saved);
    if (!d) return;
    void (async () => {
      try {
        const accounts = (await d.provider.request({ method: "eth_accounts" })) as string[];
        if (accounts.length) {
          setActive(d);
          setAddress(getAddress(accounts[0]));
          setChainId(Number(await d.provider.request({ method: "eth_chainId" })));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [wallets, active]);

  // Track account / network changes made in the wallet.
  useEffect(() => {
    if (!active) return;
    const p = active.provider;
    const onAccounts = (accounts: string[]) => setAddress(accounts.length ? getAddress(accounts[0]) : null);
    const onChain = (hex: string) => setChainId(Number(hex));
    const onDisconnect = () => {
      setAddress(null);
      setChainId(null);
    };
    p.on("accountsChanged", onAccounts as never);
    p.on("chainChanged", onChain as never);
    p.on("disconnect", onDisconnect as never);
    return () => {
      p.removeListener("accountsChanged", onAccounts as never);
      p.removeListener("chainChanged", onChain as never);
      p.removeListener("disconnect", onDisconnect as never);
    };
  }, [active]);

  const connect = useCallback(async (rdns?: string) => {
    setError(null);
    const list = [...discovered.current.entries()];
    const entry = rdns ? discovered.current.get(rdns) : list[0]?.[1];
    if (!entry) {
      setError("No browser wallet found. Install MetaMask or Rabby, then reload this page.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await entry.provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts.length) throw new WalletError("The wallet did not share any account.");
      setActive(entry);
      setAddress(getAddress(accounts[0]));
      setChainId(Number(await entry.provider.request({ method: "eth_chainId" })));
      try {
        localStorage.setItem(STORAGE_KEY, entry.info.rdns || entry.info.uuid);
      } catch {
        /* storage unavailable */
      }
    } catch (e) {
      setError(describeWalletError(e).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (active) {
      try {
        await active.provider.request({ method: "wallet_revokePermissions" as never, params: [{ eth_accounts: {} }] as never });
      } catch {
        /* not all wallets support revoking; forgetting locally is enough */
      }
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setActive(null);
    setAddress(null);
    setChainId(null);
  }, [active]);

  const switchNetwork = useCallback(
    async (id: NetworkId) => {
      if (!active) throw new WalletError("Connect a wallet first.");
      const network = getNetwork(id);
      const hex = `0x${network.chainId.toString(16)}`;
      try {
        await active.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      } catch (e) {
        const code = (e as { code?: number; data?: { originalError?: { code?: number } } }).code;
        const nested = (e as { data?: { originalError?: { code?: number } } }).data?.originalError?.code;
        if (code === 4902 || nested === 4902 || /unrecognized chain|not been added/i.test((e as Error).message)) {
          await active.provider.request({ method: "wallet_addEthereumChain", params: [toAddChainParams(network)] as never });
        } else {
          throw describeWalletError(e);
        }
      }
      setChainId(Number(await active.provider.request({ method: "eth_chainId" })));
    },
    [active],
  );

  const sendDeployment = useCallback(
    async (prepared: PreparedDeployment) => {
      if (!active || !address) throw new WalletError("Connect a wallet first.");
      if (address.toLowerCase() !== prepared.from.toLowerCase()) {
        throw new WalletError(`Switch your wallet to the approved deployer account ${prepared.from}.`);
      }
      const current = Number(await active.provider.request({ method: "eth_chainId" }));
      if (current !== prepared.chainId) {
        throw new WalletError(`Your wallet is on chain ${current}; this deployment targets chain ${prepared.chainId}. Switch networks first.`);
      }
      const network = getNetwork(prepared.network);
      const client = createWalletClient({ account: prepared.from, chain: toViemChain(network), transport: custom(active.provider) });
      try {
        // No `to`: contract creation. The wallet shows its own confirmation
        // screen; nothing is sent unless the user approves there.
        return await client.sendTransaction({
          account: prepared.from,
          data: prepared.data,
          gas: prepared.gas ? BigInt(prepared.gas) : undefined,
          value: 0n,
        });
      } catch (e) {
        throw describeWalletError(e);
      }
    },
    [active, address],
  );

  const value = useMemo<WalletState>(
    () => ({
      wallets,
      active: active?.info ?? null,
      address,
      chainId,
      connecting,
      error,
      connect,
      disconnect,
      switchNetwork,
      sendDeployment,
      clearError: () => setError(null),
    }),
    [wallets, active, address, chainId, connecting, error, connect, disconnect, switchNetwork, sendDeployment],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
