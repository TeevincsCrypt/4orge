"use client";

import { useState } from "react";
import type { AbiItem, ContractArtifact } from "@/lib/types";
import { Badge, CodeBlock, Tabs } from "./ui";

export function signature(item: AbiItem): string {
  const params = (item.inputs ?? []).map((p) => `${p.type}${p.name ? ` ${p.name}` : ""}`).join(", ");
  if (item.type === "constructor") return `constructor(${params})`;
  if (item.type === "fallback" || item.type === "receive") return `${item.type}()`;
  const outs = item.outputs?.length ? ` → (${item.outputs.map((o) => o.type).join(", ")})` : "";
  return `${item.name}(${params})${outs}`;
}

export function AbiTable({ abi }: { abi: AbiItem[] }) {
  const order = ["constructor", "function", "event", "error", "fallback", "receive"];
  const sorted = [...abi].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  if (!sorted.length) return <p className="text-sm text-muted">Empty ABI.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <tbody>
          {sorted.map((item, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className="w-28 px-3 py-2 align-top">
                <Badge tone={item.type === "function" ? (item.stateMutability === "view" || item.stateMutability === "pure" ? "blue" : "accent") : item.type === "event" ? "ok" : item.type === "error" ? "bad" : "neutral"}>
                  {item.type === "function" ? item.stateMutability : item.type}
                </Badge>
              </td>
              <td className="mono px-3 py-2 text-text">{signature(item)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContractDetails({ contract }: { contract: ContractArtifact }) {
  const [tab, setTab] = useState<"abi" | "json" | "bytecode" | "runtime">("abi");
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Badge>{contract.fullyQualifiedName}</Badge>
        <Badge>solc {contract.compilerVersion}</Badge>
        <Badge tone={contract.bytecodeSize > 24576 ? "bad" : "neutral"}>{contract.bytecodeSize.toLocaleString()} bytes runtime</Badge>
        {contract.hasUnlinkedLibraries && <Badge tone="warn">needs library linking</Badge>}
        {contract.bytecodeSize === 0 && <Badge tone="warn">not deployable (abstract/interface)</Badge>}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "abi", label: "ABI", count: contract.abi.length },
          { id: "json", label: "ABI JSON" },
          { id: "bytecode", label: "Creation bytecode" },
          { id: "runtime", label: "Runtime bytecode" },
        ]}
      />
      {tab === "abi" && <AbiTable abi={contract.abi} />}
      {tab === "json" && <CodeBlock>{JSON.stringify(contract.abi, null, 2)}</CodeBlock>}
      {tab === "bytecode" && <CodeBlock maxHeight="18rem">{contract.bytecode}</CodeBlock>}
      {tab === "runtime" && <CodeBlock maxHeight="18rem">{contract.deployedBytecode}</CodeBlock>}
    </div>
  );
}
