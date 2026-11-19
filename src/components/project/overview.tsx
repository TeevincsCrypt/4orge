"use client";

import { FileCode2, Hammer, TestTube2 } from "lucide-react";
import type { ProjectBundle } from "@/app/(app)/projects/[id]/page";
import { Badge, Button, Card, CardHeader, Callout, StatusBadge, timeAgo } from "../ui";

export function ProjectOverview({ bundle, goto }: { bundle: ProjectBundle; goto: (t: "files" | "build" | "tests" | "contracts") => void }) {
  const d = bundle.project.detection;
  const deployable = d.contracts.filter((c) => c.kind === "contract");
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {d.notes.length > 0 && (
          <Callout tone="warn" title="Detection notes">
            <ul className="list-disc pl-4">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </Callout>
        )}
        <Card padded={false}>
          <CardHeader title="Detected contracts" description="Found by parsing your Solidity sources (tests and scripts excluded)." icon={<FileCode2 className="size-4" />} />
          {d.contracts.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No contracts found.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.contracts.map((c) => (
                <li key={`${c.path}:${c.name}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="text-sm text-text">{c.name}</span>
                  <Badge tone={c.kind === "contract" ? "accent" : "neutral"}>{c.kind}</Badge>
                  <span className="mono ml-auto truncate text-xs text-faint">{c.path}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2 text-sm font-medium text-text"><Hammer className="size-4 text-faint" /> Last build</div>
            {bundle.lastBuild ? (
              <div className="mt-2 space-y-1 text-sm text-muted">
                <div className="flex items-center gap-2"><StatusBadge status={bundle.lastBuild.status} /> {timeAgo(bundle.lastBuild.createdAt)}</div>
                <div>solc {bundle.lastBuild.compilerVersion} · {bundle.lastBuild.contractCount} contracts · {bundle.lastBuild.warnings.length} warnings</div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Not compiled yet.</p>
            )}
            <Button size="sm" className="mt-3" onClick={() => goto("build")}>Open build</Button>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-sm font-medium text-text"><TestTube2 className="size-4 text-faint" /> Last test run</div>
            {bundle.lastTestRun ? (
              <div className="mt-2 space-y-1 text-sm text-muted">
                <div className="flex items-center gap-2"><StatusBadge status={bundle.lastTestRun.status} /> {timeAgo(bundle.lastTestRun.createdAt)}</div>
                <div>{bundle.lastTestRun.passed} passed · {bundle.lastTestRun.failed} failed · {(bundle.lastTestRun.durationMs / 1000).toFixed(1)} s</div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No tests run yet.</p>
            )}
            <Button size="sm" className="mt-3" onClick={() => goto("tests")}>Open tests</Button>
          </Card>
        </div>
      </div>
      <div className="space-y-6">
        <Card padded={false}>
          <CardHeader title="Project structure" />
          <dl className="space-y-2.5 px-5 py-4 text-sm">
            <Row k="Framework" v={d.framework} />
            <Row k="Config file" v={d.configFile ?? "—"} />
            <Row k="Source dirs" v={d.sourceDirs.join(", ") || "—"} />
            <Row k="Deployable contracts" v={String(deployable.length)} />
            <Row k="Solidity tests" v={String(d.testFiles.solidity.length)} />
            <Row k="TypeScript/JS tests" v={String(d.testFiles.nodejs.length)} />
            <Row k="Pragmas" v={d.pragmas.join(" · ") || "—"} />
            <Row k="npm dependencies" v={Object.keys(d.dependencies).filter((k) => !k.includes("hardhat") && k !== "viem").join(", ") || "—"} />
            {d.remappings.length > 0 && <Row k="Remappings" v={String(d.remappings.length)} />}
          </dl>
        </Card>
        {d.testFiles.solidity.length + d.testFiles.nodejs.length === 0 && (
          <Callout tone="warn" title="No tests detected">
            Compile the project, then use “Generate test” on the Contracts tab to create a starter Solidity test.
          </Callout>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="mono truncate text-right text-[12px] text-text" title={v}>{v}</dd>
    </div>
  );
}
