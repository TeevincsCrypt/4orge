"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, FlaskConical, MoreHorizontal, Plus, Radio, Rocket, Search, Wallet } from "lucide-react";
import { ActivityChart, type TimelineEvent } from "@/components/activity-chart";
import { useApp } from "@/components/app-context";
import { useWallet } from "@/components/wallet/wallet-provider";
import { Avatar, Badge, ButtonLink, Card, cn, ErrorState, LoadingBlock, PageHeader, ProgressRing, StatTile, StatusBadge } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import { getNetwork } from "@/lib/networks";
import type { Project, RunbookExecution } from "@/lib/types";

interface Overview {
  stats: { projects: number; deployments: number; confirmed: number; failed: number; pending: number; runbooks: number; activeExecutions: number };
  timeline: TimelineEvent[];
  latestTest: { passed: number; failed: number; status: string; createdAt: string } | null;
}

type ProjectRow = Project & { stats: { deployments: number; runbooks: number } };
type ExecRow = Pick<RunbookExecution, "id" | "runbookId" | "projectId" | "runbookName" | "network" | "status" | "steps" | "createdAt" | "finishedAt">;

export default function DashboardPage() {
  const overview = useApi<Overview>("/overview", { pollMs: 15_000 });
  const projects = useApi<{ projects: ProjectRow[] }>("/projects");
  const executions = useApi<{ executions: ExecRow[] }>("/executions?limit=100", { pollMs: 15_000 });
  const { config, network, rpcStatus } = useApp();
  const firstName = config?.storageMode === "supabase" && config.user ? config.user.label.split(/[@\s]/)[0] : null;

  const o = overview.data;
  return (
    <>
      <PageHeader
        title={firstName ? `Welcome, ${firstName}!` : "Welcome back!"}
        description="Your QIE smart-contract workspace — projects, Runbooks and every deployment in one place."
        actions={
          <>
            <ButtonLink href="/projects/new" icon={<Plus className="size-4" />}>New project</ButtonLink>
            <ButtonLink href="/deploy" variant="primary" icon={<Rocket className="size-4" />}>Start deployment</ButtonLink>
          </>
        }
      />

      {overview.loading && !o && <LoadingBlock />}
      {overview.error && !o && <ErrorState error={overview.error} retry={overview.reload} />}

      {o && o.stats.projects === 0 && <Onboarding />}

      {o && o.stats.projects > 0 && (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <StatTile
              pastel="pink"
              icon={<Rocket className="size-[18px]" />}
              label="Successful deployments"
              value={<>{o.stats.confirmed}<span className="text-muted">/{o.stats.deployments}</span></>}
              unit={o.stats.pending ? `${o.stats.pending} pending` : "on-chain"}
            />
            <StatTile
              pastel="lilac"
              icon={<FlaskConical className="size-[18px]" />}
              label="Latest test run"
              value={o.latestTest ? <>{o.latestTest.passed}<span className="text-muted">/{o.latestTest.passed + o.latestTest.failed}</span></> : "—"}
              unit={o.latestTest ? "tests passed" : "no runs yet"}
            />
            <StatTile
              pastel="blue"
              icon={<Radio className="size-[18px]" />}
              label={`${network.name} RPC`}
              value={rpcStatus ? (rpcStatus.ok ? rpcStatus.latencyMs : "Offline") : "…"}
              unit={rpcStatus?.ok ? `ms · block ${Number(rpcStatus.blockNumber).toLocaleString()}` : rpcStatus ? "unreachable" : "checking"}
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card padded={false}>
              <ActivityChart events={o.timeline} />
            </Card>
            <ProjectsCard projects={projects.data?.projects ?? []} />
          </div>

          <RunsTracker rows={executions.data?.executions ?? []} loading={executions.loading} />
        </div>
      )}
    </>
  );
}

