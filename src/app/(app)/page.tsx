"use client";

import Link from "next/link";
import { Activity, CheckCircle2, FolderGit2, Plus, Rocket, Wallet, Workflow, XCircle } from "lucide-react";
import { useApp } from "@/components/app-context";
import { useWallet } from "@/components/wallet/wallet-provider";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, ErrorState, HexValue, LoadingBlock, PageHeader, Stat, StatusBadge, StatusIcon, timeAgo } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import { explorerAddressUrl, getNetwork } from "@/lib/networks";
import type { Deployment } from "@/lib/types";

interface Overview {
  stats: { projects: number; deployments: number; confirmed: number; failed: number; pending: number; runbooks: number; activeExecutions: number };
  activeExecutions: { id: string; runbookId: string; runbookName: string; status: string; network: string; createdAt: string }[];
  recentDeployments: (Deployment & { projectName: string })[];
  recentProjects: { id: string; name: string; updatedAt: string }[];
  activity: { kind: string; id: string; at: string; title: string; status: string; href: string }[];
}

export default function OverviewPage() {
  const { data, error, loading, reload } = useApi<Overview>("/overview", { pollMs: 15_000 });
  const { network, rpcStatus } = useApp();
  const wallet = useWallet();

  return (
    <>
      <PageHeader
        title="Overview"
        description="Your QIE smart-contract workspace: projects, Runbooks and every deployment, in one place."
        actions={
          <>
            <ButtonLink href="/projects/new" icon={<Plus className="size-4" />}>
              New project
            </ButtonLink>
            <ButtonLink href="/deploy" variant="primary" icon={<Rocket className="size-4" />}>
              Start deployment
            </ButtonLink>
          </>
        }
      />

      {loading && !data && <LoadingBlock />}
      {error && !data && <ErrorState error={error} retry={reload} />}

      {data && data.stats.projects === 0 && <Onboarding />}

      {data && data.stats.projects > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Projects" value={data.stats.projects} icon={<FolderGit2 className="size-4" />} />
            <Stat label="Deployments" value={data.stats.deployments} hint={data.stats.pending ? `${data.stats.pending} pending` : "all recorded on-chain"} icon={<Rocket className="size-4" />} />
            <Stat label="Successful" value={data.stats.confirmed} tone={data.stats.confirmed ? "ok" : undefined} icon={<CheckCircle2 className="size-4" />} />
            <Stat label="Failed" value={data.stats.failed} tone={data.stats.failed ? "bad" : undefined} icon={<XCircle className="size-4" />} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card padded={false}>
                <CardHeader title="Recent deployments" icon={<Rocket className="size-4" />} action={<Link className="text-xs text-muted hover:text-text" href="/deployments">View all →</Link>} />
                {data.recentDeployments.length === 0 ? (
                  <div className="p-5">
                    <EmptyState title="No deployments yet" description="Run a deployment Runbook to put a contract on QIE Testnet." action={<ButtonLink href="/deploy" variant="primary" size="sm">Start deployment</ButtonLink>} />
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recentDeployments.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                        <StatusIcon status={d.status} />
                        <Link href={`/deployments/${d.id}`} className="min-w-0 flex-1 text-sm text-text hover:underline">
                          {d.contractName} <span className="text-muted">· {d.projectName}</span>
                        </Link>
                        {d.contractAddress ? <HexValue value={d.contractAddress} href={explorerAddressUrl(getNetwork(d.network), d.contractAddress)} /> : <StatusBadge status={d.status} />}
                        <Badge tone={d.network === "qie-mainnet" ? "warn" : "blue"}>{getNetwork(d.network).shortName}</Badge>
                        <span className="w-20 text-right text-xs text-faint">{timeAgo(d.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card padded={false}>
                <CardHeader title="Recent activity" icon={<Activity className="size-4" />} />
                <ul className="divide-y divide-line">
                  {data.activity.map((a) => (
                    <li key={`${a.kind}-${a.id}`}>
                      <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-panel-2">
                        <StatusIcon status={a.status} />
                        <span className="min-w-0 flex-1 truncate text-sm text-muted">{a.title}</span>
                        <span className="text-xs text-faint">{timeAgo(a.at)}</span>
                      </Link>
                    </li>
                  ))}
                  {data.activity.length === 0 && <li className="px-5 py-4 text-sm text-muted">No activity yet.</li>}
                </ul>
              </Card>
            </div>

            <div className="space-y-6">
              <Card padded={false}>
                <CardHeader title="Environment" />
                <dl className="space-y-3 px-5 py-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted">Network</dt>
                    <dd className="flex items-center gap-2 text-text">
                      <span className={`size-2 rounded-full ${rpcStatus?.ok ? "bg-ok" : rpcStatus ? "bg-bad" : "bg-faint"}`} />
                      {network.name}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted">RPC</dt>
                    <dd className="text-right text-xs text-text">
                      {rpcStatus ? (rpcStatus.ok ? `chain ${rpcStatus.actualChainId} · block ${rpcStatus.blockNumber}` : <span className="text-bad">unreachable</span>) : "checking…"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted">Wallet</dt>
                    <dd className="text-xs">{wallet.address ? <HexValue value={wallet.address} /> : <span className="text-faint">not connected</span>}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted">Deployments</dt>
                    <dd>{network.deploymentsAllowed ? <Badge tone="ok">enabled</Badge> : <Badge tone="warn">locked</Badge>}</dd>
                  </div>
                </dl>
              </Card>

              <Card padded={false}>
                <CardHeader title="Active Runbooks" icon={<Workflow className="size-4" />} action={<Link className="text-xs text-muted hover:text-text" href="/runbooks">All Runbooks →</Link>} />
                {data.activeExecutions.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">No Runbook is running. {data.stats.runbooks} saved.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.activeExecutions.map((e) => (
                      <li key={e.id}>
                        <Link href={`/runbooks/${e.runbookId}/executions/${e.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-panel-2">
                          <StatusIcon status={e.status} />
                          <span className="min-w-0 flex-1 truncate text-sm text-text">{e.runbookName}</span>
                          <StatusBadge status={e.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card padded={false}>
                <CardHeader title="Projects" icon={<FolderGit2 className="size-4" />} action={<Link className="text-xs text-muted hover:text-text" href="/projects">All →</Link>} />
                <ul className="divide-y divide-line">
                  {data.recentProjects.map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-panel-2">
                        <span className="truncate text-text">{p.name}</span>
                        <span className="text-xs text-faint">{timeAgo(p.updatedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Onboarding() {
  const wallet = useWallet();
  const { network } = useApp();
  const steps = [
    {
      title: "Create or import a project",
      body: "Start from a template, upload a Hardhat/Foundry folder, or import a GitHub repository.",
      action: <ButtonLink href="/projects/new" variant="primary" size="sm">New project</ButtonLink>,
      done: false,
    },
    {
      title: "Compile and test",
      body: "4ORGE compiles with the official Solidity compiler and runs your Hardhat 3 test suites in a sandbox.",
      done: false,
    },
    {
      title: "Connect a wallet",
      body: "MetaMask or Rabby signs every deployment. 4ORGE never sees your keys.",
      action: wallet.address ? <Badge tone="ok">Connected</Badge> : <Badge tone="neutral"><Wallet className="size-3" /> Use “Connect wallet” above</Badge>,
      done: Boolean(wallet.address),
    },
    {
      title: `Deploy to ${network.name}`,
      body: "Run a Runbook: checks run automatically, you confirm, your wallet signs, and 4ORGE verifies the receipt on-chain.",
      done: false,
    },
  ];
  return (
    <Card className="overflow-hidden" padded={false}>
      <div className="border-b border-line bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.12),transparent_60%)] px-6 py-8">
        <Badge tone="accent">Welcome</Badge>
        <h2 className="mt-3 text-lg font-semibold text-text">Ship your first contract to QIE Testnet</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">
          You have no projects yet, so there are no statistics to show. Follow these steps — each one does real work against real
          compilers and the real chain.
        </p>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${s.done ? "border-ok/40 bg-ok/10 text-ok" : "border-line-strong text-muted"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium text-text">{s.title}</div>
              <div className="text-sm text-muted">{s.body}</div>
            </div>
            {s.action}
          </li>
        ))}
      </ol>
    </Card>
  );
}
