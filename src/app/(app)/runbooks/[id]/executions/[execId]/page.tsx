"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther } from "viem";
import { ChevronRight, Download, FileText, PenLine, RotateCcw, ShieldCheck, Square, Wallet } from "lucide-react";
import { useApp } from "@/components/app-context";
import { Markdown } from "@/components/markdown";
import { WalletButton } from "@/components/shell";
import { useWallet } from "@/components/wallet/wallet-provider";
import { Badge, Button, Callout, Card, CardHeader, cn, CodeBlock, ErrorState, HexValue, LoadingBlock, PageHeader, StatusBadge, StatusIcon, timeAgo } from "@/components/ui";
import { api, useApi } from "@/lib/client/api";
import { explorerAddressUrl, explorerTxUrl, getNetwork } from "@/lib/networks";
import { CATEGORY_LABEL, STEP_SPECS, type StepType } from "@/lib/runbook/steps";
import type { ExecutionLog, RunbookExecution, StepState } from "@/lib/types";

interface Bundle {
  execution: RunbookExecution;
  logs: ExecutionLog[];
}

const ACTIVE = ["running", "awaiting_confirmation", "awaiting_wallet"];

export default function ExecutionPage() {
  const { id, execId } = useParams<{ id: string; execId: string }>();
  const res = useApi<Bundle>(`/executions/${execId}`);
  const [execution, setExecution] = useState<RunbookExecution | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [driving, setDriving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const wallet = useWallet();
  const drivingRef = useRef(false);

  useEffect(() => {
    if (res.data) {
      // Sync server snapshot into local state used by the driver loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExecution(res.data.execution);
      setLogs(res.data.logs);
    }
  }, [res.data]);

  const refresh = useCallback(async () => {
    const b = await api<Bundle>(`/executions/${execId}`);
    setExecution(b.execution);
    setLogs(b.logs);
    return b.execution;
  }, [execId]);

  const next = execution?.steps.find((s) => !["succeeded", "warning", "skipped"].includes(s.status));
  useEffect(() => {
    if (execution?.context.txHash) {
      try {
        localStorage.removeItem(`4orge.pending-tx.${execution.id}`);
      } catch {
        /* ignore */
      }
    }
  }, [execution?.context.txHash, execution?.id]);
  const needsWalletForPrepare = Boolean(next && next.uses === "deploy.prepare" && next.status === "pending" && !execution?.context.deployer && !wallet.address);

  // Drive server-side steps while the execution is running.
  useEffect(() => {
    if (!execution || execution.status !== "running" || drivingRef.current || needsWalletForPrepare) return;
    drivingRef.current = true;
     
    setDriving(true);
    const poll = setInterval(() => void refresh().catch(() => undefined), 2000);
    void api<{ execution: RunbookExecution }>(`/executions/${execution.id}/advance`, { body: { deployer: wallet.address ?? null } })
      .then((r) => setExecution(r.execution))
      .catch((e) => setActionError((e as Error).message))
      .finally(async () => {
        clearInterval(poll);
        drivingRef.current = false;
        setDriving(false);
        await refresh().catch(() => undefined);
      });
  }, [execution, refresh, wallet.address, needsWalletForPrepare]);

  if (res.loading && !execution) return <LoadingBlock />;
  if (res.error && !execution) return <ErrorState error={res.error} retry={res.reload} />;
  if (!execution) return null;
  const network = getNetwork(execution.network);
  const active = ACTIVE.includes(execution.status);

  async function act(path: string, body: unknown) {
    setActionError(null);
    try {
      const r = await api<{ execution: RunbookExecution }>(`/executions/${execution!.id}/${path}`, { body });
      setExecution(r.execution);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={<><Link href="/runbooks" className="hover:text-text">Runbooks</Link> · <Link href={`/runbooks/${id}`} className="hover:text-text">{execution.runbookName}</Link></>}
        title={<span className="flex flex-wrap items-center gap-3">Execution <StatusBadge status={execution.status} /></span>}
        description={`${network.name} (chain ${network.chainId}) · started ${timeAgo(execution.createdAt)}${execution.finishedAt ? ` · finished ${timeAgo(execution.finishedAt)}` : ""}`}
        actions={
          active && !execution.context.txHash ? (
            <Button variant="danger" size="sm" icon={<Square className="size-3.5" />} onClick={() => act("cancel", {})}>Cancel</Button>
          ) : undefined
        }
      />
      {actionError && <Callout tone="bad" className="mb-4">{actionError}</Callout>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          {needsWalletForPrepare && (
            <Callout tone="blue" title="Connect the deployer wallet to continue">
              The next step prepares the deployment transaction for a specific account. Connect MetaMask or Rabby — the execution resumes automatically.
              <div className="mt-2"><WalletButton /></div>
            </Callout>
          )}
          {execution.status === "awaiting_confirmation" && next && <ConfirmPanel execution={execution} step={next} onConfirm={(typed) => act("confirm", { stepId: next.stepId, typed })} />}
          {execution.status === "awaiting_wallet" && next && (
            <WalletPanel
              execution={execution}
              step={next}
              onResult={(body) => act("wallet", { stepId: next.stepId, ...body })}
            />
          )}
          {execution.status === "succeeded" && execution.context.contractAddress && (
            <Callout tone="ok" title={`${execution.context.prepared?.contractName ?? "Contract"} deployed and confirmed on ${network.name}`}>
              <div className="flex flex-wrap items-center gap-2">
                Address <HexValue value={execution.context.contractAddress} full href={explorerAddressUrl(network, execution.context.contractAddress)} />
              </div>
              {execution.context.deploymentId && <Link href={`/deployments/${execution.context.deploymentId}`}>View deployment record →</Link>}
            </Callout>
          )}

          <Card padded={false}>
            <CardHeader title="Steps" description={driving ? "Running server-side steps…" : undefined} />
            <ol className="divide-y divide-line">
              {execution.steps.map((s, i) => (
                <StepRow
                  key={s.stepId}
                  index={i}
                  state={s}
                  isNext={next?.stepId === s.stepId}
                  canRetry={s.status === "failed" && STEP_SPECS[s.uses as StepType].retryable && !(s.uses === "wallet.deploy" && execution.context.txHash)}
                  onRetry={() => act("retry", { stepId: s.stepId })}
                  network={network}
                />
              ))}
            </ol>
          </Card>

          {execution.context.report && <Report report={execution.context.report} name={execution.runbookName} />}
        </div>

        <Card padded={false} className="h-fit xl:sticky xl:top-20">
          <CardHeader title="Execution log" description={`${logs.length} entries`} />
          <LogView logs={logs} steps={execution.steps} />
        </Card>
      </div>
    </>
  );
}

function StepRow({ index, state, isNext, canRetry, onRetry, network }: { index: number; state: StepState; isNext: boolean; canRetry: boolean; onRetry: () => void; network: ReturnType<typeof getNetwork> }) {
  const spec = STEP_SPECS[state.uses as StepType];
  const [open, setOpen] = useState(false);
  const out = state.output as Record<string, unknown> | null;
  const tx = out?.txHash as string | undefined;
  const addr = out?.contractAddress as string | undefined;
  return (
    <li className={cn("px-5 py-3.5", isNext && state.status !== "failed" && "bg-accent-soft/40")}>
      <div className="flex items-start gap-3">
        <div className="pt-0.5"><StatusIcon status={state.status} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-faint">{index + 1}.</span>
            <span className="text-sm font-medium text-text">{spec.title}</span>
            <Badge tone={spec.category === "wallet" ? "accent" : spec.category === "human" ? "warn" : spec.category === "build" ? "blue" : "neutral"}>{CATEGORY_LABEL[spec.category]}</Badge>
            {state.attempts > 1 && <span className="text-[11px] text-faint">attempt {state.attempts}</span>}
          </div>
          {state.summary && <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">{state.summary}</p>}
          {state.error && <p className="mt-1 whitespace-pre-wrap text-sm text-bad [overflow-wrap:anywhere]">{state.error}</p>}
          {tx && <div className="mt-1 flex items-center gap-1 text-xs text-muted">tx <HexValue value={tx} href={explorerTxUrl(network, tx)} /></div>}
          {addr && <div className="mt-1 flex items-center gap-1 text-xs text-muted">address <HexValue value={addr} href={explorerAddressUrl(network, addr)} /></div>}
          {Array.isArray(out?.checks) && (
            <ul className="mt-2 space-y-0.5 text-xs text-ok">
              {(out!.checks as string[]).map((c) => <li key={c} className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" />{c}</li>)}
            </ul>
          )}
          {out && (
            <button onClick={() => setOpen((o) => !o)} className="mt-1.5 flex items-center gap-1 text-[11px] text-faint hover:text-muted">
              <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} /> Output
            </button>
          )}
          {open && out && <CodeBlock className="mt-2" maxHeight="14rem">{JSON.stringify(out, null, 2)}</CodeBlock>}
        </div>
        {canRetry && <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={onRetry}>Retry</Button>}
      </div>
    </li>
  );
}

function DeploymentSummary({ execution }: { execution: RunbookExecution }) {
  const p = execution.context.prepared;
  const network = getNetwork(execution.network);
  if (!p) return null;
  const sym = network.nativeCurrency.symbol;
  const rows: [string, React.ReactNode][] = [
    ["Contract", <span key="c" className="text-text">{p.contractName} <span className="mono text-xs text-faint">{p.sourcePath}</span></span>],
    ["Network", <span key="n" className="flex items-center gap-2 text-text">{network.name} <span className="mono text-xs text-faint">chain {p.chainId}</span>{network.kind === "mainnet" && <Badge tone="warn">real funds</Badge>}</span>],
    ["Deployer", <HexValue key="d" value={p.from} full />],
    ["Constructor args", <span key="a" className="mono break-all text-xs text-text">{JSON.stringify(p.constructorArgs)}</span>],
    ["Gas limit", <span key="g" className="mono text-xs text-text">{p.gas ?? "wallet estimate"}</span>],
    ["Max cost", <span key="m" className="text-text">{p.estimatedCostWei ? `${formatEther(BigInt(p.estimatedCostWei))} ${sym}` : "—"}</span>],
    ["Deployer balance", <span key="b" className="text-text">{p.balanceWei ? `${formatEther(BigInt(p.balanceWei))} ${sym}` : "—"}</span>],
    ["Creation data", <span key="x" className="text-xs text-muted">{((p.data.length - 2) / 2).toLocaleString()} bytes</span>],
  ];
  return (
    <dl className="divide-y divide-line rounded-xl border border-line text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <dt className="shrink-0 text-xs text-muted">{k}</dt>
          <dd className="min-w-0 sm:text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ConfirmPanel({ execution, step, onConfirm }: { execution: RunbookExecution; step: StepState; onConfirm: (typed?: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const def = execution.definition.steps.find((s) => s.id === step.stepId);
  const message = def?.uses === "human.confirm" ? def.with?.message : undefined;
  const mainnet = getNetwork(execution.network).kind === "mainnet";
  const ready = !mainnet || typed.trim() === "MAINNET";
  return (
    <Card padded={false} className={mainnet ? "border-bad/40" : "border-warn/40"}>
      <CardHeader title="Review before signing" description={message ?? "All automated checks have run. Confirm the deployment details below."} icon={<PenLine className="size-4" />} />
      <div className="space-y-4 p-5">
        <DeploymentSummary execution={execution} />
        {mainnet && (
          <Callout tone="bad" title="This is QIE Mainnet — real funds">
            Signing spends real QIE for gas, and the contract is deployed permanently and publicly. Double-check the constructor
            arguments above (owners, supplies). Type <b>MAINNET</b> to continue.
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="MAINNET"
              aria-label="Type MAINNET to confirm"
              className="mono mt-2 block h-10 w-48 rounded-xl border border-bad/30 bg-panel px-3 text-sm text-text focus:outline-none focus:ring-4 focus:ring-bad/10"
            />
          </Callout>
        )}
        <Button variant="primary" disabled={!ready} loading={busy} onClick={async () => { setBusy(true); await onConfirm(mainnet ? typed.trim() : undefined); setBusy(false); }}>
          I have reviewed this — continue to wallet
        </Button>
      </div>
    </Card>
  );
}

function WalletPanel({ execution, step, onResult }: { execution: RunbookExecution; step: StepState; onResult: (b: { txHash?: string; from?: string; error?: { code?: number; message: string } }) => Promise<void> }) {
  const wallet = useWallet();
  const { setNetworkId } = useApp();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const p = execution.context.prepared!;
  const network = getNetwork(execution.network);
  const wrongAccount = wallet.address && wallet.address.toLowerCase() !== p.from.toLowerCase();
  const wrongChain = wallet.address && wallet.chainId !== p.chainId;

  // Re-submit a hash that was broadcast but not yet recorded (e.g. the page was closed or the request failed).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`4orge.pending-tx.${execution.id}`);
      if (!raw) return;
      const pending = JSON.parse(raw) as { stepId: string; txHash: string; from: string };
      if (pending.stepId === step.stepId) void onResult({ txHash: pending.txHash, from: pending.from });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution.id, step.stepId]);
  return (
    <Card padded={false} className="border-accent/50">
      <CardHeader title="Wallet approval required" description="Your wallet will show its own confirmation. Nothing is sent unless you approve it there." icon={<Wallet className="size-4" />} />
      <div className="space-y-4 p-5">
        {network.kind === "mainnet" && <Callout tone="bad">QIE Mainnet: approving in your wallet spends real QIE. Check the network and amount in your wallet before you approve.</Callout>}
        <DeploymentSummary execution={execution} />
        {!wallet.address && <Callout tone="blue">Connect the deployer wallet ({p.from}) to sign. <span className="mt-2 block"><WalletButton /></span></Callout>}
        {wrongAccount && <Callout tone="warn">The connected account is {wallet.address}. Switch to {p.from} in your wallet — the transaction was prepared and gas-estimated for that account.</Callout>}
        {!wrongAccount && wrongChain && (
          <Callout tone="warn" title="Wrong network in wallet">
            Your wallet is on chain {wallet.chainId}; this deployment targets {network.name} (chain {p.chainId}).
            <div className="mt-2">
              <Button size="sm" onClick={async () => { try { setNetworkId(network.id); await wallet.switchNetwork(network.id); } catch (e) { setLocalError((e as Error).message); } }}>
                Switch wallet to {network.name}
              </Button>
            </div>
          </Callout>
        )}
        {localError && <Callout tone="bad">{localError}</Callout>}
        <Button
          variant="primary"
          disabled={!wallet.address || Boolean(wrongAccount) || Boolean(wrongChain)}
          loading={busy}
          icon={<PenLine className="size-4" />}
          onClick={async () => {
            setBusy(true);
            setLocalError(null);
            let hash: `0x${string}`;
            try {
              hash = await wallet.sendDeployment(p);
            } catch (e) {
              const err = e as { code?: number; message: string };
              // Report wallet-side failures (rejection, insufficient funds) so the step is marked failed and can be retried.
              await onResult({ error: { code: err.code, message: err.message } });
              setBusy(false);
              return;
            }
            // Persist the hash before reporting it, so a broadcast transaction is never lost.
            const key = `4orge.pending-tx.${execution.id}`;
            try {
              localStorage.setItem(key, JSON.stringify({ stepId: step.stepId, txHash: hash, from: wallet.address }));
            } catch {
              /* storage unavailable */
            }
            await onResult({ txHash: hash, from: wallet.address! });
            setBusy(false);
          }}
        >
          Sign & deploy with wallet
        </Button>
      </div>
    </Card>
  );
}

function LogView({ logs, steps }: { logs: ExecutionLog[]; steps: StepState[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only the log panel (scrollIntoView would also scroll the page).
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [logs.length]);
  const idx = new Map(steps.map((s, i) => [s.stepId, i + 1]));
  return (
    <div ref={box} className="mono max-h-[36rem] overflow-y-auto rounded-b-2xl bg-panel-2 p-4 text-[11.5px] leading-relaxed">
      {logs.map((l) => (
        <div key={l.id} className={cn("flex gap-2", l.level === "error" ? "text-bad" : l.level === "warn" ? "text-warn" : "text-[#3b3b50]")}>
          <span className="shrink-0 text-faint">{new Date(l.createdAt).toLocaleTimeString()}</span>
          {l.stepId && <span className="shrink-0 text-accent-strong">[{idx.get(l.stepId) ?? "·"}]</span>}
          <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{l.message}</span>
        </div>
      ))}
      {logs.length === 0 && <span className="text-faint">No log entries yet.</span>}
    </div>
  );
}

function Report({ report, name }: { report: string; name: string }) {
  return (
    <Card padded={false}>
      <CardHeader
        title="Report"
        icon={<FileText className="size-4" />}
        action={
          <Button
            size="sm"
            icon={<Download className="size-3.5" />}
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([report], { type: "text/markdown" }));
              a.download = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.md`;
              a.click();
            }}
          >
            Download .md
          </Button>
        }
      />
      <div className="p-5"><Markdown source={report} /></div>
    </Card>
  );
}
