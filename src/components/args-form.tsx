"use client";

import { constructorInputs, parseConstructorArgs, placeholderFor } from "@/lib/abi-args";
import type { AbiItem } from "@/lib/types";
import { Input, Label, Select } from "./ui";

/** Inputs for constructor arguments with live ABI type checking. */
export function ArgsForm({ abi, values, onChange }: { abi: AbiItem[]; values: unknown[]; onChange: (v: unknown[]) => void }) {
  const inputs = constructorInputs(abi);
  if (!inputs.length) return <p className="text-sm text-muted">This constructor takes no arguments.</p>;
  const padded: unknown[] = inputs.map((_, i) => values[i] ?? "");
  const check = parseConstructorArgs(abi, padded);
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
  return parseConstructorArgs(abi, Array.from({ length: n }, (_, i) => values[i] ?? "")).ok;
}
