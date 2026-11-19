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

export function publicClientFor(networkId: NetworkId, rpcOverride?: string | null): PublicClient {
  const network = getNetwork(networkId);
  return createPublicClient({
    chain: toViemChain(network, rpcOverride),
    transport: http(rpcOverride || network.rpcUrls[0], { timeout: 15_000, retryCount: 1 }),
  });
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
}

export async function checkNetwork(networkId: NetworkId, rpcOverride?: string | null): Promise<NetworkCheck> {
  const network = getNetwork(networkId);
  const rpcUrl = rpcOverride || network.rpcUrls[0];
  const base = {
    networkId,
    expectedChainId: network.chainId,
    rpcUrl,
    deploymentsAllowed: isDeploymentAllowed(network, getConfig().networkFlags),
  };
  const started = Date.now();
  try {
    const client = publicClientFor(networkId, rpcOverride);
    const [chainId, blockNumber] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    const ok = chainId === network.chainId;
    return {
      ...base,
      ok,
      actualChainId: chainId,
      blockNumber: blockNumber.toString(),
      latencyMs: Date.now() - started,
      error: ok ? null : `RPC reports chain ID ${chainId}, expected ${network.chainId}. Refusing to use this endpoint.`,
    };
  } catch (e) {
    return {
      ...base,
      ok: false,
      actualChainId: null,
      blockNumber: null,
      latencyMs: null,
      error: `RPC unreachable: ${shortError(e)}`,
    };
  }
}

export function shortError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; details?: string };
  return (err.shortMessage || err.details || err.message || String(e)).split("\n")[0].slice(0, 300);
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
  const client = publicClientFor(input.networkId, input.rpcOverride);
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
  const client = publicClientFor(input.networkId, input.rpcOverride);

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
