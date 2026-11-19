"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, FolderUp, GitBranch, LayoutTemplate } from "lucide-react";
import { useApp } from "@/components/app-context";
import { Button, Callout, Card, cn, Input, Label, PageHeader, Tabs, Textarea } from "@/components/ui";
import { api, ApiError, useApi } from "@/lib/client/api";
import { acceptProjectFile } from "@/lib/project/paths";
import { TEMPLATES, type TemplateId } from "@/lib/project/templates";
import type { Project } from "@/lib/types";

type Mode = "template" | "github" | "upload";

export default function NewProjectPage() {
  const [mode, setMode] = useState<Mode>("template");
  return (
    <>
      <PageHeader eyebrow="Projects" title="New project" description="Bring Solidity code into 4ORGE. Files are validated and stored; configuration files are read, never executed." />
      <Tabs
        value={mode}
        onChange={setMode}
        tabs={[
          { id: "template", label: <><LayoutTemplate className="size-4" />Template</> },
          { id: "github", label: <><GitBranch className="size-4" />GitHub</> },
          { id: "upload", label: <><FolderUp className="size-4" />Upload folder</> },
        ]}
      />
      {mode === "template" && <FromTemplate />}
      {mode === "github" && <FromGithub />}
      {mode === "upload" && <FromUpload />}
    </>
  );
}

function FromTemplate() {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateId>("counter");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await api<{ project: Project }>("/projects", { body: { name: name || TEMPLATES.find((t) => t.id === template)!.name, description, template } });
          router.push(`/projects/${res.project.id}`);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setTemplate(t.id)}
            className={cn(
              "relative rounded-2xl border p-5 text-left shadow-card transition-colors",
              template === t.id ? "border-accent/50 bg-panel ring-4 ring-accent/10" : "border-line/70 bg-panel hover:border-line-strong",
            )}
          >
            {template === t.id && <Check className="absolute right-3 top-3 size-4 text-accent-strong" />}
            <div className="text-sm font-semibold text-text">{t.name}</div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t.description}</p>
            <div className="mono mt-3 space-y-0.5 text-[11px] text-faint">
              {t.files.slice(0, 4).map((f) => <div key={f.path}>{f.path}</div>)}
            </div>
          </button>
        ))}
      </div>
      <Card className="h-fit space-y-4">
        <div>
          <Label htmlFor="name">Project name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={TEMPLATES.find((t) => t.id === template)?.name} maxLength={120} />
        </div>
        <div>
          <Label htmlFor="desc" hint="optional">Description</Label>
          <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </div>
        {error && <Callout tone="bad">{error}</Callout>}
        <Button variant="primary" className="w-full" loading={busy}>Create project</Button>
      </Card>
    </form>
  );
}

function FromGithub() {
  const router = useRouter();
  const { config } = useApp();
  const status = useApi<{ configured: boolean; connected: boolean; login: string | null }>("/github/status");
  const repos = useApi<{ repositories: { fullName: string; private: boolean; defaultBranch: string; description: string | null; pushedAt: string }[] }>(status.data?.connected ? "/github/repos" : null);
  const [repository, setRepository] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const res = await api<{ project: Project }>("/projects/import", { body: { repository, ref: ref || undefined } });
              router.push(`/projects/${res.project.id}`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : (err as Error).message);
              setBusy(false);
            }
          }}
        >
          <div>
            <Label htmlFor="repo" hint="owner/name or URL">Repository</Label>
            <Input id="repo" required value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="OpenZeppelin/openzeppelin-contracts or https://github.com/you/your-repo" />
          </div>
          <div>
            <Label htmlFor="ref" hint="optional — defaults to the default branch">Branch, tag or commit</Label>
            <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="main" />
          </div>
          {error && <Callout tone="bad">{error}</Callout>}
          <Button variant="primary" loading={busy} icon={<GitBranch className="size-4" />}>Import repository</Button>
        </form>
        {repos.data && repos.data.repositories.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-muted">Your repositories</div>
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {repos.data.repositories.map((r) => (
                <li key={r.fullName}>
                  <button type="button" onClick={() => setRepository(r.fullName)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-panel-2">
                    <span className="truncate text-text">{r.fullName}</span>
                    {r.private && <span className="text-[11px] text-warn">private</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <div className="space-y-3">
        <Callout tone="blue" title="How import works">
          4ORGE downloads a snapshot of the commit, keeps only Solidity, test and configuration files (no node_modules, no binaries,
          max 512 KB per file) and records the commit SHA so you can sync later. Nothing from the repository is executed during import.
        </Callout>
        {status.data && !status.data.configured && (
          <Callout tone="neutral" title="Public repositories only">
            GitHub OAuth is not configured on this server, so only public repositories can be imported (GitHub allows 60
            anonymous requests per hour). To import private repositories, the server owner must set GITHUB_CLIENT_ID,
            GITHUB_CLIENT_SECRET and FORGE_SESSION_SECRET — see Settings → GitHub.
          </Callout>
        )}
        {status.data?.configured && !status.data.connected && (
          <Callout tone="neutral" title="Private repositories">
            <a href="/api/github/oauth/start">Connect GitHub</a> to import private repositories you have access to.
          </Callout>
        )}
        {status.data?.connected && <Callout tone="ok">Connected to GitHub as {status.data.login}.</Callout>}
        {config?.storageMode === "local" && null}
      </div>
    </div>
  );
}

function FromUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ path: string; content: string }[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(list: FileList | null) {
    if (!list) return;
    const accepted: { path: string; content: string }[] = [];
    let skipped = 0;
    let root: string | null = null;
    for (const file of Array.from(list)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = rel.split("/");
      root ??= parts.length > 1 ? parts[0] : null;
      const inner = parts.length > 1 ? parts.slice(1).join("/") : rel;
      if (!acceptProjectFile(inner, file.size).ok) {
        skipped++;
        continue;
      }
      accepted.push({ path: inner, content: await file.text() });
    }
    setFiles(accepted);
    setIgnored(skipped);
    if (!name && root) setName(root);
  }

  const sol = files.filter((f) => f.path.endsWith(".sol")).length;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center hover:border-accent/50 hover:bg-panel-2"
        >
          <FolderUp className="mb-2 size-6 text-muted" />
          <span className="text-sm font-medium text-text">Choose a project folder</span>
          <span className="mt-1 text-xs text-muted">Your Hardhat or Foundry root. node_modules, artifacts and caches are skipped automatically.</span>
        </button>
        <input
          ref={input}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => void onPick(e.target.files)}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
        {files.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs text-muted">
              {files.length} files selected ({sol} Solidity) · {ignored} ignored
            </div>
            <div className="mono max-h-64 overflow-y-auto rounded-xl border border-line bg-panel-2 p-2 text-[12px] text-muted">
              {files.slice(0, 300).map((f) => <div key={f.path}>{f.path}</div>)}
            </div>
          </div>
        )}
      </Card>
      <Card className="h-fit space-y-4">
        <div>
          <Label htmlFor="uname">Project name</Label>
          <Input id="uname" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {files.length > 0 && sol === 0 && <Callout tone="warn">No .sol files in the selection.</Callout>}
        {error && <Callout tone="bad">{error}</Callout>}
        <Button
          variant="primary"
          className="w-full"
          disabled={!files.length || !name}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await api<{ project: Project }>("/projects", { body: { name, files } });
              router.push(`/projects/${res.project.id}`);
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          Create project from folder
        </Button>
      </Card>
    </div>
  );
}
