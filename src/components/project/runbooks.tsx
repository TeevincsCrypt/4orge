"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Workflow } from "lucide-react";
import type { ProjectBundle } from "@/app/(app)/projects/[id]/page";
import { api } from "@/lib/client/api";
import type { Runbook } from "@/lib/types";
import { Badge, Button, Callout, Card, EmptyState, timeAgo } from "../ui";

export function ProjectRunbooks({ bundle }: { bundle: ProjectBundle; onChanged: () => Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ runbook: Runbook }>("/runbooks", {
        body: { projectId: bundle.project.id, template: "checks-only", name: `${bundle.project.name} checks` },
      });
      router.push(`/runbooks/${r.runbook.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {error && <Callout tone="bad">{error}</Callout>}
      {bundle.runbooks.length === 0 ? (
        <EmptyState
          icon={<Workflow className="size-5" />}
          title="No Runbooks for this project"
          description="A Runbook is a reusable, validated workflow — e.g. validate → compile → test → deploy → verify."
          action={
            <>
              <Button onClick={create} loading={busy} icon={<Plus className="size-4" />}>Checks-only Runbook</Button>
              <Link href={`/deploy?projectId=${bundle.project.id}`} className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-white hover:bg-[#2a2a35]">Deployment Runbook</Link>
            </>
          }
        />
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={create} loading={busy} icon={<Plus className="size-3.5" />}>New checks Runbook</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {bundle.runbooks.map((r) => (
              <Link key={r.id} href={`/runbooks/${r.id}`}>
                <Card className="hover:border-line-strong">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text">{r.name}</span>
                    <Badge tone="blue">{r.definition.network}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{r.definition.steps.length} steps{r.definition.target ? ` · deploys ${r.definition.target.contract}` : ""}</p>
                  <p className="mt-2 text-xs text-faint">Updated {timeAgo(r.updatedAt)}</p>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
