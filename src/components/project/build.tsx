"use client";

import { useState } from "react";
import { Hammer } from "lucide-react";
import type { ProjectBundle } from "@/app/(app)/projects/[id]/page";
import { api, useApi } from "@/lib/client/api";
import type { Build, CompilerMessage, ContractArtifact } from "@/lib/types";
import { Badge, Button, Callout, Card, CardHeader, CodeBlock, StatusBadge, StatusIcon, timeAgo } from "../ui";

type BuildSummary = Omit<Build, "input">;

export function BuildPanel({ bundle, onChanged }: { bundle: ProjectBundle; onChanged: () => Promise<void> }) {
  const pid = bundle.project.id;
  const history = useApi<{ builds: BuildSummary[] }>(`/projects/${pid}/builds`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ build: BuildSummary; contracts: ContractArtifact[]; notes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = result?.build ?? bundle.lastBuild;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text">Compile with solc</div>
            <p className="text-xs text-muted">
              Compiler {bundle.project.compiler.version ?? "chosen from pragmas"} · optimizer {bundle.project.compiler.optimizer.enabled ? `on (${bundle.project.compiler.optimizer.runs} runs)` : "off"}
              {bundle.project.compiler.evmVersion ? ` · EVM ${bundle.project.compiler.evmVersion}` : ""}
              {bundle.project.compiler.viaIR ? " · via-IR" : ""}
            </p>
          </div>
          <Button
            variant="primary"
            loading={busy}
            icon={<Hammer className="size-4" />}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setResult(await api(`/projects/${pid}/compile`, { method: "POST", body: {} }));
                await Promise.all([onChanged(), history.reload()]);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Compiling…" : "Compile"}
          </Button>
        </Card>
        {error && <Callout tone="bad">{error}</Callout>}
        {result?.notes.map((n) => <Callout key={n} tone="blue">{n}</Callout>)}
        {!shown && !busy && <Callout>This project has not been compiled yet.</Callout>}
        {shown && <BuildResult build={shown} contracts={result?.contracts ?? (shown.id === bundle.lastBuild?.id ? bundle.contracts : [])} />}
      </div>
      <Card padded={false} className="h-fit">
        <CardHeader title="Build history" />
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
          {(history.data?.builds ?? []).map((b) => (
            <li key={b.id} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
              <StatusIcon status={b.status} />
              <span className="mono text-xs text-muted">{b.compilerVersion.split("+")[0]}</span>
              <span className="text-xs text-faint">{b.contractCount} contracts</span>
              <span className="ml-auto text-xs text-faint">{timeAgo(b.createdAt)}</span>
            </li>
          ))}
          {history.data?.builds.length === 0 && <li className="px-4 py-3 text-sm text-muted">No builds yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

function BuildResult({ build, contracts }: { build: BuildSummary; contracts: ContractArtifact[] }) {
  return (
    <Card padded={false}>
      <CardHeader
        title={<span className="flex items-center gap-2">Build <StatusBadge status={build.status} /></span>}
        description={`solc ${build.compilerVersion} · ${build.sourceCount} sources · ${build.durationMs} ms · ${timeAgo(build.createdAt)}`}
      />
      <div className="space-y-4 p-5">
        {build.errors.length > 0 && <Messages title={`${build.errors.length} error(s)`} messages={build.errors} tone="bad" />}
        {build.warnings.length > 0 && <Messages title={`${build.warnings.length} warning(s)`} messages={build.warnings} tone="warn" />}
        {build.status === "succeeded" && build.warnings.length === 0 && <Callout tone="ok">Compiled without errors or warnings.</Callout>}
        {contracts.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="bg-panel-2 text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Contract</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 text-right font-medium">Runtime size</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-3 py-2 text-text">{c.name}</td>
                    <td className="mono px-3 py-2 text-xs text-muted">{c.sourcePath}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted">
                      {c.bytecodeSize === 0 ? <Badge>interface/abstract</Badge> : `${c.bytecodeSize.toLocaleString()} B`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function Messages({ title, messages, tone }: { title: string; messages: CompilerMessage[]; tone: "bad" | "warn" }) {
  return (
    <div>
      <div className={`mb-2 text-xs font-medium ${tone === "bad" ? "text-bad" : "text-warn"}`}>{title}</div>
      <CodeBlock maxHeight="22rem">{messages.map((m) => m.formattedMessage).join("\n\n")}</CodeBlock>
    </div>
  );
}
