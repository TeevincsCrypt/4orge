"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GitBranch } from "lucide-react";
import { useApp } from "@/components/app-context";
import { Badge, Button, Callout, Card, CardHeader, Label, LoadingBlock, PageHeader, Select } from "@/components/ui";
import { api, useApi } from "@/lib/client/api";
import type { NetworkId } from "@/lib/networks";

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Settings />
    </Suspense>
  );
}

const GITHUB_MESSAGES: Record<string, { tone: "ok" | "bad" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "GitHub connected." },
  denied: { tone: "warn", text: "GitHub authorization was cancelled." },
  "state-mismatch": { tone: "bad", text: "GitHub sign-in failed a security check (state mismatch). Please try again." },
  "not-configured": { tone: "warn", text: "GitHub OAuth is not configured on this server." },
  error: { tone: "bad", text: "GitHub connection failed." },
};

function Settings() {
  const { config, networks, reloadNetworks } = useApp();
  const search = useSearchParams();
  const settings = useApi<{ settings: { defaultNetwork: NetworkId; requireTestsBeforeDeploy: boolean } }>("/settings");
  const gh = useApi<{ configured: boolean; connected: boolean; login: string | null; scope: string | null }>("/github/status");
  const [defaultNetwork, setDefaultNetwork] = useState<NetworkId>("qie-testnet");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const ghMsg = GITHUB_MESSAGES[search.get("github") ?? ""];

  useEffect(() => {
    // Mirror loaded settings into the form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (settings.data) setDefaultNetwork(settings.data.settings.defaultNetwork);
  }, [settings.data]);

  return (
    <>
      <PageHeader title="Settings" description="Workspace preferences, integrations and server configuration." />
      {ghMsg && <Callout tone={ghMsg.tone} className="mb-4">{ghMsg.text}</Callout>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title="Preferences" />
          <form
            className="space-y-4 p-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setMsg(null);
              try {
                await api("/settings", { method: "PUT", body: { defaultNetwork } });
                await reloadNetworks();
                setMsg({ tone: "ok", text: "Saved." });
              } catch (err) {
                setMsg({ tone: "bad", text: (err as Error).message });
              } finally {
                setSaving(false);
              }
            }}
          >
            <div>
              <Label htmlFor="dn">Default network</Label>
              <Select id="dn" value={defaultNetwork} onChange={(e) => setDefaultNetwork(e.target.value as NetworkId)}>
                {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </Select>
            </div>
            {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
            <Button variant="primary" loading={saving}>Save preferences</Button>
          </form>
        </Card>

        <Card padded={false}>
          <CardHeader title="GitHub" icon={<GitBranch className="size-4" />} description="Import private repositories through GitHub OAuth. The token stays in an encrypted, httpOnly cookie on this server." />
          <div className="space-y-3 p-5 text-sm text-muted">
            {!gh.data ? <p>Checking…</p> : !gh.data.configured ? (
              <>
                <p>OAuth is not configured. Public repositories can still be imported.</p>
                <p className="text-xs">To enable it, create a GitHub OAuth App with callback URL <span className="mono text-text">{typeof window !== "undefined" ? window.location.origin : ""}/api/github/oauth/callback</span>, then set <span className="mono text-text">GITHUB_CLIENT_ID</span>, <span className="mono text-text">GITHUB_CLIENT_SECRET</span> and a 32+ character <span className="mono text-text">FORGE_SESSION_SECRET</span> in <span className="mono text-text">.env.local</span> and restart. See docs → Deployment guide.</p>
              </>
            ) : gh.data.connected ? (
              <>
                <p>Connected as <span className="text-text">{gh.data.login}</span> <Badge>{gh.data.scope}</Badge></p>
                <Button size="sm" variant="danger" onClick={async () => { await api("/github/disconnect", { method: "POST", body: {} }); await gh.reload(); }}>Disconnect</Button>
              </>
            ) : (
              <a href="/api/github/oauth/start" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-white"><GitBranch className="size-4" />Connect GitHub</a>
            )}
          </div>
        </Card>

        <Card padded={false} className="lg:col-span-2">
          <CardHeader title="Server configuration" description="Read-only. Change these with environment variables (see .env.example)." />
          <dl className="grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
            <Item k="Storage" v={config?.storageMode === "supabase" ? <Badge tone="ok">Supabase (Postgres + RLS)</Badge> : <Badge tone="warn">Local mode (.forge-data on this machine)</Badge>} />
            <Item k="Signed in as" v={config?.user?.label ?? "—"} />
            <Item k="Test runner" v={<Badge>{config?.testRunner === "all" ? "Solidity + TypeScript/JS" : config?.testRunner === "solidity" ? "Solidity only" : "disabled"}</Badge>} />
            <Item k="Mainnet deployments" v={config?.networkFlags.mainnetDeploymentsEnabled ? <Badge tone="warn">ENABLED</Badge> : <Badge tone="ok">locked</Badge>} />
            <Item k="Local Hardhat network" v={config?.networkFlags.localChainEnabled ? <Badge>enabled</Badge> : <Badge>disabled</Badge>} />
            <Item k="API" v={<span className="mono text-xs text-text">/api/v1 — see Documentation → API</span>} />
          </dl>
        </Card>
      </div>
    </>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right text-text">{v}</dd>
    </div>
  );
}
