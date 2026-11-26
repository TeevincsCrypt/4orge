/**
 * Convert human-entered constructor arguments into values viem can ABI-encode,
 * with precise error messages. Inputs are JSON-friendly (strings, numbers,
 * booleans, arrays) so they can be stored in Runbooks and deployment records.
 */
import { getAddress, isAddress, isHex } from "viem";
import type { AbiItem, AbiParameter } from "./types";

export interface ArgError {
  index: number;
  name: string;
  message: string;
}

// ---------------------------------------------------------------- QIE ID (name.qie)
/**
 * QIE ID names (e.g. `alice.qie`) can stand in for an address. Parsing never
 * looks a name up itself: the server resolves names once, on the deployment's
 * network, and passes the resulting addresses in `names`, so the address that
 * is reviewed and signed is exactly the one that was resolved.
 */
const QIE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,62}\.qie$/;

export function looksLikeQieName(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase().endsWith(".qie");
}

/** Lower-cased, trimmed QIE ID, or null if it isn't a well-formed `name.qie`. */
export function normalizeQieName(value: string): string | null {
  const s = value.trim().toLowerCase();
  return QIE_NAME_RE.test(s) ? s : null;
}

export interface ParseArgsOptions {
  /** Resolved QIE IDs: normalized `name.qie` → 0x address. */
  names?: Record<string, string>;
  /** Accept names that are not in `names` yet (browser-side form checks). They are left as the name. */
  allowUnresolvedNames?: boolean;
  /** Called for every QIE ID found in an address position. */
  onName?: (name: string) => void;
}

/** The distinct QIE IDs used in address positions of these constructor arguments. */
export function collectQieNames(abi: AbiItem[], raw: unknown[]): string[] {
  const found = new Set<string>();
  parseConstructorArgs(abi, raw, { allowUnresolvedNames: true, onName: (n) => found.add(n) });
  return [...found];
}

export type ParseArgsResult =
  | { ok: true; values: unknown[] }
  | { ok: false; errors: ArgError[] };

export function getConstructor(abi: AbiItem[]): AbiItem | undefined {
  return abi.find((i) => i.type === "constructor");
}

export function constructorInputs(abi: AbiItem[]): AbiParameter[] {
  return getConstructor(abi)?.inputs ?? [];
}

export function isPayableConstructor(abi: AbiItem[]): boolean {
  return getConstructor(abi)?.stateMutability === "payable";
}

