"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Play, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { useApp } from "@/components/app-context";
import { ArgsForm } from "@/components/args-form";
import { useWallet } from "@/components/wallet/wallet-provider";
import { Badge, Button, Callout, Card, CardHeader, cn, ErrorState, Input, Label, LoadingBlock, PageHeader, Select, StatusBadge, Tabs, Textarea, timeAgo } from "@/components/ui";
import { api, ApiError, useApi } from "@/lib/client/api";
import type { RunbookDefinition, RunbookStep } from "@/lib/runbook/schema";
import { CATEGORY_LABEL, STEP_SPECS, STEP_TYPES, type StepCategory, type StepType } from "@/lib/runbook/steps";
import { defaultStepId, makeStep, parseRunbookText, runbookToYaml, validateRunbook } from "@/lib/runbook/validate";
import type { ContractArtifact, Project, Runbook, RunbookExecution } from "@/lib/types";

const CATEGORY_TONE: Record<StepCategory, "neutral" | "blue" | "accent" | "warn"> = {
  "read-only": "neutral",
  build: "blue",
  wallet: "accent",
  human: "warn",
};

interface Bundle {
  runbook: Runbook;
  project: Project | null;
  executions: Pick<RunbookExecution, "id" | "status" | "network" | "createdAt" | "finishedAt">[];
}

export default function RunbookEditorPage() {
  const { id } = useParams<{ id: string }>();
  const res = useApi<Bundle>(`/runbooks/${id}`);
  if (res.loading && !res.data) return <LoadingBlock />;
  if (res.error && !res.data) return <ErrorState error={res.error} retry={res.reload} />;
  if (!res.data) return null;
  return <Editor key={res.data.runbook.updatedAt} bundle={res.data} reload={res.reload} />;
}

