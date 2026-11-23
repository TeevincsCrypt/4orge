"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { formatEther, formatGwei } from "viem";
import { BadgeCheck, RefreshCw } from "lucide-react";
import { ContractDetails } from "@/components/contract-details";
import { Badge, Button, Callout, Card, CardHeader, CodeBlock, ErrorState, formatDate, HexValue, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui";
import { api, useApi } from "@/lib/client/api";
import { explorerAddressUrl, explorerTxUrl, getNetwork } from "@/lib/networks";
import type { ContractArtifact, Deployment } from "@/lib/types";

export default function DeploymentPage() {
  const { id } = useParams<{ id: string }>();
  const res = useApi<{ deployment: Deployment; project: { id: string; name: string } | null; contract: ContractArtifact | null; execution: { id: string; runbookId: string | null } | null }>(`/deployments/${id}`, { pollMs: 10_000 });
  const [busy, setBusy] = useState<"submit" | "check" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "blue" | "warn"; text: string } | null>(null);
  if (res.loading && !res.data) return <LoadingBlock />;
  if (res.error && !res.data) return <ErrorState error={res.error} retry={res.reload} />;
  if (!res.data) return null;
  const { deployment: d, project, contract, execution } = res.data;
  const n = getNetwork(d.network);
  const fee = d.gasUsed && d.effectiveGasPrice ? BigInt(d.gasUsed) * BigInt(d.effectiveGasPrice) : null;

  async function verify(mode: "submit" | "check") {
    setBusy(mode);
    setMsg(null);
    try {
      const r = await api<{ result: { status: string; message: string } }>(`/deployments/${d.id}/verify`, { body: { mode } });
      setMsg({ tone: r.result.status === "verified" ? "ok" : r.result.status === "failed" ? "bad" : r.result.status === "unsupported" ? "warn" : "blue", text: r.result.message });
      await res.reload();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const rows: [string, React.ReactNode][] = [
    ["Status", <StatusBadge key="s" status={d.status} />],
    ["Network", <span key="n" className="text-text">{n.name} <span className="mono text-xs text-faint">chain {d.chainId}</span></span>],
    ["Contract address", d.contractAddress ? <HexValue key="a" value={d.contractAddress} full href={explorerAddressUrl(n, d.contractAddress)} /> : "—"],
    ["Transaction", <HexValue key="t" value={d.txHash} href={explorerTxUrl(n, d.txHash)} />],
    ["Deployer", <HexValue key="d" value={d.deployerAddress} href={explorerAddressUrl(n, d.deployerAddress)} />],
    ["Block", d.blockNumber ?? "—"],
    ["Gas used", d.gasUsed ? Number(d.gasUsed).toLocaleString() : "—"],
    ["Gas price", d.effectiveGasPrice ? `${formatGwei(BigInt(d.effectiveGasPrice))} gwei` : "—"],
    ["Fee paid", fee !== null ? `${formatEther(fee)} ${n.nativeCurrency.symbol}` : "—"],
    ["Compiler", <span key="c" className="mono text-xs">{d.compilerVersion}</span>],
    ["Created", formatDate(d.createdAt)],
    ["Confirmed", formatDate(d.confirmedAt)],
  ];

  return (
    <>
      <PageHeader
        eyebrow={<><Link href="/deployments" className="hover:text-text">Deployments</Link>{project && <> · <Link href={`/projects/${project.id}`} className="hover:text-text">{project.name}</Link></>}</>}
        title={d.contractName}
        description={d.sourcePath}
        actions={execution?.runbookId ? <Link href={`/runbooks/${execution.runbookId}/executions/${execution.id}`} className="text-xs text-muted hover:text-text">Open Runbook execution →</Link> : undefined}
      />
      {d.status === "failed" && d.failureReason && <Callout tone="bad" className="mb-4" title="Deployment failed">{d.failureReason}</Callout>}
      {d.status === "pending" && <Callout tone="blue" className="mb-4">Waiting for the transaction to be confirmed by the network. Its Runbook execution keeps checking the receipt.</Callout>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card padded={false}>
            <CardHeader title="On-chain record" />
            <dl className="divide-y divide-line">
              {rows.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 px-5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="min-w-0 text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card padded={false}>
            <CardHeader title="Constructor arguments" />
            <div className="space-y-3 p-5">
              <CodeBlock>{JSON.stringify(d.constructorArgs, null, 2)}</CodeBlock>
              <div className="text-xs text-muted">ABI-encoded</div>
              <CodeBlock maxHeight="8rem">{d.constructorArgsEncoded === "0x" ? "0x (none)" : d.constructorArgsEncoded}</CodeBlock>
            </div>
          </Card>
          {contract && (
            <Card padded={false}>
              <CardHeader title="Compiled artifact" />
              <div className="p-5"><ContractDetails contract={contract} /></div>
            </Card>
          )}
        </div>
        <Card padded={false} className="h-fit">
          <CardHeader title="Source verification" icon={<BadgeCheck className="size-4" />} />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-center gap-2"><StatusBadge status={d.verificationStatus} /> {n.explorerUrl ? <Badge>{new URL(n.explorerUrl).host}</Badge> : <Badge>no explorer</Badge>}</div>
            {d.verificationMessage && <p className="text-muted">{d.verificationMessage}</p>}
            {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
            <p className="text-xs text-faint">4ORGE submits the exact Standard JSON input it compiled. Verification is only reported when the explorer itself confirms it.</p>
            {d.status === "confirmed" && d.verificationStatus !== "verified" && n.explorerUrl && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" loading={busy === "submit"} onClick={() => verify("submit")}>Verify source</Button>
                {d.verificationStatus === "pending" && <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={busy === "check"} onClick={() => verify("check")}>Check status</Button>}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