export function parseConstructorArgs(abi: AbiItem[], raw: unknown[], opts: ParseArgsOptions = {}): ParseArgsResult {
  const inputs = constructorInputs(abi);
  const errors: ArgError[] = [];
  if (raw.length !== inputs.length) {
    return {
      ok: false,
      errors: [
        {
          index: -1,
          name: "(arguments)",
          message: `Constructor expects ${inputs.length} argument(s) but ${raw.length} were provided.`,
        },
      ],
    };
  }
  const values = inputs.map((param, index) => {
    try {
      return coerce(param, raw[index], opts);
    } catch (e) {
      errors.push({ index, name: param.name || `arg${index}`, message: (e as Error).message });
      return undefined;
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

function coerce(param: AbiParameter, value: unknown, opts: ParseArgsOptions): unknown {
  const type = param.type;

  const arrayMatch = type.match(/^(.*)\[(\d*)\]$/);
  if (arrayMatch) {
    const inner: AbiParameter = { ...param, type: arrayMatch[1] };
    const list = typeof value === "string" ? parseJsonArray(value) : value;
    if (!Array.isArray(list)) throw new Error(`Expected an array for ${type}, e.g. ["a","b"].`);
    if (arrayMatch[2] !== "" && list.length !== Number(arrayMatch[2])) {
      throw new Error(`${type} needs exactly ${arrayMatch[2]} items, got ${list.length}.`);
    }
    return list.map((v, i) => {
      try {
        return coerce(inner, v, opts);
      } catch (e) {
        throw new Error(`item ${i}: ${(e as Error).message}`);
      }
    });
  }

  if (type === "tuple") {
    const comps = param.components ?? [];
    let v = typeof value === "string" ? safeJson(value) : value;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      v = comps.map((c) => obj[c.name ?? ""]);
    }
    if (!Array.isArray(v) || v.length !== comps.length) {
      throw new Error(`Expected a tuple of ${comps.length} values.`);
    }
    const arr = v;
    return comps.map((c, i) => coerce(c, arr[i], opts));
  }

  if (type === "address") {
    const s = String(value ?? "").trim();
    if (looksLikeQieName(s)) {
      const name = normalizeQieName(s);
      if (!name) throw new Error("Not a valid QIE ID. Use letters, digits, - or _ followed by .qie (e.g. alice.qie).");
      opts.onName?.(name);
      const resolved = opts.names?.[name];
      if (resolved) {
        if (!isAddress(resolved, { strict: false })) throw new Error(`${name} resolved to an invalid address.`);
        return getAddress(resolved);
      }
      if (opts.allowUnresolvedNames) return name;
      throw new Error(`${name} has not been resolved to an address.`);
    }
    if (!isAddress(s, { strict: false })) throw new Error("Not a valid 0x address (40 hex characters) or QIE ID (name.qie).");
    const body = s.slice(2);
    const mixedCase = /[a-f]/.test(body) && /[A-F]/.test(body);
    if (mixedCase && !isAddress(s, { strict: true })) {
      throw new Error("Address checksum is invalid — check for a typo.");
    }
    return getAddress(s);
  }

  if (type === "bool") {
    if (typeof value === "boolean") return value;
    const s = String(value ?? "").trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    throw new Error('Use true or false.');
  }

  if (type === "string") {
    if (typeof value !== "string") throw new Error("Expected text.");
    return value;
  }

  const intMatch = type.match(/^(u?)int(\d*)$/);
  if (intMatch) {
    const unsigned = intMatch[1] === "u";
    const bits = intMatch[2] ? Number(intMatch[2]) : 256;
    const n = toBigInt(value);
    const min = unsigned ? 0n : -(2n ** BigInt(bits - 1));
    const max = unsigned ? 2n ** BigInt(bits) - 1n : 2n ** BigInt(bits - 1) - 1n;
    if (n < min || n > max) throw new Error(`Out of range for ${type}.`);
    return n;
  }

  const bytesMatch = type.match(/^bytes(\d*)$/);
  if (bytesMatch) {
    const s = String(value ?? "").trim();
    if (!isHex(s, { strict: true }) || (s.length - 2) % 2 !== 0) {
      throw new Error("Expected 0x-prefixed hex with an even number of digits.");
    }
    if (bytesMatch[1]) {
      const size = Number(bytesMatch[1]);
      if ((s.length - 2) / 2 !== size) throw new Error(`${type} must be exactly ${size} bytes.`);
    }
    return s as `0x${string}`;
  }

  throw new Error(`Unsupported parameter type "${type}".`);
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Number is too large or not an integer — enter it as text.");
    return BigInt(value);
  }
  const s = String(value ?? "").trim().replace(/_/g, "");
  if (/^-?\d+$/.test(s) || /^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s);
  // Allow scientific shorthand like 1e18 for token amounts.
  const sci = s.match(/^(\d+)(?:\.(\d+))?e(\d+)$/i);
  if (sci) {
    const [, whole, frac = "", exp] = sci;
    const e = Number(exp);
    if (frac.length > e) throw new Error("Value is not an integer.");
    return BigInt(whole + frac.padEnd(e, "0"));
  }
  throw new Error("Expected an integer (e.g. 1000 or 1e18).");
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function parseJsonArray(s: string): unknown {
  const v = safeJson(s.trim());
  return v;
}

/** Make parsed values JSON-safe for storage (bigint → decimal string). */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  return value;
}

export function describeParam(p: AbiParameter): string {
  return `${p.type}${p.name ? ` ${p.name}` : ""}`;
}

export function placeholderFor(type: string): string {
  if (type.endsWith("]")) return '["…"]';
  if (type === "address") return "0x… or name.qie";
  if (type === "bool") return "true / false";
  if (type.startsWith("uint") || type.startsWith("int")) return "e.g. 1000 or 1e18";
  if (type.startsWith("bytes")) return "0x…";
  if (type === "tuple") return "[…]";
  return "text";
}
