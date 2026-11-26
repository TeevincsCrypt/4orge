"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Hammer, Rocket } from "lucide-react";
import { useApp } from "@/components/app-context";
import { ArgsForm, argsValid } from "@/components/args-form";
import { useWallet } from "@/components/wallet/wallet-provider";
import { Badge, Button, ButtonLink, Callout, Card, CardHeader, cn, EmptyState, Label, LoadingBlock, PageHeader, Select } from "@/components/ui";
import { api, useApi } from "@/lib/client/api";
import { createRunbookTemplate } from "@/lib/runbook/validate";
import type { ProjectBundle } from "@/app/(app)/projects/[id]/page";
import type { Project, Runbook, RunbookExecution } from "@/lib/types";

export default function DeployPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <DeployWizard />
    </Suspense>
  );
}

function DeployWizard() {
  const router = useRouter();
  const search = useSearchParams();
  const { networks, networkId, setNetworkId } = useApp();
  const wallet = useWallet();
  const projects = useApi<{ projects: Project[] }>("/projects");
  const [projectId, setProjectId] = useState(search.get("projectId") ?? "");
  const bundle = useApi<ProjectBundle>(projectId ? `/projects/${projectId}` : null);
  const [contractKey, setContractKey] = useState("");
  const [args, setArgs] = useState<unknown[]>([]);
  const [runTests, setRunTests] = useState(true);
  const [confirmStep, setConfirmStep] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deployable = useMemo(() => (bundle.data?.contracts ?? []).filter((c) => c.bytecodeSize > 0 && !c.hasUnlinkedLibraries), [bundle.data]);
  const contract = deployable.find((c) => `${c.sourcePath}:${c.name}` === contractKey);
  const network = networks.find((n) => n.id === networkId);

  useEffect(() => {
    if (!deployable.length) return;
    const wanted = search.get("contract");
    const wantedSource = search.get("source");
    const pick = deployable.find((c) => c.name === wanted && (!wantedSource || c.sourcePath === wantedSource)) ?? deployable[0];
    // Preselect a contract once the build output is loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContractKey((k) => (k && deployable.some((c) => `${c.sourcePath}:${c.name}` === k) ? k : `${pick.sourcePath}:${pick.name}`));
  }, [deployable, search]);

  const hasTests = (bundle.data?.project.detection.testFiles.solidity.length ?? 0) + (bundle.data?.project.detection.testFiles.nodejs.length ?? 0) > 0;
  const ready = contract && network?.deploymentsAllowed && argsValid(contract.abi, args);

  async function start() {
    if (!contract || !bundle.data) return;
    setStarting(true);
    setError(null);
    try {
      const def = createRunbookTemplate("full-deploy", {
        name: `Deploy ${contract.name} to ${network!.name}`,
        network: networkId,
        contract: contract.name,
        source: contract.sourcePath,
        constructorArgs: args,
      });
      def.steps = def.steps
        .filter((s) => (runTests && hasTests) || s.uses !== "contracts.test")
        .filter((s) => confirmStep || network!.kind === "mainnet" || s.uses !== "human.confirm");
      const r = await api<{ runbook: Runbook }>("/runbooks", { body: { projectId, definition: def } });
      const e = await api<{ execution: RunbookExecution }>(`/runbooks/${r.runbook.id}/executions`, { body: { deployer: wallet.address ?? null } });
      router.push(`/runbooks/${r.runbook.id}/executions/${e.execution.id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Start a deployment"
        description="Pick a contract and network. 4ORGE saves this as a reusable Runbook, runs the checks, then asks your wallet to sign."
      />
      {projects.data?.projects.length === 0 && (
        <EmptyState title="No projects" description="Create a project first." action={<ButtonLink href="/projects/new" variant="primary">New project</ButtonLink>} />
      )}
      {projects.data && projects.data.projects.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Card padded={false}>
              <CardHeader title="1 · Project & contract" />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dproj">Project</Label>
                  <Select id="dproj" value={projectId} onChange={(e) => { setProjectId(e.target.value); setContractKey(""); setArgs([]); }}>
                    <option value="">Select…</option>
                    {projects.data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="dcon">Contract</Label>
                  <Select id="dcon" value={contractKey} disabled={!deployable.length} onChange={(e) => { setContractKey(e.target.value); setArgs([]); }}>
                    {!deployable.length && <option value="">—</option>}
                    {deployable.map((c) => <option key={c.id} value={`${c.sourcePath}:${c.name}`}>{c.name} — {c.sourcePath}</option>)}
                  </Select>
                </div>
                {projectId && bundle.data && !bundle.data.contracts.length && (
                  <div className="sm:col-span-2">
                    <Callout tone="blue" title="This project has not been compiled">
                      Compile it to choose a contract. The Runbook recompiles again before deploying.
                      <div className="mt-2">
                        <Button size="sm" icon={<Hammer className="size-3.5" />} loading={compiling} onClick={async () => {
                          setCompiling(true);
                          setError(null);
                          try {
                            const r = await api<{ build: { status: string; errors: { message: string }[] } }>(`/projects/${projectId}/compile`, { method: "POST", body: {} });
                            if (r.build.status !== "succeeded") setError(`Compilation failed: ${r.build.errors[0]?.message}`);
                            await bundle.reload();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setCompiling(false);
                          }
                        }}>Compile now</Button>
                      </div>
                    </Callout>
                  </div>
                )}
              </div>
            </Card>
            {contract && (
              <Card padded={false}>
                <CardHeader title="2 · Constructor arguments" description="Validated against the compiled ABI as you type. Address fields take a 0x address or a QIE ID (name.qie)." />
                <div className="p-5"><ArgsForm abi={contract.abi} values={args} onChange={setArgs} network={networkId} /></div>
              </Card>
            )}
            <Card padded={false}>
              <CardHeader title="3 · Network" />
              <div className="grid gap-2 p-5 sm:grid-cols-2">
                {networks.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setNetworkId(n.id)}
                    className={cn("rounded-2xl border p-4 text-left transition-colors", n.id === networkId ? "border-accent/50 bg-accent-soft/50 ring-4 ring-accent/10" : "border-line hover:border-line-strong hover:bg-panel-2")}
                  >
                    <div className="flex items-center justify-between text-sm text-text">
                      {n.name}
                      {n.deploymentsAllowed ? <Badge tone="ok">enabled</Badge> : <Badge tone="warn">locked</Badge>}
                    </div>
                    <div className="mono mt-1 text-[11px] text-faint">chain {n.chainId}</div>
                  </button>
                ))}
              </div>
              {network && !network.deploymentsAllowed && (
                <div className="px-5 pb-5"><Callout tone="warn">{network.kind === "mainnet" ? "Mainnet deployments are locked in this release. They require the server owner to enable FORGE_ENABLE_MAINNET_DEPLOYMENTS deliberately." : "Deployments are not enabled for this network."}</Callout></div>
              )}
            </Card>
          </div>
          <Card padded={false} className="h-fit lg:sticky lg:top-20">
            <CardHeader title="Workflow" />
            <div className="space-y-4 p-5 text-sm">
              <label className="flex items-start gap-2 text-muted">
                <input type="checkbox" className="mt-1 accent-[#2a6fcc]" checked={runTests && hasTests} disabled={!hasTests} onChange={(e) => setRunTests(e.target.checked)} />
                <span>Run tests first (required to pass){!hasTests && bundle.data && <span className="block text-xs text-warn">No tests in this project — consider generating one.</span>}</span>
              </label>
              <label className="flex items-start gap-2 text-muted">
                <input type="checkbox" className="mt-1 accent-[#2a6fcc]" checked={confirmStep || network?.kind === "mainnet"} disabled={network?.kind === "mainnet"} onChange={(e) => setConfirmStep(e.target.checked)} />
                <span>Pause for my review before the wallet prompt{network?.kind === "mainnet" && <span className="block text-xs text-faint">Always on for Mainnet.</span>}</span>
              </label>
              <ol className="space-y-1 border-t border-line pt-3 text-xs text-muted">
                <li>1. Load & validate project</li>
                <li>2. Verify {network?.name ?? "network"} chain ID via RPC</li>
                <li>3. Compile{runTests && hasTests ? " & test" : ""}</li>
                <li>4. Type-check constructor args, estimate gas</li>
                {confirmStep && <li>5. Your review</li>}
                <li>{confirmStep ? 6 : 5}. Wallet signs & broadcasts</li>
                <li>{confirmStep ? 7 : 6}. Receipt validated on-chain, recorded, verified</li>
              </ol>
              {network?.kind === "mainnet" && network.deploymentsAllowed && (
                <Callout tone="bad" title="QIE Mainnet — real funds">Gas is paid in real QIE and the contract is permanent and public. You&apos;ll be asked to type MAINNET before your wallet prompt.</Callout>
              )}
              {!wallet.address && <Callout tone="blue">You can connect your wallet now or when the Runbook reaches the signing step.</Callout>}
              {error && <Callout tone="bad">{error}</Callout>}
              <Button variant="primary" className="w-full" disabled={!ready} loading={starting} icon={<Rocket className="size-4" />} onClick={start}>
                Create Runbook & start
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