function ProjectsCard({ projects }: { projects: ProjectRow[] }) {
  return (
    <Card padded={false} className="flex flex-col">
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <h2 className="text-[17px] font-medium tracking-tight text-text">Projects</h2>
        <Link href="/projects" className="text-[13px] text-muted hover:text-text">See all</Link>
      </div>
      <ul className="flex-1 px-6">
        {projects.slice(0, 4).map((p) => {
          const contracts = p.detection.contracts.filter((c) => c.kind === "contract").length;
          return (
            <li key={p.id} className="border-b border-line last:border-0">
              <Link href={`/projects/${p.id}`} className="group flex items-center gap-3 py-3">
                <Avatar name={p.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-text">{p.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {p.detection.framework} · {contracts} contract{contracts === 1 ? "" : "s"} · {p.stats.deployments} deployed
                  </span>
                </span>
                <span className="flex size-8 items-center justify-center rounded-lg text-faint group-hover:bg-panel-2 group-hover:text-text">
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="px-6 pt-2 pb-5">
        <ButtonLink href="/projects/new" className="w-full" icon={<Plus className="size-4" />}>New project</ButtonLink>
      </div>
    </Card>
  );
}

const PERIODS = { week: { label: "Week", days: 7 }, month: { label: "Month", days: 31 }, all: { label: "All time", days: Infinity } } as const;

function duration(e: ExecRow) {
  const end = e.finishedAt ? new Date(e.finishedAt).getTime() : null;
  if (!end) return "in progress";
  const s = Math.max(0, Math.round((end - new Date(e.createdAt).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

function RunsTracker({ rows, loading }: { rows: ExecRow[]; loading: boolean }) {
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<keyof typeof PERIODS>("month");
  const [now] = useState(() => Date.now());
  const active = rows.filter((r) => ["running", "awaiting_confirmation", "awaiting_wallet"].includes(r.status)).length;
  const filtered = useMemo(() => {
    const since = now - PERIODS[period].days * 86_400_000;
    const term = q.trim().toLowerCase();
    return rows.filter((r) => new Date(r.createdAt).getTime() >= since && (!term || r.runbookName.toLowerCase().includes(term)));
  }, [rows, q, period, now]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-[19px] font-medium tracking-tight text-text">Runbook runs</h2>
        {active > 0 && <span className="rounded-full bg-panel px-2.5 py-1 text-xs font-medium text-text shadow-card">+{active} active</span>}
        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search Runbook runs" className="h-9 w-40 rounded-full bg-transparent pr-3 pl-9 text-[13px] text-text placeholder:text-faint focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/10" />
          </div>
          <span className="h-5 w-px bg-line-strong" />
          <label className="relative flex items-center px-3 text-[13px] text-muted">
            <span className="sr-only">Period</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value as keyof typeof PERIODS)} className="cursor-pointer appearance-none bg-transparent pr-5 focus:outline-none">
              {Object.entries(PERIODS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 size-3.5" />
          </label>
        </div>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="text-[13px] text-muted">
              <th className="border-b border-line-strong/70 py-3 pr-4 font-normal">Name</th>
              <th className="border-b border-line-strong/70 px-4 py-3 font-normal">Progress</th>
              <th className="border-b border-line-strong/70 px-4 py-3 font-normal">Start date</th>
              <th className="border-b border-line-strong/70 px-4 py-3 font-normal">Start time</th>
              <th className="border-b border-line-strong/70 px-4 py-3 font-normal">Status</th>
              <th className="border-b border-line-strong/70 px-4 py-3 font-normal">Duration</th>
              <th className="border-b border-line-strong/70 py-3 pl-4 font-normal"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 12).map((r) => {
              const done = r.steps.filter((s) => ["succeeded", "warning", "skipped"].includes(s.status)).length;
              const pct = r.steps.length ? done / r.steps.length : 0;
              const at = new Date(r.createdAt);
              const href = `/runbooks/${r.runbookId}/executions/${r.id}`;
              return (
                <tr key={r.id} className="group">
                  <td className="border-b border-line-strong/50 py-4 pr-4">
                    <Link href={href} className="font-medium text-text hover:underline">{r.runbookName}</Link>
                    <span className="ml-2 text-[13px] text-muted">{getNetwork(r.network).shortName}</span>
                  </td>
                  <td className="border-b border-line-strong/50 px-4 py-4">
                    <span className="flex items-center gap-3">
                      <ProgressRing value={pct} tone={r.status === "failed" ? "bad" : r.status === "succeeded" ? "ok" : "accent"} />
                      <span className="text-text tabular-nums">{Math.round(pct * 100)}%</span>
                    </span>
                  </td>
                  <td className="border-b border-line-strong/50 px-4 py-4 text-text tabular-nums">{at.toLocaleDateString()}</td>
                  <td className="border-b border-line-strong/50 px-4 py-4 text-text tabular-nums">{at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="border-b border-line-strong/50 px-4 py-4"><StatusBadge status={r.status} /></td>
                  <td className="border-b border-line-strong/50 px-4 py-4 text-text">{duration(r)}</td>
                  <td className="border-b border-line-strong/50 py-4 pl-4 text-right">
                    <Link href={href} aria-label={`Open ${r.runbookName}`} className="inline-flex size-8 items-center justify-center rounded-full text-faint hover:bg-panel hover:text-text">
                      <MoreHorizontal className="size-5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            {rows.length === 0 ? "No Runbook has been run yet." : "No runs match this filter."}{" "}
            <Link href="/deploy" className="font-medium text-accent">Start a deployment →</Link>
          </p>
        )}
      </div>
    </section>
  );
}

function Onboarding() {
  const wallet = useWallet();
  const { network } = useApp();
  const steps = [
    { title: "Create or import a project", body: "Start from a template, upload a Hardhat/Foundry folder, or import a GitHub repository.", action: <ButtonLink href="/projects/new" variant="primary" size="sm">New project</ButtonLink>, done: false },
    { title: "Compile and test", body: "4ORGE compiles with the official Solidity compiler and runs your Hardhat 3 test suites in a sandbox.", done: false },
    {
      title: "Connect a wallet",
      body: "MetaMask or Rabby signs every deployment. 4ORGE never sees your keys.",
      action: wallet.address ? <Badge tone="ok">Connected</Badge> : <Badge><Wallet className="size-3" /> Use “Connect wallet” above</Badge>,
      done: Boolean(wallet.address),
    },
    { title: `Deploy to ${network.name}`, body: "Checks run automatically, you review, your wallet signs, and 4ORGE validates the receipt on-chain.", done: false },
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card padded={false} className="overflow-hidden">
        <div className="bg-pastel-lilac px-7 py-8">
          <span className="rounded-full bg-panel px-2.5 py-1 text-xs font-medium text-accent-strong">Getting started</span>
          <h2 className="mt-4 text-xl font-medium tracking-tight text-text">Ship your first contract to QIE Testnet</h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted">You have no projects yet, so there are no statistics to show. Each step below does real work against real compilers and the real chain.</p>
        </div>
        <ol>
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3 border-t border-line px-7 py-5 sm:flex-row sm:items-center">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-medium", s.done ? "bg-ok/10 text-ok" : "bg-panel-3 text-muted")}>{s.done ? "✓" : i + 1}</span>
              <div className="flex-1">
                <div className="text-[15px] font-medium text-text">{s.title}</div>
                <div className="text-sm text-muted">{s.body}</div>
              </div>
              {s.action}
            </li>
          ))}
        </ol>
      </Card>
      <div className="space-y-3">
        <StatTile pastel="pink" icon={<Rocket className="size-[18px]" />} label="Deployments" value="0" unit="yet" />
        <StatTile pastel="blue" icon={<Radio className="size-[18px]" />} label="Default network" value={network.shortName} unit={`chain ${network.chainId}`} />
        <Card className="text-sm text-muted">
          New to 4ORGE? Read the <Link href="/docs/getting-started" className="font-medium text-accent">getting started guide</Link> — it walks through wallet setup and the Testnet faucet.
        </Card>
      </div>
    </div>
  );
}
