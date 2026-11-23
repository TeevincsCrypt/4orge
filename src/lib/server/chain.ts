import "server-only";
import {
  createPublicClient,
  encodeDeployData,
  formatEther,
  http,
  type Hex,
  type PublicClient,
} from "viem";
import { getNetwork, isDeploymentAllowed, toViemChain, type NetworkId } from "@/lib/networks";
import type { ContractArtifact, PreparedDeployment } from "@/lib/types";
import { getConfig } from "./config";

function clientForUrl(networkId: NetworkId, url: string): PublicClient {
  return createPublicClient({
    chain: toViemChain(getNetwork(networkId), url),
    transport: http(url, { timeout: 15_000, retryCount: 1 }),
  });
}

export interface EndpointResult {
  url: string;
  ok: boolean;
  chainId: number | null;
  blockNumber: string | null;
  latencyMs: number | null;
  error: string | null;
}

/** Ask one RPC endpoint for its chain ID and latest block. */
export async function probeRpc(networkId: NetworkId, url: string): Promise<EndpointResult> {
  const expected = getNetwork(networkId).chainId;
  const started = Date.now();
  try {
    const client = clientForUrl(networkId, url);
    const [chainId, blockNumber] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    const ok = chainId === expected;
    return {
      url,
      ok,
      chainId,
      blockNumber: blockNumber.toString(),
      latencyMs: Date.now() - started,
      error: ok ? null : `reports chain ID ${chainId}, expected ${expected}`,
    };
  } catch (e) {
    return { url, ok: false, chainId: null, blockNumber: null, latencyMs: null, error: describeRpcError(e) };
  }
}

const chosen = new Map<string, { url: string; at: number }>();

/**
 * Pick the RPC endpoint to use: the custom RPC if one is set, otherwise the
 * first configured endpoint (in priority order) that answers with the right
 * chain ID. All candidates are probed in parallel; the choice is cached briefly.
 */
async function resolveRpc(networkId: NetworkId, rpcOverride?: string | null) {
  const network = getNetwork(networkId);
  const candidates = rpcOverride ? [rpcOverride] : network.rpcUrls;
  const results = await Promise.all(candidates.map((u) => probeRpc(networkId, u)));
  const best = results.find((r) => r.ok) ?? null;
  if (best) chosen.set(`${networkId}|${rpcOverride ?? ""}`, { url: best.url, at: Date.now() });
  return { best, results };
}

/** Viem client on a verified endpoint (throws a descriptive error if none works). */
export async function publicClientFor(networkId: NetworkId, rpcOverride?: string | null): Promise<PublicClient> {
  const key = `${networkId}|${rpcOverride ?? ""}`;
  const cached = chosen.get(key);
  if (cached && Date.now() - cached.at < 60_000) return clientForUrl(networkId, cached.url);
  const { best, results } = await resolveRpc(networkId, rpcOverride);
  if (!best) {
    throw new Error(`No working RPC endpoint for ${getNetwork(networkId).name}: ${results.map((r) => `${new URL(r.url).host} (${r.error})`).join("; ")}`);
  }
  return clientForUrl(networkId, best.url);
}

export interface NetworkCheck {
  ok: boolean;
  networkId: NetworkId;
  expectedChainId: number;
  actualChainId: number | null;
  blockNumber: string | null;
  latencyMs: number | null;
  rpcUrl: string;
  deploymentsAllowed: boolean;
  error: string | null;
  endpoints: EndpointResult[];
}

export async function checkNetwork(networkId: NetworkId, rpcOverride?: string | null): Promise<NetworkCheck> {
  const network = getNetwork(networkId);
  const { best, results } = await resolveRpc(networkId, rpcOverride);
  const deploymentsAllowed = isDeploymentAllowed(network, getConfig().networkFlags);
  if (best) {
    return {
      ok: true,
      networkId,
      expectedChainId: network.chainId,
      actualChainId: best.chainId,
      blockNumber: best.blockNumber,
      latencyMs: best.latencyMs,
      rpcUrl: best.url,
      deploymentsAllowed,
      error: null,
      endpoints: results,
    };
  }
  const wrongChain = results.find((r) => r.chainId !== null);
  return {
    ok: false,
    networkId,
    expectedChainId: network.chainId,
    actualChainId: wrongChain?.chainId ?? null,
    blockNumber: null,
    latencyMs: null,
    rpcUrl: results[0]?.url ?? "",
    deploymentsAllowed,
    error: wrongChain
      ? `RPC reports chain ID ${wrongChain.chainId}, expected ${network.chainId}. Refusing to use this endpoint.`
      : `No RPC endpoint answered from this server — ${results.map((r) => `${new URL(r.url).host}: ${r.error}`).join(" · ")}`,
    endpoints: results,
  };
}

