"use client";

import Link from "next/link";
import { Rocket } from "lucide-react";
import { explorerAddressUrl, getNetwork } from "@/lib/networks";
import type { Deployment } from "@/lib/types";
import { Badge, EmptyState, HexValue, StatusBadge, Table, Td, Th, timeAgo } from "../ui";

export function DeploymentTable({ deployments, showProject }: { deployments: (Deployment & { projectName?: string | null })[]; showProject?: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Contract</Th>
          {showProject && <Th>Project</Th>}
          <Th>Network</Th>
          <Th>Address</Th>
          <Th>Status</Th>
          <Th>Verification</Th>
          <Th className="text-right">When</Th>
        </tr>
      </thead>
      <tbody>
        {deployments.map((d) => {
          const n = getNetwork(d.network);
          return (
            <tr key={d.id} className="hover:bg-panel-2">
              <Td>
                <Link href={`/deployments/${d.id}`} className="font-medium text-text hover:underline">{d.contractName}</Link>
              </Td>
              {showProject && <Td>{d.projectName ?? <span className="text-faint">deleted</span>}</Td>}
              <Td><Badge tone={n.kind === "mainnet" ? "warn" : n.kind === "testnet" ? "blue" : "neutral"}>{n.name}</Badge></Td>
              <Td>{d.contractAddress ? <HexValue value={d.contractAddress} href={explorerAddressUrl(n, d.contractAddress)} /> : <span className="text-faint">—</span>}</Td>
              <Td><StatusBadge status={d.status} /></Td>
              <Td><StatusBadge status={d.verificationStatus} /></Td>
              <Td className="text-right text-xs text-faint">{timeAgo(d.createdAt)}</Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export function ProjectDeployments({ deployments }: { deployments: Deployment[] }) {
  if (!deployments.length) {
    return <EmptyState icon={<Rocket className="size-5" />} title="No deployments for this project" description="Deployments made through Runbooks appear here with their on-chain receipts." />;
  }
  return <DeploymentTable deployments={deployments} />;
}
