"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import type { ProjectBundle } from "@/app/(app)/projects/[id]/page";
import { api, useApi } from "@/lib/client/api";
import type { CompilerSettings } from "@/lib/types";
import { Button, Callout, Card, CardHeader, Input, Label, Select, Textarea, timeAgo } from "../ui";

const EVM_VERSIONS = ["paris", "shanghai", "cancun", "prague", "london", "berlin", "istanbul"];

export function ProjectSettings({ bundle, onChanged }: { bundle: ProjectBundle; onChanged: () => Promise<void> }) {
  const router = useRouter();
  const p = bundle.project;
  const compilers = useApi<{ versions: string[]; offline: boolean; bundled: string }>("/compilers");
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description);
  const [compiler, setCompiler] = useState<CompilerSettings>(p.compiler);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "blue"; text: string } | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card padded={false}>
        <CardHeader title="General & compiler" description="Compiler settings were detected from your config; overriding them here affects 4ORGE builds and tests." />
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setMsg(null);
            try {
              await api(`/projects/${p.id}`, { method: "PATCH", body: { name, description, compiler } });
              setMsg({ tone: "ok", text: "Saved. Recompile to apply compiler changes." });
              await onChanged();
            } catch (err) {
              setMsg({ tone: "bad", text: (err as Error).message });
            } finally {
              setSaving(false);
            }
          }}
        >
          <div>
            <Label htmlFor="pname">Name</Label>
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="pdesc">Description</Label>
            <Textarea id="pdesc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="solc" hint={compilers.data?.offline ? "offline: bundled only" : undefined}>Solidity compiler</Label>
              <Select id="solc" value={compiler.version ?? ""} onChange={(e) => setCompiler({ ...compiler, version: e.target.value || null })}>
                <option value="">Auto (newest matching pragmas)</option>
                {compiler.version && !compilers.data?.versions.includes(compiler.version) && <option value={compiler.version}>{compiler.version}</option>}
                {(compilers.data?.versions ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="evm">EVM version</Label>
              <Select id="evm" value={compiler.evmVersion ?? ""} onChange={(e) => setCompiler({ ...compiler, evmVersion: e.target.value || null })}>
                <option value="">Compiler default</option>
                {EVM_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="opt">Optimizer</Label>
              <Select id="opt" value={compiler.optimizer.enabled ? "on" : "off"} onChange={(e) => setCompiler({ ...compiler, optimizer: { ...compiler.optimizer, enabled: e.target.value === "on" } })}>
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="runs">Optimizer runs</Label>
              <Input id="runs" type="number" min={1} value={compiler.optimizer.runs} onChange={(e) => setCompiler({ ...compiler, optimizer: { ...compiler.optimizer, runs: Math.max(1, Number(e.target.value) || 1) } })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={compiler.viaIR} onChange={(e) => setCompiler({ ...compiler, viaIR: e.target.checked })} className="accent-[#5b5fc7]" />
            Compile via IR (viaIR)
          </label>
          <p className="text-xs text-faint">QIE is EVM-compatible. If deployments fail with “invalid opcode”, try an older EVM version such as “paris” (no PUSH0).</p>
          {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
          <Button variant="primary" loading={saving}>Save settings</Button>
        </form>
      </Card>
      <div className="space-y-6">
        {bundle.repository && (
          <Card padded={false}>
            <CardHeader title="GitHub repository" />
            <div className="space-y-3 p-5 text-sm text-muted">
              <div>
                <a className="text-blue-strong underline" href={bundle.repository.url} target="_blank" rel="noreferrer">{bundle.repository.owner}/{bundle.repository.repo}</a> · branch <span className="mono text-text">{bundle.repository.ref}</span>
              </div>
              <div>Commit <span className="mono text-text">{bundle.repository.commitSha?.slice(0, 12)}</span> · synced {timeAgo(bundle.repository.lastSyncedAt)}</div>
              <Button
                icon={<RefreshCw className="size-4" />}
                loading={syncing}
                onClick={async () => {
                  setSyncing(true);
                  setMsg(null);
                  try {
                    const r = await api<{ changed: boolean; commitSha: string; result: { written: number; deleted: number } | null }>(`/projects/${p.id}/sync`, { method: "POST", body: {} });
                    setMsg({ tone: "blue", text: r.changed ? `Updated to ${r.commitSha.slice(0, 7)}: ${r.result?.written} files changed, ${r.result?.deleted} removed.` : "Already up to date." });
                    await onChanged();
                  } catch (err) {
                    setMsg({ tone: "bad", text: (err as Error).message });
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                Sync latest commit
              </Button>
            </div>
          </Card>
        )}
        <Card padded={false}>
          <CardHeader title="Danger zone" />
          <div className="space-y-3 p-5 text-sm text-muted">
            <p>Deleting a project removes its files, builds, tests and Runbooks. Deployment records are permanent and are kept.</p>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (!confirm(`Delete project “${p.name}”? This cannot be undone.`)) return;
                await api(`/projects/${p.id}`, { method: "DELETE" });
                router.push("/projects");
              }}
            >
              Delete project
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
