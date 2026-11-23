"use client";

import { useState } from "react";
import { Rocket, Search } from "lucide-react";
import { DeploymentTable } from "@/components/project/deployments";
import { ButtonLink, EmptyState, ErrorState, Input, LoadingBlock, PageHeader, Select } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import type { Deployment } from "@/lib/types";

export default function DeploymentsPage() {
  const [q, setQ] = useState("");
  const [network, setNetwork] = useState("");
  const [status, setStatus] = useState("");
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (network) params.set("network", network);
  if (status) params.set("status", status);
  const { data, error, loading, reload } = useApi<{ deployments: (Deployment & { projectName: string | null })[] }>(`/deployments?${params.toString()}`);
  const filtered = Boolean(q || network || status);
  return (
    <>
      <PageHeader title="Deployments" description="Permanent record of every deployment, confirmed against chain data." actions={<ButtonLink href="/deploy" variant="primary" icon={<Rocket className="size-4" />}>Start deployment</ButtonLink>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-faint" />
          <Input className="pl-9" placeholder="Search contract, address, tx hash or deployer" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="sm:w-44" value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Network filter">
          <option value="">All networks</option>
          <option value="qie-testnet">QIE Testnet</option>
          <option value="qie-mainnet">QIE Mainnet</option>
          <option value="local-hardhat">Local Hardhat</option>
        </Select>
        <Select className="sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">Any status</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </Select>
      </div>
      {loading && !data && <LoadingBlock />}
      {error && <ErrorState error={error} retry={reload} />}
      {data && data.deployments.length === 0 && (
        <EmptyState icon={<Rocket className="size-5" />} title={filtered ? "No deployments match" : "No deployments yet"} description={filtered ? "Try different filters." : "Deployments appear here once a Runbook broadcasts a transaction."} />
      )}
      {data && data.deployments.length > 0 && <DeploymentTable deployments={data.deployments} showProject />}
    </>
  );
}
