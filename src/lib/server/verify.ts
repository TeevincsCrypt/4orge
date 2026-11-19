import "server-only";
import { getNetwork, type NetworkId } from "@/lib/networks";
import type { Build, Deployment, VerificationStatus } from "@/lib/types";

/**
 * Source verification against Blockscout-compatible explorers.
 *
 * QIE's explorers (testnet.qie.digital / mainnet.qie.digital) are probed at
 * runtime: if `/api/v2/config/backend-version` answers like Blockscout, we
 * submit the exact Standard JSON input that 4ORGE compiled (so the bytecode
 * matches bit-for-bit) and then poll the explorer until it reports
 * `is_verified`. If the explorer does not expose that API we report
 * "unsupported" — we never claim a verification that the explorer did not
 * confirm.
 */

export interface VerifyResult {
  status: VerificationStatus;
  message: string;
}

const probeCache = new Map<string, { at: number; kind: "blockscout" | "none" | "unreachable"; detail: string }>();

export async function probeExplorer(networkId: NetworkId) {
  const network = getNetwork(networkId);
  if (!network.explorerUrl) return { kind: "none" as const, detail: "This network has no block explorer." };
  const cached = probeCache.get(networkId);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached;
  let result: { kind: "blockscout" | "none" | "unreachable"; detail: string };
  try {
    const res = await fetch(`${network.explorerUrl}/api/v2/config/backend-version`, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json" },
    });
    const body = (await res.json().catch(() => null)) as { backend_version?: string } | null;
    result =
      res.ok && body?.backend_version
        ? { kind: "blockscout", detail: `Blockscout ${body.backend_version}` }
        : { kind: "none", detail: `Explorer did not expose a Blockscout verification API (HTTP ${res.status}).` };
  } catch (e) {
    result = { kind: "unreachable", detail: `Explorer unreachable from this server: ${(e as Error).message}` };
  }
  probeCache.set(networkId, { at: Date.now(), ...result });
  return result;
}

async function isVerified(explorerUrl: string, address: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${explorerUrl}/api/v2/smart-contracts/${address}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { is_verified?: boolean };
    return body.is_verified === true;
  } catch {
    return null;
  }
}

export async function verifyDeployment(deployment: Deployment, build: Build | null): Promise<VerifyResult> {
  const network = getNetwork(deployment.network);
  if (!deployment.contractAddress || deployment.status !== "confirmed") {
    return { status: "failed", message: "Only confirmed deployments can be verified." };
  }
  if (!build?.input) {
    return { status: "failed", message: "The compiler input for this build is no longer available; recompile and redeploy to verify." };
  }
  const probe = await probeExplorer(deployment.network);
  if (probe.kind === "none") return { status: "unsupported", message: probe.detail };
  if (probe.kind === "unreachable") return { status: "failed", message: probe.detail };
  const explorer = network.explorerUrl!;

  if (await isVerified(explorer, deployment.contractAddress)) {
    return { status: "verified", message: `Source is verified on ${network.name} explorer.` };
  }

  const form = new FormData();
  form.append("compiler_version", `v${build.compilerVersion}`);
  form.append("contract_name", deployment.contractName);
  form.append("license_type", "none");
  form.append("autodetect_constructor_args", "false");
  form.append("constructor_args", deployment.constructorArgsEncoded.replace(/^0x/, ""));
  form.append("files[0]", new Blob([JSON.stringify(build.input)], { type: "application/json" }), "input.json");

  let res: Response;
  try {
    res = await fetch(
      `${explorer}/api/v2/smart-contracts/${deployment.contractAddress}/verification/via/standard-input`,
      { method: "POST", body: form, signal: AbortSignal.timeout(30_000) },
    );
  } catch (e) {
    return { status: "failed", message: `Could not submit verification: ${(e as Error).message}` };
  }
  const text = await res.text();
  if (!res.ok) {
    return { status: "failed", message: `Explorer rejected verification (HTTP ${res.status}): ${text.slice(0, 300)}` };
  }

  // Verification is asynchronous on Blockscout; poll briefly.
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    if (await isVerified(explorer, deployment.contractAddress)) {
      return { status: "verified", message: `Verified on ${network.name} explorer.` };
    }
  }
  return {
    status: "pending",
    message: "Submitted to the explorer; it has not confirmed verification yet. Use “Check verification” later.",
  };
}

export async function refreshVerification(deployment: Deployment): Promise<VerifyResult | null> {
  const network = getNetwork(deployment.network);
  if (!network.explorerUrl || !deployment.contractAddress) return null;
  const v = await isVerified(network.explorerUrl, deployment.contractAddress);
  if (v === true) return { status: "verified", message: `Verified on ${network.name} explorer.` };
  if (v === false) return { status: "pending", message: "Explorer has not verified this contract yet." };
  return null;
}
