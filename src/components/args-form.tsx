"use client";

import { useEffect, useState } from "react";
import { constructorInputs, looksLikeQieName, normalizeQieName, parseConstructorArgs, placeholderFor } from "@/lib/abi-args";
import { api } from "@/lib/client/api";
import type { NetworkId } from "@/lib/networks";
import type { AbiItem } from "@/lib/types";
import { Input, Label, Select } from "./ui";

/**
 * Inputs for constructor arguments with live ABI type checking. Address
 * arguments accept a 0x address or a QIE ID (name.qie); names are previewed
 * here and resolved for real (and pinned) when the Runbook runs.
 */
export function ArgsForm({ abi, values, onChange, network }: { abi: AbiItem[]; values: unknown[]; onChange: (v: unknown[]) => void; network?: NetworkId }) {
  const inputs = constructorInputs(abi);
  if (!inputs.length) return <p className="text-sm text-muted">This constructor takes no arguments.</p>;
  const padded: unknown[] = inputs.map((_, i) => values[i] ?? "");
  const check = parseConstructorArgs(abi, padded, { allowUnresolvedNames: true });
  const errorFor = (i: number) => (!check.ok ? check.errors.find((e) => e.index === i)?.message : undefined);
  const set = (i: number, v: unknown) => {
    const next = [...padded];
    next[i] = v;
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {inputs.map((p, i) => {
        const raw = padded[i];
        const text = typeof raw === "string" ? raw : JSON.stringify(raw);
        const err = text !== "" ? errorFor(i) : undefined;
        return (
          <div key={i}>
            <Label htmlFor={`arg-${i}`} hint={<span className="mono">{p.type}</span>}>{p.name || `arg${i}`}</Label>
            {p.type === "bool" ? (
              <Select id={`arg-${i}`} value={String(raw)} onChange={(e) => set(i, e.target.value)}>
                <option value="">Select…</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            ) : (
              <Input
                id={`arg-${i}`}
                className="mono text-[13px]"
                value={text}
                placeholder={placeholderFor(p.type)}
                onChange={(e) => set(i, p.type.endsWith("]") || p.type === "tuple" ? safeJson(e.target.value) : e.target.value)}
                aria-invalid={Boolean(err)}
              />
            )}
            {err && <p className="mt-1 text-xs text-bad">{err}</p>}
            {!err && p.type === "address" && looksLikeQieName(text) && <QieNamePreview name={text} network={network} />}
            {!err && p.type === "address[]" && Array.isArray(raw) && raw.some(looksLikeQieName) && (
              <p className="mt-1 text-xs text-muted">QIE IDs in this list are looked up and locked in when the Runbook runs.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function safeJson(s: string): unknown {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) || (v && typeof v === "object") ? v : s;
  } catch {
    return s;
  }
}

export function argsValid(abi: AbiItem[], values: unknown[]): boolean {
  const n = constructorInputs(abi).length;
  return parseConstructorArgs(abi, Array.from({ length: n }, (_, i) => values[i] ?? ""), { allowUnresolvedNames: true }).ok;
}

type Preview = { state: "loading" } | { state: "ok"; address: string } | { state: "missing" } | { state: "error"; message: string };

/** Shows which address a QIE ID points to on the selected network (informational; the Runbook re-resolves and pins it). */
function QieNamePreview({ name, network }: { name: string; network?: NetworkId }) {
  const normalized = normalizeQieName(name);
  const [result, setResult] = useState<{ key: string; preview: Preview } | null>(null);
  const key = `${normalized}@${network}`;
  useEffect(() => {
    if (!normalized || !network) return;
    const handle = setTimeout(() => {
      api<{ address: string | null }>(`/qie-id/resolve?name=${encodeURIComponent(normalized)}&network=${network}`)
        .then((r) => setResult({ key, preview: r.address ? { state: "ok", address: r.address } : { state: "missing" } }))
        .catch((e) => setResult({ key, preview: { state: "error", message: (e as Error).message } }));
    }, 400);
    return () => clearTimeout(handle);
  }, [normalized, network, key]);
  if (!normalized || !network) return null;
  const preview: Preview = result?.key === key ? result.preview : { state: "loading" };
  if (preview.state === "loading") return <p className="mt-1 text-xs text-muted">Looking up {normalized}…</p>;
  if (preview.state === "missing") return <p className="mt-1 text-xs text-bad">{normalized} is not registered on this network.</p>;
  if (preview.state === "error") return <p className="mt-1 text-xs text-warn">{preview.message}</p>;
  return (
    <p className="mt-1 text-xs text-ok [overflow-wrap:anywhere]">
      {normalized} → <span className="mono">{preview.address}</span>
    </p>
  );
}
