/**
 * QIE network registry — the single source of truth for chain IDs, RPC
 * endpoints and explorers used across 4ORGE (server and browser).
 *
 * Values come from the 4ORGE specification and match community/official
 * listings for QIE (testnet chain 1983, mainnet chain 1990). Because
 * documentation can drift, 4ORGE never trusts these numbers blindly: the
 * Network page and every Runbook `network.check` step call `eth_chainId` on
 * the live RPC and refuse to continue when the answer does not match.
 */
import { defineChain, type Chain } from "viem";

export type NetworkId = "qie-testnet" | "qie-mainnet" | "local-hardhat";

export interface ForgeNetwork {
  id: NetworkId;
  name: string;
  shortName: string;
  chainId: number;
  rpcUrls: string[];
  explorerUrl: string | null;
  /** Base URL of a Blockscout-compatible API, if the explorer exposes one. */
  explorerApiUrl: string | null;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  kind: "testnet" | "mainnet" | "development";
  faucetUrl?: string;
  /**
   * Whether 4ORGE may broadcast deployments to this network. Mainnet is
   * disabled for the MVP and can only be enabled deliberately by the owner
   * (see `isDeploymentAllowed`).
   */
  deploymentsEnabledByDefault: boolean;
  description: string;
}

export const NETWORKS: Record<NetworkId, ForgeNetwork> = {
  "qie-testnet": {
    id: "qie-testnet",
    name: "QIE Testnet",
    shortName: "Testnet",
    chainId: 1983,
    rpcUrls: ["https://rpc1testnet.qie.digital"],
    explorerUrl: "https://testnet.qie.digital",
    explorerApiUrl: "https://testnet.qie.digital/api",
    nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
    kind: "testnet",
    faucetUrl: "https://www.qie.digital/faucet",
    deploymentsEnabledByDefault: true,
    description:
      "Public QIE test network. Tokens have no value — use the faucet to fund your deployer wallet.",
  },
  "qie-mainnet": {
    id: "qie-mainnet",
    name: "QIE Mainnet",
    shortName: "Mainnet",
    chainId: 1990,
    rpcUrls: ["https://rpc1mainnet.qie.digital"],
    explorerUrl: "https://mainnet.qie.digital",
    explorerApiUrl: "https://mainnet.qie.digital/api",
    nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
    kind: "mainnet",
    deploymentsEnabledByDefault: false,
    description:
      "QIE production network. Transactions spend real QIE. Deployments are locked in this release.",
  },
  "local-hardhat": {
    id: "local-hardhat",
    name: "Local Hardhat",
    shortName: "Local",
    chainId: 31337,
    rpcUrls: ["http://127.0.0.1:8545"],
    explorerUrl: null,
    explorerApiUrl: null,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    kind: "development",
    deploymentsEnabledByDefault: true,
    description:
      "A Hardhat node on your own machine (`npm run chain`). Useful for rehearsing a Runbook before Testnet.",
  },
};

export const DEFAULT_NETWORK_ID: NetworkId = "qie-testnet";

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && value in NETWORKS;
}

export function getNetwork(id: NetworkId): ForgeNetwork {
  return NETWORKS[id];
}

export function getNetworkByChainId(chainId: number): ForgeNetwork | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId);
}

export interface NetworkFlags {
  mainnetDeploymentsEnabled: boolean;
  localChainEnabled: boolean;
}

/** Networks the UI should offer, given server feature flags. */
export function listNetworks(flags: NetworkFlags): ForgeNetwork[] {
  return Object.values(NETWORKS).filter(
    (n) => n.kind !== "development" || flags.localChainEnabled,
  );
}

export function isDeploymentAllowed(network: ForgeNetwork, flags: NetworkFlags): boolean {
  if (network.kind === "mainnet") return flags.mainnetDeploymentsEnabled;
  if (network.kind === "development") return flags.localChainEnabled;
  return network.deploymentsEnabledByDefault;
}

export function explorerTxUrl(network: ForgeNetwork, hash: string): string | null {
  return network.explorerUrl ? `${network.explorerUrl}/tx/${hash}` : null;
}

export function explorerAddressUrl(network: ForgeNetwork, address: string): string | null {
  return network.explorerUrl ? `${network.explorerUrl}/address/${address}` : null;
}

/** Build a viem Chain, optionally overriding the RPC (custom RPC setting). */
export function toViemChain(network: ForgeNetwork, rpcOverride?: string | null): Chain {
  const rpc = rpcOverride || network.rpcUrls[0];
  return defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [rpc] } },
    blockExplorers: network.explorerUrl
      ? { default: { name: `${network.name} Explorer`, url: network.explorerUrl } }
      : undefined,
    testnet: network.kind !== "mainnet",
  });
}

/** Parameters for EIP-3085 `wallet_addEthereumChain`. */
export function toAddChainParams(network: ForgeNetwork, rpcOverride?: string | null) {
  return {
    chainId: `0x${network.chainId.toString(16)}`,
    chainName: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: [rpcOverride || network.rpcUrls[0]],
    blockExplorerUrls: network.explorerUrl ? [network.explorerUrl] : undefined,
  };
}

/**
 * Custom RPC URLs must be http(s). Plain http is only allowed for loopback
 * hosts so a typo cannot silently send traffic unencrypted over the internet.
 */
export function validateRpcUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Not a valid URL." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "RPC URLs must not contain credentials." };
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol === "https:" || (url.protocol === "http:" && loopback)) {
    return { ok: true, url: url.toString().replace(/\/$/, "") };
  }
  return { ok: false, error: "Use https:// (http:// is only allowed for localhost)." };
}
