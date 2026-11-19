"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Workflow } from "lucide-react";
import { Badge, Button, ButtonLink, Callout, Card, EmptyState, ErrorState, Label, LoadingBlock, PageHeader, Select, StatusBadge, timeAgo } from "@/components/ui";
import { api, useApi } from "@/lib/client/api";
import type { Project, Runbook } from "@/lib/types";
import { STEP_SPECS } from "@/lib/runbook/steps";

type Row = Runbook & { projectName: string; executionCount: number; lastExecution: { id: string; status: string; createdAt: string } | null };

export default function RunbooksPage() {
  const { data, error, loading, reload } = useApi<{ runbooks: Row[] }>("/runbooks");
  const projects = useApi<{ projects: Project[] }>("/projects");
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [template, setTemplate] = useState<"checks-only" | "full-deploy">("checks-only");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  return (
    <>
      <PageHeader
        title="Runbooks"
        description="Reusable, validated deployment workflows. Every step comes from an allowlist; wallet steps always require your signature."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setShowNew((s) => !s)}>New Runbook</Button>}
      />
      {showNew && (
        <Card className="mb-6">
          <form
            className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!projectId) return;
              setBusy(true);
              setErr(null);
              try {
                const p = projects.data!.projects.find((x) => x.id === projectId)!;
                const contract = p.detection.contracts.find((c) => c.kind === "contract");
                const r = await api<{ runbook: Runbook }>("/runbooks", {
                  body: {
                    projectId,
                    template,
                    name: template === "full-deploy" ? `Deploy ${contract?.name ?? p.name}` : `${p.name} checks`,
                    contract: template === "full-deploy" ? contract?.name : undefined,
                    source: template === "full-deploy" ? contract?.path : undefined,
                  },
                });
                router.push(`/runbooks/${r.runbook.id}`);
              } catch (e2) {
                setErr((e2 as Error).message);
                setBusy(false);
              }
            }}
          >
            <div>
              <Label htmlFor="rp">Project</Label>
              <Select id="rp" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                <option value="">Select a project…</option>
                {projects.data?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="rt">Start from</Label>
              <Select id="rt" value={template} onChange={(e) => setTemplate(e.target.value as typeof template)}>
                <option value="checks-only">Checks only (validate → compile → test)</option>
                <option value="full-deploy">Full deployment (… → wallet → confirm → verify)</option>
              </Select>
            </div>
            <Button variant="primary" loading={busy} disabled={!projectId}>Create</Button>
            {err && <Callout tone="bad" className="sm:col-span-3">{err}</Callout>}
            {projects.data?.projects.length === 0 && <Callout className="sm:col-span-3">Create a project first.</Callout>}
          </form>
        </Card>
      )}
      {loading && !data && <LoadingBlock />}
      {error && <ErrorState error={error} retry={reload} />}
      {data && data.runbooks.length === 0 && !showNew && (
        <EmptyState
          icon={<Workflow className="size-5" />}
          title="No Runbooks yet"
          description="Create one from a template, or start a deployment — 4ORGE saves the deployment as a reusable Runbook."
          action={
            <>
              <Button onClick={() => setShowNew(true)}>New Runbook</Button>
              <ButtonLink href="/deploy" variant="primary">Start deployment</ButtonLink>
            </>
          }
        />
      )}
      {data && data.runbooks.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.runbooks.map((r) => (
            <Link key={r.id} href={`/runbooks/${r.id}`} className="rounded-lg border border-line bg-panel p-4 hover:border-line-strong hover:bg-panel-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text">{r.name}</div>
                  <div className="text-xs text-muted">{r.projectName}</div>
                </div>
                <Badge tone={r.definition.network === "qie-mainnet" ? "warn" : "blue"}>{r.definition.network}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {r.definition.steps.map((s) => (
                  <span key={s.id} className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] text-muted" title={STEP_SPECS[s.uses].title}>
                    {s.id}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-faint">
                {r.lastExecution ? <><StatusBadge status={r.lastExecution.status} /> last run {timeAgo(r.lastExecution.createdAt)}</> : "Never run"}
                <span className="ml-auto">{r.executionCount} runs</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