/** Walk an error's cause chain and turn network failures into plain language. */
export function describeRpcError(e: unknown): string {
  const chain: Record<string, unknown>[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 6 && cur && typeof cur === "object"; i++) {
    chain.push(cur as Record<string, unknown>);
    cur = (cur as { cause?: unknown }).cause;
  }
  const status = chain.map((c) => c.status).find((s) => typeof s === "number") as number | undefined;
  if (status) {
    if (status === 403) return "HTTP 403 — the RPC refused this server (blocked or forbidden)";
    if (status === 429) return "HTTP 429 — rate limited by the RPC";
    if (status >= 500) return `HTTP ${status} — the RPC server is having problems`;
    return `HTTP ${status}`;
  }
  const code = chain.map((c) => c.code).find((c) => typeof c === "string") as string | undefined;
  const names = chain.map((c) => String(c.name ?? ""));
  const messages = chain.map((c) => String(c.message ?? "")).join(" ");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "host not found (DNS lookup failed)";
  if (code === "ECONNREFUSED") return "connection refused";
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return "connection reset by the server";
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || names.includes("TimeoutError") || /timed? ?out/i.test(messages)) {
    return "timed out (no answer within 15 s)";
  }
  if (code && /CERT|SSL|TLS/i.test(code)) return `TLS/certificate problem (${code})`;
  if (code) return `network error (${code})`;
  return shortError(e);
}

export function shortError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; details?: string };
  const base = (err.shortMessage || err.message || String(e)).split("\n")[0];
  const details = err.details && !base.includes(err.details) ? ` (${err.details})` : "";
  return `${base}${details}`.slice(0, 400);
}

export async function prepareDeployment(input: {
  networkId: NetworkId;
  rpcOverride?: string | null;
  artifact: ContractArtifact;
  args: unknown[];
  argsJson: unknown[];
  deployer: `0x${string}`;
}): Promise<{ prepared: PreparedDeployment; warnings: string[] }> {
  const { artifact, args, deployer } = input;
  if (artifact.hasUnlinkedLibraries) {
    throw new Error(`${artifact.name} needs external libraries to be linked; library linking is not supported yet.`);
  }
  if (artifact.bytecode === "0x" || artifact.bytecodeSize === 0) {
    throw new Error(`${artifact.name} is abstract or an interface and cannot be deployed.`);
  }
  const network = getNetwork(input.networkId);
  const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args } as unknown as Parameters<typeof encodeDeployData>[0]);
  const constructorArgsEncoded = `0x${data.slice(artifact.bytecode.length)}` as Hex;
  const client = await publicClientFor(input.networkId, input.rpcOverride);
  const warnings: string[] = [];

  const [gas, fees, balance] = await Promise.all([
    client.estimateGas({ account: deployer, data }).catch((e) => {
      throw new Error(`Gas estimation failed — the constructor would revert or the deployer cannot pay: ${shortError(e)}`);
    }),
    client.estimateFeesPerGas().catch(async () => ({ gasPrice: await client.getGasPrice() }) as { gasPrice: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }),
    client.getBalance({ address: deployer }),
  ]);
  const f = fees as { gasPrice?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint };
  const pricePerGas = f.maxFeePerGas ?? f.gasPrice ?? 0n;
  // Add a 20% safety margin to the gas limit; wallets may adjust further.
  const gasLimit = (gas * 120n) / 100n;
  const cost = gasLimit * pricePerGas;
  if (balance < cost) {
    warnings.push(
      `Deployer balance ${formatEther(balance)} ${network.nativeCurrency.symbol} may not cover the estimated maximum cost of ${formatEther(cost)} ${network.nativeCurrency.symbol}.`,
    );
  }
  if (artifact.bytecodeSize > 24_576) {
    warnings.push(`Runtime bytecode is ${artifact.bytecodeSize} bytes, above the EIP-170 limit of 24,576 bytes; the deployment will likely fail.`);
  }

  return {
    warnings,
    prepared: {
      chainId: network.chainId,
      network: network.id,
      from: deployer,
      data,
      gas: gasLimit.toString(),
      gasPrice: f.gasPrice?.toString() ?? null,
      maxFeePerGas: f.maxFeePerGas?.toString() ?? null,
      maxPriorityFeePerGas: f.maxPriorityFeePerGas?.toString() ?? null,
      estimatedCostWei: cost.toString(),
      balanceWei: balance.toString(),
      contractName: artifact.name,
      sourcePath: artifact.sourcePath,
      constructorArgs: input.argsJson,
      constructorArgsEncoded,
      buildId: artifact.buildId,
    },
  };
}

