"use client";

import { useEffect, useMemo, useState } from "react";
import { File, FilePlus2, Folder, Save, Trash2 } from "lucide-react";
import type { ProjectBundle } from "@/app/(app)/projects/[id]/page";
import { api } from "@/lib/client/api";
import { Button, Callout, Card, cn, Input, Spinner } from "../ui";

export function FilesPanel({ bundle, onChanged }: { bundle: ProjectBundle; onChanged: () => Promise<void> }) {
  const pid = bundle.project.id;
  const paths = bundle.files.map((f) => f.path);
  const [selected, setSelected] = useState<string | null>(paths.find((p) => p.endsWith(".sol")) ?? paths[0] ?? null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [newPath, setNewPath] = useState("");

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    api<{ file: { content: string } }>(`/projects/${pid}/files?path=${encodeURIComponent(selected)}`)
      .then((r) => {
        if (cancelled) return;
        setContent(r.file.content);
        setOriginal(r.file.content);
      })
      .catch((e) => !cancelled && setMessage({ tone: "bad", text: (e as Error).message }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [pid, selected]);

  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const p of paths) {
      const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
      g.set(dir, [...(g.get(dir) ?? []), p]);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [paths]);

  const dirty = content !== original;

  async function save(path: string, text: string) {
    setSaving(true);
    setMessage(null);
    try {
      const r = await api<{ result: { skipped: { path: string; reason: string }[] } }>(`/projects/${pid}/files`, { method: "PUT", body: { files: [{ path, content: text }] } });
      if (r.result.skipped.length) setMessage({ tone: "bad", text: `${r.result.skipped[0].path}: ${r.result.skipped[0].reason}` });
      else {
        setOriginal(text);
        setMessage({ tone: "ok", text: `Saved ${path}` });
        await onChanged();
      }
    } catch (e) {
      setMessage({ tone: "bad", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card padded={false} className="h-fit">
        <div className="max-h-[32rem] overflow-y-auto p-2">
          {groups.map(([dir, files]) => (
            <div key={dir || "/"} className="mb-1">
              {dir && <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-faint"><Folder className="size-3.5" />{dir}</div>}
              {files.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelected(p)}
                  className={cn("flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px]", dir && "pl-5", selected === p ? "bg-panel-3 text-text" : "text-muted hover:bg-panel-2 hover:text-text")}
                >
                  <File className="size-3.5 shrink-0 text-faint" />
                  <span className="truncate">{p.slice(dir ? dir.length + 1 : 0)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <form
          className="flex gap-1.5 border-t border-line p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newPath.trim()) return;
            const name = newPath.trim();
            const body = name.endsWith(".sol") ? "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\n" : "";
            await save(name, body);
            setSelected(name);
            setNewPath("");
          }}
        >
          <Input className="h-8 text-xs" placeholder="contracts/New.sol" value={newPath} onChange={(e) => setNewPath(e.target.value)} />
          <Button size="sm" className="h-8" icon={<FilePlus2 className="size-3.5" />} aria-label="Create file" />
        </form>
      </Card>
      <Card padded={false} className="min-w-0">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="mono truncate text-[13px] text-text">{selected}</span>
              {dirty && <span className="text-xs text-warn">● unsaved</span>}
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={async () => {
                    if (!confirm(`Delete ${selected}?`)) return;
                    await api(`/projects/${pid}/files?path=${encodeURIComponent(selected)}`, { method: "DELETE" });
                    setSelected(null);
                    await onChanged();
                  }}
                >
                  Delete
                </Button>
                <Button size="sm" variant="primary" disabled={!dirty} loading={saving} icon={<Save className="size-3.5" />} onClick={() => save(selected, content)}>
                  Save
                </Button>
              </div>
            </div>
            {message && <div className="px-4 pt-3"><Callout tone={message.tone}>{message.text}</Callout></div>}
            {loading ? (
              <div className="p-6"><Spinner label="Loading file…" /></div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                    e.preventDefault();
                    if (dirty) void save(selected, content);
                  }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const t = e.currentTarget;
                    const s = t.selectionStart;
                    setContent(content.slice(0, s) + "    " + content.slice(t.selectionEnd));
                    requestAnimationFrame(() => t.setSelectionRange(s + 4, s + 4));
                  }
                }}
                spellCheck={false}
                className="mono block min-h-[32rem] w-full resize-y rounded-b-2xl bg-panel-2 p-5 text-[12.5px] leading-relaxed text-[#2c2c3e] focus:outline-none"
                aria-label={`Contents of ${selected}`}
              />
            )}
          </>
        ) : (
          <p className="p-6 text-sm text-muted">Select a file, or create one.</p>
        )}
      </Card>
    </div>
  );
}
