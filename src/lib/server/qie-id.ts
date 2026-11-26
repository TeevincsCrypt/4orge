import "server-only";
import { getAddress, isAddress, zeroAddress } from "viem";
import { normalizeQieName } from "@/lib/abi-args";
import { getNetwork, type NetworkId } from "@/lib/networks";
import { HttpError } from "./http";

/**
 * QIE ID (`name.qie`) lookups through QIE's official QIE Wallet MCP server,
 * which reads the QIE ID record contracts on chain. It is called with a plain
 * JSON-RPC `tools/call` (`qie_resolve_name`), and the answer is validated
 * here: only a well-formed, non-zero 0x address is accepted.
 *
 * The endpoint can be overridden with FORGE_QIE_ID_RESOLVER_URL (https, or
 * http on localhost for tests).
 */
export const DEFAULT_QIE_ID_RESOLVER = "https://mcp.qie.digital/mcp";

export function resolverUrl(): string {
  const raw = process.env.FORGE_QIE_ID_RESOLVER_URL?.trim();
  if (!raw) return DEFAULT_QIE_ID_RESOLVER;
  try {
    const u = new URL(raw);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (u.protocol === "https:" || (u.protocol === "http:" && local)) return u.toString();
  } catch {
    /* fall through */
  }
  return DEFAULT_QIE_ID_RESOLVER;
}

/** The QIE ID network for a 4ORGE network, or null where QIE IDs don't exist (local chain). */
export function qieIdNetwork(networkId: NetworkId): "mainnet" | "testnet" | null {
  if (networkId === "qie-mainnet") return "mainnet";
  if (networkId === "qie-testnet") return "testnet";
  return null;
}

let nextId = 1;

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(resolverUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const timeout = (e as { name?: string }).name === "TimeoutError";
    throw new HttpError(502, "qie_id_unavailable", timeout ? "The QIE ID service did not answer in time." : "The QIE ID service could not be reached.");
  }
  if (!res.ok) throw new HttpError(502, "qie_id_unavailable", `The QIE ID service answered HTTP ${res.status}.`);
  const text = await res.text();
  // Streamable HTTP answers either as plain JSON or as server-sent events (`data:` lines).
  const payload = text.trimStart().startsWith("{")
    ? text
    : (text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .pop() ?? "");
  let body: {
    result?: { structuredContent?: Record<string, unknown>; isError?: boolean; content?: { type: string; text?: string }[] };
    error?: { message?: string };
  };
  try {
    body = JSON.parse(payload);
  } catch {
    throw new HttpError(502, "qie_id_unavailable", "The QIE ID service returned an unreadable answer.");
  }
  if (body.error) throw new HttpError(502, "qie_id_error", `QIE ID lookup failed: ${String(body.error.message ?? "unknown error").slice(0, 200)}`);
  if (body.result?.isError) {
    const msg = body.result.content?.find((c) => c.type === "text")?.text ?? "unknown error";
    throw new HttpError(502, "qie_id_error", `QIE ID lookup failed: ${msg.slice(0, 200)}`);
  }
  const sc = body.result?.structuredContent;
  if (!sc || typeof sc !== "object") throw new HttpError(502, "qie_id_unavailable", "The QIE ID service returned no result.");
  return sc;
}

/**
 * The address a QIE ID points to on a network, or null if the name isn't
 * registered (or points nowhere). Throws for malformed names, networks without
 * QIE IDs, and service failures, so callers never mistake an outage for "not registered".
 */
export async function resolveQieName(input: string, networkId: NetworkId): Promise<`0x${string}` | null> {
  const name = normalizeQieName(input);
  if (!name) throw new HttpError(400, "invalid_qie_name", `“${input.slice(0, 80)}” is not a valid QIE ID (e.g. alice.qie).`);
  const network = qieIdNetwork(networkId);
  if (!network) {
    throw new HttpError(400, "qie_id_unsupported_network", `QIE IDs only exist on QIE Mainnet and QIE Testnet, not on ${getNetwork(networkId).name}. Use a 0x address there.`);
  }
  const sc = await callTool("qie_resolve_name", { name, network });
  const address = sc.address;
  if (address === null || address === undefined || address === "") return null;
  if (typeof address !== "string" || !isAddress(address, { strict: false })) {
    throw new HttpError(502, "qie_id_error", `The QIE ID service returned an invalid address for ${name}.`);
  }
  const checksummed = getAddress(address);
  return checksummed === zeroAddress ? null : checksummed;
}