function Editor({ bundle, reload }: { bundle: Bundle; reload: () => Promise<void> }) {
  const router = useRouter();
  const { networks } = useApp();
  const wallet = useWallet();
  const [def, setDef] = useState<RunbookDefinition>(bundle.runbook.definition);
  const [view, setView] = useState<"visual" | "json" | "yaml">("visual");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [importText, setImportText] = useState("");
  const project = bundle.project;
  const contractsRes = useApi<{ contracts: ContractArtifact[] }>(project ? `/projects/${project.id}` : null);
  const contracts = useMemo(() => (contractsRes.data?.contracts ?? []).filter((c) => c.bytecodeSize > 0), [contractsRes.data]);
  const validation = useMemo(() => validateRunbook(def), [def]);
  const dirty = JSON.stringify(def) !== JSON.stringify(bundle.runbook.definition);
  const deploys = def.steps.some((s) => s.uses === "wallet.deploy" || s.uses === "deploy.validate-args");
  const targetArtifact = def.target ? contracts.find((c) => c.name === def.target!.contract && (!def.target!.source || c.sourcePath === def.target!.source)) : undefined;

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const updateStep = (i: number, step: RunbookStep) => setDef({ ...def, steps: def.steps.map((s, j) => (j === i ? step : s)) });
  const move = (i: number, d: -1 | 1) => {
    const steps = [...def.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + d, 0, s);
    setDef({ ...def, steps });
  };
  const missing = STEP_TYPES.filter((t) => !def.steps.some((s) => s.uses === t));

  async function save(): Promise<boolean> {
    setSaving(true);
    setMsg(null);
    try {
      await api(`/runbooks/${bundle.runbook.id}`, { method: "PUT", body: { projectId: bundle.runbook.projectId, definition: def } });
      setMsg({ tone: "ok", text: "Runbook saved." });
      await reload();
      return true;
    } catch (e) {
      const details = e instanceof ApiError && Array.isArray(e.details) ? ` ${(e.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`).join(" · ")}` : "";
      setMsg({ tone: "bad", text: `${(e as Error).message}${details}` });
      return false;
    } finally {
      setSaving(false);
    }
  }

  function download(kind: "json" | "yaml") {
    const text = kind === "json" ? JSON.stringify(def, null, 2) : runbookToYaml(def);
    const blob = new Blob([text], { type: kind === "json" ? "application/json" : "text/yaml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${def.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.runbook.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <PageHeader
        eyebrow={<><Link href="/runbooks" className="hover:text-text">Runbooks</Link>{project && <> · <Link href={`/projects/${project.id}`} className="hover:text-text">{project.name}</Link></>}</>}
        title={def.name}
        description={def.description || undefined}
        actions={
          <>
            <Button icon={<Save className="size-4" />} onClick={save} loading={saving} disabled={!dirty || !validation.ok}>Save</Button>
            <Button
              variant="primary"
              icon={<Play className="size-4" />}
              loading={running}
              disabled={!validation.ok}
              onClick={async () => {
                if (dirty && !(await save())) return;
                setRunning(true);
                try {
                  const r = await api<{ execution: RunbookExecution }>(`/runbooks/${bundle.runbook.id}/executions`, { body: { deployer: wallet.address ?? null } });
                  router.push(`/runbooks/${bundle.runbook.id}/executions/${r.execution.id}`);
                } catch (e) {
                  setMsg({ tone: "bad", text: (e as Error).message });
                  setRunning(false);
                }
              }}
            >
              Run
            </Button>
          </>
        }
      />
      {msg && <Callout tone={msg.tone} className="mb-4">{msg.text}</Callout>}
      {!project && <Callout tone="bad" className="mb-4">The project for this Runbook was deleted.</Callout>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Tabs value={view} onChange={setView} tabs={[{ id: "visual", label: "Steps" }, { id: "json", label: "JSON" }, { id: "yaml", label: "YAML" }]} />
          {view === "visual" && (
            <div className="space-y-2">
              {def.steps.map((step, i) => {
                const spec = STEP_SPECS[step.uses];
                const err = !validation.ok ? validation.errors.filter((e) => e.path === `steps.${i}` || e.path.startsWith(`steps.${i}.`)) : [];
                return (
                  <div key={`${step.id}-${i}`} className={cn("rounded-2xl border bg-panel shadow-card", err.length ? "border-bad/40" : "border-line/70")}>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="flex size-6 items-center justify-center rounded-full border border-line-strong text-[11px] text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-text">{spec.title}</span>
                          <Badge tone={CATEGORY_TONE[spec.category]}>{CATEGORY_LABEL[spec.category]}</Badge>
                          <span className="mono text-[11px] text-faint">{step.uses}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">{spec.description}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input className="mono h-7 w-24 text-xs" value={step.id} aria-label="Step id" onChange={(e) => updateStep(i, { ...step, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } as RunbookStep)} />
                        <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></IconBtn>
                        <IconBtn label="Move down" disabled={i === def.steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></IconBtn>
                        <IconBtn label="Remove step" onClick={() => setDef({ ...def, steps: def.steps.filter((_, j) => j !== i) })}><X className="size-3.5" /></IconBtn>
                      </div>
                    </div>
                    <StepOptions step={step} onChange={(s) => updateStep(i, s)} />
                    {err.map((e, k) => <p key={k} className="border-t border-bad/30 px-4 py-2 text-xs text-bad">{e.message}</p>)}
                  </div>
                );
              })}
              {missing.length > 0 && (
                <div className="rounded-2xl border border-dashed border-line-strong p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-muted"><Plus className="size-3.5" /> Add a step (only allowlisted operations are available)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {missing.map((t: StepType) => (
                      <button key={t} onClick={() => setDef({ ...def, steps: [...def.steps, makeStep(t, defaultStepId(t))] })} className="rounded-xl border border-line-strong bg-panel-2 px-2 py-1 text-xs text-muted hover:border-accent/50 hover:text-text">
                        {STEP_SPECS[t].title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {view !== "visual" && (
            <div className="space-y-3">
              <Textarea readOnly rows={22} className="mono text-[12px]" value={view === "json" ? JSON.stringify(def, null, 2) : runbookToYaml(def)} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => download(view === "json" ? "json" : "yaml")}>Download {view.toUpperCase()}</Button>
              </div>
              <Card>
                <Label htmlFor="import" hint="paste JSON or YAML — validated before it replaces the editor">Import</Label>
                <Textarea id="import" rows={6} className="mono text-[12px]" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'schema: 4orge.runbook/v1\nname: …'} />
                <Button
                  size="sm"
                  className="mt-2"
                  icon={<Upload className="size-3.5" />}
                  onClick={() => {
                    const parsed = parseRunbookText(importText);
                    if (!parsed.ok) return setMsg({ tone: "bad", text: parsed.error });
                    const v = validateRunbook(parsed.value);
                    if (!v.ok) return setMsg({ tone: "bad", text: `Import rejected: ${v.errors.map((e) => `${e.path}: ${e.message}`).join(" · ")}` });
                    setDef(v.definition);
                    setImportText("");
                    setMsg({ tone: "ok", text: "Imported. Review and save." });
                  }}
                >
                  Validate & load
                </Button>
              </Card>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card padded={false}>
            <CardHeader title="Validation" />
            <div className="space-y-2 p-4 text-sm">
              {validation.ok ? (
                <>
                  <Callout tone="ok">Valid Runbook ({def.steps.length} steps).</Callout>
                  {validation.warnings.map((w, i) => <Callout key={i} tone="warn">{w.message}</Callout>)}
                </>
              ) : (
                validation.errors.map((e, i) => (
                  <Callout key={i} tone="bad"><span className="mono text-[11px]">{e.path}</span> — {e.message}</Callout>
                ))
              )}
            </div>
          </Card>
          <Card padded={false}>
            <CardHeader title="Settings" />
            <div className="space-y-4 p-4">
              <div>
                <Label htmlFor="rbname">Name</Label>
                <Input id="rbname" value={def.name} onChange={(e) => setDef({ ...def, name: e.target.value })} maxLength={120} />
              </div>
              <div>
                <Label htmlFor="rbdesc">Description</Label>
                <Textarea id="rbdesc" rows={2} value={def.description} onChange={(e) => setDef({ ...def, description: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="rbnet">Network</Label>
                <Select id="rbnet" value={def.network} onChange={(e) => setDef({ ...def, network: e.target.value as RunbookDefinition["network"] })}>
                  {networks.map((n) => <option key={n.id} value={n.id}>{n.name}{n.deploymentsAllowed ? "" : " (deployments locked)"}</option>)}
                </Select>
              </div>
            </div>
          </Card>
          {deploys && (
            <Card padded={false}>
              <CardHeader title="Deployment target" description="Contract and constructor arguments used by the deploy steps." />
              <div className="space-y-4 p-4">
                {contracts.length === 0 ? (
                  <Callout tone="warn">Compile the project to choose a contract from its build output.{def.target && ` Current target: ${def.target.contract}.`}</Callout>
                ) : (
                  <div>
                    <Label htmlFor="rbtarget">Contract</Label>
                    <Select
                      id="rbtarget"
                      value={targetArtifact ? `${targetArtifact.sourcePath}:${targetArtifact.name}` : ""}
                      onChange={(e) => {
                        const c = contracts.find((x) => `${x.sourcePath}:${x.name}` === e.target.value);
                        if (c) setDef({ ...def, target: { contract: c.name, source: c.sourcePath, constructorArgs: [] } });
                      }}
                    >
                      <option value="">Select…</option>
                      {contracts.map((c) => <option key={c.id} value={`${c.sourcePath}:${c.name}`}>{c.name} — {c.sourcePath}</option>)}
                    </Select>
                  </div>
                )}
                {targetArtifact && def.target && (
                  <ArgsForm abi={targetArtifact.abi} values={def.target.constructorArgs} onChange={(v) => setDef({ ...def, target: { ...def.target!, constructorArgs: v } })} network={def.network} />
                )}
              </div>
            </Card>
          )}
          <Card padded={false}>
            <CardHeader title="Executions" />
            <ul className="divide-y divide-line">
              {bundle.executions.map((e) => (
                <li key={e.id}>
                  <Link href={`/runbooks/${bundle.runbook.id}/executions/${e.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-panel-2">
                    <StatusBadge status={e.status} />
                    <span className="text-xs text-muted">{e.network}</span>
                    <span className="ml-auto text-xs text-faint">{timeAgo(e.createdAt)}</span>
                  </Link>
                </li>
              ))}
              {bundle.executions.length === 0 && <li className="px-4 py-3 text-sm text-muted">Not run yet.</li>}
            </ul>
          </Card>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="size-3.5" />}
            onClick={async () => {
              if (!confirm("Delete this Runbook? Execution history and deployment records are kept.")) return;
              await api(`/runbooks/${bundle.runbook.id}`, { method: "DELETE" });
              router.push("/runbooks");
            }}
          >
            Delete Runbook
          </Button>
        </div>
      </div>
    </>
  );
}

function IconBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled} className="inline-flex size-7 items-center justify-center rounded text-faint hover:bg-panel-3 hover:text-text disabled:opacity-30">
      {children}
    </button>
  );
}

function StepOptions({ step, onChange }: { step: RunbookStep; onChange: (s: RunbookStep) => void }) {
  const row = "flex flex-wrap items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-muted";
  if (step.uses === "contracts.test") {
    const w = { scope: step.with?.scope ?? "all", required: step.with?.required ?? true };
    return (
      <div className={row}>
        <label className="flex items-center gap-2">Scope
          <Select className="h-7 w-36 text-xs" value={w.scope} onChange={(e) => onChange({ ...step, with: { ...w, scope: e.target.value as "all" } })}>
            <option value="all">all</option>
            <option value="solidity">solidity</option>
            <option value="nodejs">nodejs</option>
          </Select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-[#2a6fcc]" checked={w.required} onChange={(e) => onChange({ ...step, with: { ...w, required: e.target.checked } })} />
          Required — failing tests block deployment
        </label>
      </div>
    );
  }
  if (step.uses === "contract.verify") {
    const required = step.with?.required ?? false;
    return (
      <div className={row}>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-[#2a6fcc]" checked={required} onChange={(e) => onChange({ ...step, with: { required: e.target.checked } })} />
          Required — fail the execution if verification does not complete
        </label>
      </div>
    );
  }
  if (step.uses === "tx.confirm") {
    const w = { confirmations: step.with?.confirmations ?? 1, timeoutSeconds: step.with?.timeoutSeconds ?? 300 };
    return (
      <div className={row}>
        <label className="flex items-center gap-2">Confirmations
          <Input type="number" min={1} max={12} className="h-7 w-16 text-xs" value={w.confirmations} onChange={(e) => onChange({ ...step, with: { ...w, confirmations: Math.min(12, Math.max(1, Number(e.target.value) || 1)) } })} />
        </label>
        <label className="flex items-center gap-2">Timeout (s)
          <Input type="number" min={30} max={900} className="h-7 w-20 text-xs" value={w.timeoutSeconds} onChange={(e) => onChange({ ...step, with: { ...w, timeoutSeconds: Math.min(900, Math.max(30, Number(e.target.value) || 300)) } })} />
        </label>
      </div>
    );
  }
  if (step.uses === "human.confirm") {
    return (
      <div className={row}>
        <Input className="h-7 text-xs" placeholder="Optional message shown to the operator" value={step.with?.message ?? ""} onChange={(e) => onChange({ ...step, with: e.target.value ? { message: e.target.value } : undefined })} />
      </div>
    );
  }
  return null;
}
