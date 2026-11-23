"use client";

import Link from "next/link";
import { FileCode2, FolderGit2, GitBranch, Plus, Rocket, Workflow } from "lucide-react";
import { Badge, ButtonLink, EmptyState, ErrorState, LoadingBlock, PageHeader, timeAgo } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import type { Project } from "@/lib/types";

type Row = Project & { stats: { deployments: number; runbooks: number } };

export default function ProjectsPage() {
  const { data, error, loading, reload } = useApi<{ projects: Row[] }>("/projects");
  return (
    <>
      <PageHeader
        title="Projects"
        description="Solidity projects 4ORGE can compile, test and deploy."
        actions={<ButtonLink href="/projects/new" variant="primary" icon={<Plus className="size-4" />}>New project</ButtonLink>}
      />
      {loading && !data && <LoadingBlock />}
      {error && <ErrorState error={error} retry={reload} />}
      {data && data.projects.length === 0 && (
        <EmptyState
          icon={<FolderGit2 className="size-5" />}
          title="No projects yet"
          description="Create a project from a template, upload an existing Hardhat or Foundry folder, or import a GitHub repository."
          action={<ButtonLink href="/projects/new" variant="primary">Create project</ButtonLink>}
        />
      )}
      {data && data.projects.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.projects.map((p) => {
            const contracts = p.detection.contracts.filter((c) => c.kind === "contract");
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="group rounded-2xl border border-line/70 bg-panel p-5 shadow-card transition-colors hover:border-line-strong hover:bg-panel-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-text group-hover:text-accent">{p.name}</h3>
                    <p className="mt-0.5 line-clamp-2 min-h-[2.5em] text-xs text-muted">{p.description || "No description"}</p>
                  </div>
                  {p.source === "github" ? <Badge tone="neutral"><GitBranch className="size-3" />GitHub</Badge> : <Badge>{p.source}</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="accent">{p.detection.framework}</Badge>
                  {p.compiler.version && <Badge>solc {p.compiler.version}</Badge>}
                  {p.lastBuildId ? <Badge tone="ok">built</Badge> : <Badge tone="neutral">not built</Badge>}
                </div>
                <div className="mt-4 flex items-center gap-4 border-t border-line pt-3 text-xs text-muted">
                  <span className="flex items-center gap-1"><FileCode2 className="size-3.5" />{contracts.length} contracts</span>
                  <span className="flex items-center gap-1"><Workflow className="size-3.5" />{p.stats.runbooks}</span>
                  <span className="flex items-center gap-1"><Rocket className="size-3.5" />{p.stats.deployments}</span>
                  <span className="ml-auto text-faint">{timeAgo(p.updatedAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
