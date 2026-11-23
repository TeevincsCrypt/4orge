"use client";

import Link from "next/link";
import { useState } from "react";
import { FileCode2, Search } from "lucide-react";
import { constructorInputs, describeParam } from "@/lib/abi-args";
import { Badge, ButtonLink, EmptyState, ErrorState, HexValue, Input, LoadingBlock, PageHeader, Table, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import { explorerAddressUrl, getNetwork } from "@/lib/networks";
import type { ContractArtifact, Deployment } from "@/lib/types";

type Row = Pick<ContractArtifact, "id" | "name" | "sourcePath" | "bytecodeSize" | "compilerVersion" | "projectId" | "abi" | "hasUnlinkedLibraries"> & { projectName: string; deployments: Deployment[] };

export default function ContractsPage() {
  const { data, error, loading, reload } = useApi<{ contracts: Row[] }>("/contracts");
  const [q, setQ] = useState("");
  const rows = (data?.contracts ?? []).filter((c) => !q || `${c.name} ${c.sourcePath} ${c.projectName}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="Contracts" description="Compiled contracts from each project's latest build, and where they are deployed." />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-faint" />
        <Input className="pl-9" placeholder="Filter contracts" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && !data && <LoadingBlock />}
      {error && <ErrorState error={error} retry={reload} />}
      {data && data.contracts.length === 0 && (
        <EmptyState icon={<FileCode2 className="size-5" />} title="No compiled contracts" description="Compile a project to populate this list." action={<ButtonLink href="/projects">Go to projects</ButtonLink>} />
      )}
      {rows.length > 0 && (
        <Table>
          <thead>
            <tr><Th>Contract</Th><Th>Project</Th><Th>Constructor</Th><Th>Size</Th><Th>Deployed at</Th></tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const confirmed = c.deployments.filter((d) => d.status === "confirmed" && d.contractAddress);
              return (
                <tr key={c.id} className="hover:bg-panel-2">
                  <Td>
                    <Link href={`/contracts/${c.id}`} className="font-medium text-text hover:underline">{c.name}</Link>
                    <div className="mono text-[11px] text-faint">{c.sourcePath}</div>
                  </Td>
                  <Td><Link href={`/projects/${c.projectId}`} className="hover:text-text">{c.projectName}</Link></Td>
                  <Td><span className="mono text-xs">({constructorInputs(c.abi).map(describeParam).join(", ")})</span></Td>
                  <Td>{c.bytecodeSize === 0 ? <Badge>abstract</Badge> : `${c.bytecodeSize.toLocaleString()} B`}</Td>
                  <Td>
                    {confirmed.length === 0 ? <span className="text-faint">—</span> : (
                      <div className="space-y-1">
                        {confirmed.slice(0, 3).map((d) => (
                          <div key={d.id} className="flex items-center gap-2">
                            <Badge tone={d.network === "qie-mainnet" ? "warn" : "blue"}>{getNetwork(d.network).shortName}</Badge>
                            <HexValue value={d.contractAddress!} href={explorerAddressUrl(getNetwork(d.network), d.contractAddress!)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
