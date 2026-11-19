"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Rocket } from "lucide-react";
import { ContractDetails } from "@/components/contract-details";
import { ButtonLink, Card, ErrorState, LoadingBlock, PageHeader } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import type { ContractArtifact } from "@/lib/types";

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const res = useApi<{ contract: ContractArtifact }>(`/contracts/${id}`);
  if (res.loading && !res.data) return <LoadingBlock />;
  if (res.error && !res.data) return <ErrorState error={res.error} retry={res.reload} />;
  if (!res.data) return null;
  const c = res.data.contract;
  return (
    <>
      <PageHeader
        eyebrow={<><Link href="/contracts" className="hover:text-text">Contracts</Link> · <Link href={`/projects/${c.projectId}`} className="hover:text-text">project</Link></>}
        title={c.name}
        description={c.sourcePath}
        actions={c.bytecodeSize > 0 ? <ButtonLink href={`/deploy?projectId=${c.projectId}&contract=${encodeURIComponent(c.name)}&source=${encodeURIComponent(c.sourcePath)}`} variant="primary" icon={<Rocket className="size-4" />}>Deploy</ButtonLink> : undefined}
      />
      <Card><ContractDetails contract={c} /></Card>
    </>
  );
}
