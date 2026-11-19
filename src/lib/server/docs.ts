import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

export const DOCS = [
  { slug: "getting-started", file: "docs/getting-started.md", title: "Getting started", summary: "Install and run 4ORGE locally, then deploy your first contract to QIE Testnet." },
  { slug: "runbooks", file: "docs/runbooks.md", title: "Runbooks", summary: "The Runbook format, step allowlist, ordering rules and execution model." },
  { slug: "qie-networks", file: "docs/qie-networks.md", title: "QIE networks", summary: "Chain IDs, RPC endpoints, explorers, faucet and how 4ORGE validates them." },
  { slug: "architecture", file: "docs/architecture.md", title: "Architecture & security", summary: "Layers, sandboxing, data flow and the security model." },
  { slug: "api", file: "docs/api.md", title: "API reference", summary: "The versioned REST API (/api/v1) for projects, Runbooks, executions and deployments." },
  { slug: "deployment-guide", file: "docs/deployment-guide.md", title: "Deployment guide", summary: "Hosting 4ORGE with Supabase, GitHub OAuth and a sandboxed runner." },
] as const;

/** Read a bundled documentation file (fixed allowlist — never a user-supplied path). */
export async function readDoc(slug: string): Promise<string | null> {
  const doc = DOCS.find((d) => d.slug === slug);
  if (!doc) return null;
  try {
    return await fs.readFile(path.join(process.cwd(), doc.file), "utf8");
  } catch {
    return null;
  }
}
