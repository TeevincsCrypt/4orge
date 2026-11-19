"use client";

import { useState } from "react";
import { ChevronRight, Play } from "lucide-react";
import { useApp } from "../app-context";
import type { ProjectBundle } from "@/app/(app)/projects/[id]/page";
import { api, useApi } from "@/lib/client/api";
import type { TestRun } from "@/lib/types";
import { Button, Callout, Card, CardHeader, CodeBlock, Select, StatusBadge, StatusIcon, timeAgo } from "../ui";

export function TestsPanel({ bundle, onChanged }: { bundle: ProjectBundle; onChanged: () => Promise<void> }) {
  const pid = bundle.project.id;
  const { config } = useApp();
  const history = useApi<{ testRuns: TestRun[] }>(`/projects/${pid}/test-runs`);
  const [scope, setScope] = useState<"all" | "solidity" | "nodejs">(config?.testRunner === "solidity" ? "solidity" : "all");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<TestRun | null>(bundle.lastTestRun);
  const [error, setError] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const t = bundle.project.detection.testFiles;

  const suites = new Map<string, TestRun["tests"]>();
  for (const tc of run?.tests ?? []) {
    const k = `${tc.kind === "solidity" ? "Solidity" : "node:test"} · ${tc.suite}`;
    suites.set(k, [...(suites.get(k) ?? []), tc]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text">Run tests with Hardhat 3</div>
            <p className="text-xs text-muted">{t.solidity.length} Solidity test file(s) · {t.nodejs.length} TypeScript/JS test file(s). Runs in an isolated sandbox with a generated config.</p>
          </div>
          <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="w-40" aria-label="Test scope">
            <option value="all">All suites</option>
            <option value="solidity">Solidity only</option>
            <option value="nodejs" disabled={config?.testRunner !== "all"}>TypeScript/JS only</option>
          </Select>
          <Button
            variant="primary"
            loading={busy}
            icon={<Play className="size-4" />}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const r = await api<{ testRun: TestRun }>(`/projects/${pid}/test`, { body: { scope } });
                setRun(r.testRun);
                await Promise.all([onChanged(), history.reload()]);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Running…" : "Run tests"}
          </Button>
        </Card>
        {config?.testRunner === "solidity" && (
          <Callout tone="neutral">This server only runs Solidity tests: TypeScript/JS tests execute project code and are disabled on shared hosts.</Callout>
        )}
        {error && <Callout tone="bad">{error}</Callout>}
        {!run && !busy && <Callout>No tests have been run for this project yet.</Callout>}
        {run && (
          <Card padded={false}>
            <CardHeader
              title={<span className="flex items-center gap-2">Test run <StatusBadge status={run.status} /></span>}
              description={`${run.passed} passed · ${run.failed} failed${run.skipped ? ` · ${run.skipped} skipped` : ""} · ${(run.durationMs / 1000).toFixed(1)} s · ${timeAgo(run.createdAt)}${run.compilerVersion ? ` · solc ${run.compilerVersion}` : ""}`}
            />
            <div className="space-y-4 p-5">
              {run.errorMessage && <Callout tone={run.status === "no-tests" ? "warn" : "bad"}>{run.errorMessage}</Callout>}
              {[...suites.entries()].map(([suite, cases]) => (
                <div key={suite}>
                  <div className="mb-1.5 text-xs font-medium text-muted">{suite}</div>
                  <ul className="divide-y divide-line rounded-md border border-line">
                    {cases.map((c, i) => (
                      <li key={i} className="px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <StatusIcon status={c.status === "skipped" ? "skipped" : c.status} />
                          <span className="mono text-[13px] text-text">{c.name}</span>
                          {c.durationMs !== null && <span className="ml-auto text-xs text-faint">{c.durationMs} ms</span>}
                        </div>
                        {c.error && <pre className="mono mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-bad/[0.06] p-2.5 text-[12px] text-[#f6a7a7]">{c.error}</pre>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {run.output && (
                <div>
                  <button onClick={() => setShowOutput((s) => !s)} className="flex items-center gap-1 text-xs text-muted hover:text-text">
                    <ChevronRight className={`size-3.5 transition-transform ${showOutput ? "rotate-90" : ""}`} /> Raw Hardhat output
                  </button>
                  {showOutput && <CodeBlock className="mt-2">{run.output}</CodeBlock>}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
      <Card padded={false} className="h-fit">
        <CardHeader title="Test history" />
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
          {(history.data?.testRuns ?? []).map((r) => (
            <li key={r.id}>
              <button onClick={async () => setRun((await api<{ testRun: TestRun }>(`/test-runs/${r.id}`)).testRun)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-panel-2">
                <StatusIcon status={r.status} />
                <span className="text-xs text-muted">{r.passed}✓ {r.failed}✗</span>
                <span className="ml-auto text-xs text-faint">{timeAgo(r.createdAt)}</span>
              </button>
            </li>
          ))}
          {history.data?.testRuns.length === 0 && <li className="px-4 py-3 text-sm text-muted">No runs yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
