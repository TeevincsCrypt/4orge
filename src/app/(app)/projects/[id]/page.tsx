"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FileCode2, GitBranch, Hammer, Rocket, TestTube2, Workflow } from "lucide-react";
import { Badge, ButtonLink, ErrorState, LoadingBlock, PageHeader, Tabs, timeAgo } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import type { Build, ContractArtifact, Deployment, Project, ProjectRepository, Runbook, TestRun } from "@/lib/types";
import { ProjectOverview } from "@/components/project/overview";
import { FilesPanel } from "@/components/project/files";
import { BuildPanel } from "@/components/project/build";
import { TestsPanel } from "@/components/project/tests";
import { ContractsPanel } from "@/components/project/contracts";
import { ProjectDeployments } from "@/components/project/deployments";
import { ProjectRunbooks } from "@/components/project/runbooks";
import { ProjectSettings } from "@/components/project/settings";

export interface ProjectBundle {
  project: Project;
  files: { id: string; path: string; size: number; sha256: string; updatedAt: string }[];
  repository: ProjectRepository | null;
  contracts: ContractArtifact[];
  lastBuild: Omit<Build, "input"> | null;
  lastTestRun: TestRun | null;
  deployments: Deployment[];
  runbooks: Runbook[];
}

const TABS = ["overview", "files", "build", "tests", "contracts", "deployments", "runbooks", "settings"] as const;
type Tab = (typeof TABS)[number];

export default function ProjectPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ProjectWorkspace />
    </Suspense>
  );
}

function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const initial = (search.get("tab") as Tab) ?? "overview";
  const [tab, setTabState] = useState<Tab>(TABS.includes(initial) ? initial : "overview");
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace(`/projects/${id}?tab=${t}`, { scroll: false });
  };
  const res = useApi<ProjectBundle>(`/projects/${id}`);

  if (res.loading && !res.data) return <LoadingBlock />;
  if (res.error && !res.data) return <ErrorState error={res.error} retry={res.reload} />;
  if (!res.data) return null;
  const b = res.data;
  const p = b.project;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/projects" className="hover:text-text">Projects</Link>}
        title={p.name}
        description={p.description || undefined}
        actions={
          <>
            {b.repository && (
              <a href={b.repository.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-muted hover:text-text">
                <GitBranch className="size-3.5" />
                {b.repository.owner}/{b.repository.repo}@{b.repository.ref}
                {b.repository.commitSha && <span className="mono text-faint">({b.repository.commitSha.slice(0, 7)})</span>}
              </a>
            )}
            <ButtonLink href={`/deploy?projectId=${p.id}`} variant="primary" icon={<Rocket className="size-4" />}>
              Deploy
            </ButtonLink>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        <Badge tone="accent">{p.detection.framework}</Badge>
        {p.detection.configFile && <Badge>{p.detection.configFile}</Badge>}
        <Badge>solc {p.compiler.version ?? "auto (from pragmas)"}</Badge>
        <Badge>{p.compiler.optimizer.enabled ? `optimizer · ${p.compiler.optimizer.runs} runs` : "optimizer off"}</Badge>
        {b.lastBuild && <Badge tone={b.lastBuild.status === "succeeded" ? "ok" : "bad"}>build {b.lastBuild.status} · {timeAgo(b.lastBuild.createdAt)}</Badge>}
        {b.lastTestRun && <Badge tone={b.lastTestRun.status === "passed" ? "ok" : b.lastTestRun.status === "no-tests" ? "warn" : "bad"}>tests {b.lastTestRun.status}</Badge>}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "files", label: <><FileCode2 className="size-3.5" />Files</>, count: b.files.length },
          { id: "build", label: <><Hammer className="size-3.5" />Build</> },
          { id: "tests", label: <><TestTube2 className="size-3.5" />Tests</> },
          { id: "contracts", label: "Contracts", count: b.contracts.length },
          { id: "deployments", label: "Deployments", count: b.deployments.length },
          { id: "runbooks", label: <><Workflow className="size-3.5" />Runbooks</>, count: b.runbooks.length },
          { id: "settings", label: "Settings" },
        ]}
      />
      {tab === "overview" && <ProjectOverview bundle={b} goto={setTab} />}
      {tab === "files" && <FilesPanel bundle={b} onChanged={res.reload} />}
      {tab === "build" && <BuildPanel bundle={b} onChanged={res.reload} />}
      {tab === "tests" && <TestsPanel bundle={b} onChanged={res.reload} />}
      {tab === "contracts" && <ContractsPanel bundle={b} onChanged={res.reload} goto={setTab} />}
      {tab === "deployments" && <ProjectDeployments deployments={b.deployments} />}
      {tab === "runbooks" && <ProjectRunbooks bundle={b} onChanged={res.reload} />}
      {tab === "settings" && <ProjectSettings bundle={b} onChanged={res.reload} />}
    </>
  );
}