export type ReceiptCheck =
  | { state: "pending"; message: string }
  | {
      state: "confirmed";
      contractAddress: `0x${string}`;
      blockNumber: bigint;
      gasUsed: bigint;
      effectiveGasPrice: bigint | null;
      confirmations: bigint;
      checks: string[];
      warnings: string[];
    }
  | { state: "failed"; reason: string; blockNumber?: bigint; gasUsed?: bigint };

/**
 * Independently confirm a deployment from chain data. The transaction hash
 * reported by the wallet is only a pointer: we fetch the transaction and the
 * receipt from the RPC ourselves and verify every property that matters.
 */
export async function checkDeploymentReceipt(input: {
  networkId: NetworkId;
  rpcOverride?: string | null;
  txHash: `0x${string}`;
  expectedFrom: `0x${string}`;
  expectedData: `0x${string}`;
  expectedRuntimeSize: number;
  confirmations: number;
}): Promise<ReceiptCheck> {
  const network = getNetwork(input.networkId);
  const client = await publicClientFor(input.networkId, input.rpcOverride);

  let tx;
  try {
    tx = await client.getTransaction({ hash: input.txHash });
  } catch {
    return { state: "pending", message: "Transaction not yet visible on the RPC node." };
  }
  if (tx.to !== null) return { state: "failed", reason: "Transaction is not a contract creation (it has a recipient)." };
  if (tx.from.toLowerCase() !== input.expectedFrom.toLowerCase()) {
    return { state: "failed", reason: `Transaction was sent by ${tx.from}, not the approved deployer ${input.expectedFrom}.` };
  }
  if (tx.chainId !== undefined && tx.chainId !== network.chainId) {
    return { state: "failed", reason: `Transaction targets chain ${tx.chainId}, expected ${network.chainId}.` };
  }
  if (tx.input.toLowerCase() !== input.expectedData.toLowerCase()) {
    return { state: "failed", reason: "Transaction data does not match the prepared deployment bytecode and arguments." };
  }

  const receipt = await client.getTransactionReceipt({ hash: input.txHash }).catch(() => null);
  if (!receipt) return { state: "pending", message: "Waiting for the transaction to be mined…" };
  if (receipt.status !== "success") {
    return {
      state: "failed",
      reason: "Transaction was mined but reverted (status 0). The constructor failed or ran out of gas.",
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }
  if (!receipt.contractAddress) return { state: "failed", reason: "Receipt has no contract address." };

  const head = await client.getBlockNumber();
  const confirmations = head - receipt.blockNumber + 1n;
  if (confirmations < BigInt(input.confirmations)) {
    return { state: "pending", message: `Mined in block ${receipt.blockNumber}; ${confirmations}/${input.confirmations} confirmations.` };
  }

  const code = await client.getCode({ address: receipt.contractAddress });
  if (!code || code === "0x") return { state: "failed", reason: "No contract code exists at the reported address." };
  const warnings: string[] = [];
  const size = (code.length - 2) / 2;
  if (size !== input.expectedRuntimeSize) {
    warnings.push(`On-chain runtime code is ${size} bytes; the compiled runtime is ${input.expectedRuntimeSize} bytes.`);
  }
  return {
    state: "confirmed",
    contractAddress: receipt.contractAddress,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice ?? null,
    confirmations,
    checks: [
      "Transaction is a contract creation",
      "Sender matches the approved deployer",
      "Creation data matches the compiled bytecode + encoded constructor arguments",
      "Receipt status is success",
      `Contract code present at ${receipt.contractAddress} (${size} bytes)`,
    ],
    warnings,
  };
}
