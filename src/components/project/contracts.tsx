"use client";

import { useState } from "react";
import { ChevronRight, FlaskConical, Rocket } from "lucide-react";
import type { ProjectBundle } from "@/app/(app)/projects/[id]/page";
import { api } from "@/lib/client/api";
import { constructorInputs, describeParam } from "@/lib/abi-args";
import { ButtonLink, Button, Callout, Card, EmptyState } from "../ui";
import { ContractDetails } from "../contract-details";

export function ContractsPanel({ bundle, onChanged, goto }: { bundle: ProjectBundle; onChanged: () => Promise<void>; goto: (t: "build" | "files") => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (bundle.contracts.length === 0) {
    return (
      <EmptyState
        title="No compiled contracts"
        description="Compile the project to see ABIs, bytecode and deployable contracts."
        action={<Button variant="primary" onClick={() => goto("build")}>Go to Build</Button>}
      />
    );
  }
  const testFiles = new Set([...bundle.project.detection.testFiles.solidity]);
  return (
    <div className="space-y-3">
      {message && <Callout tone={message.tone}>{message.text}</Callout>}
      {bundle.contracts.map((c) => {
        const inputs = constructorInputs(c.abi);
        const deployable = c.bytecodeSize > 0 && !c.hasUnlinkedLibraries;
        const dir = c.sourcePath.split("/").slice(0, -1).join("/");
        const testPath = `${dir ? `${dir}/` : ""}${c.name}.t.sol`;
        return (
          <Card key={c.id} padded={false}>
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <button onClick={() => setOpen(open === c.id ? null : c.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <ChevronRight className={`size-4 shrink-0 text-faint transition-transform ${open === c.id ? "rotate-90" : ""}`} />
                <span className="text-sm font-medium text-text">{c.name}</span>
                <span className="mono truncate text-xs text-faint">{c.sourcePath}</span>
              </button>
              <span className="mono hidden text-xs text-muted md:inline">constructor({inputs.map(describeParam).join(", ")})</span>
              <div className="flex gap-2">
                {deployable && !testFiles.has(testPath) && (
                  <Button
                    size="sm"
                    icon={<FlaskConical className="size-3.5" />}
                    loading={busy === c.id}
                    onClick={async () => {
                      setBusy(c.id);
                      setMessage(null);
                      try {
                        const r = await api<{ path: string }>(`/projects/${bundle.project.id}/generate-test`, { body: { contractId: c.id } });
                        setMessage({ tone: "ok", text: `Created ${r.path}. Edit it in the Files tab, then run tests.` });
                        await onChanged();
                      } catch (e) {
                        setMessage({ tone: "bad", text: (e as Error).message });
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Generate test
                  </Button>
                )}
                {deployable && (
                  <ButtonLink size="sm" variant="primary" icon={<Rocket className="size-3.5" />} href={`/deploy?projectId=${bundle.project.id}&contract=${encodeURIComponent(c.name)}&source=${encodeURIComponent(c.sourcePath)}`}>
                    Deploy
                  </ButtonLink>
                )}
              </div>
            </div>
            {open === c.id && (
              <div className="border-t border-line p-5">
                <ContractDetails contract={c} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
