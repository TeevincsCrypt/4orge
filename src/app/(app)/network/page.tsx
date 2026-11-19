"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useApp, type ClientNetwork } from "@/components/app-context";
import { useWallet } from "@/components/wallet/wallet-provider";
import { Badge, Button, Callout, Card, CardHeader, CopyButton, Input, Label, PageHeader } from "@/components/ui";
import { api, useApi } from "@/lib/client/api";
import { validateRpcUrl } from "@/lib/networks";

interface Status {
  rpc: { ok: boolean; actualChainId: number | null; expectedChainId: number; blockNumber: string | null; latencyMs: number | null; error: string | null; rpcUrl: string; deploymentsAllowed: boolean };
  explorer: { kind: "blockscout" | "none" | "unreachable"; detail: string };
}

export default function NetworkPage() {
  const { networks, networkId, setNetworkId, reloadNetworks, refreshRpc } = useApp();
  return (
    <>
      <PageHeader
        title="Network"
        description="QIE network configuration. Chain IDs are never trusted blindly: 4ORGE calls eth_chainId on the RPC and refuses mismatches."
      />
      <div className="space-y-6">
        {networks.map((n) => (
          <NetworkCard key={n.id} network={n} selected={n.id === networkId} onSelect={() => setNetworkId(n.id)} onSaved={async () => { await reloadNetworks(); await refreshRpc(); }} />
        ))}
      </div>
    </>
  );
}

function NetworkCard({ network: n, selected, onSelect, onSaved }: { network: ClientNetwork; selected: boolean; onSelect: () => void; onSaved: () => Promise<void> }) {
  const status = useApi<Status>(`/networks/${n.id}/status`);
  const wallet = useWallet();
  const [rpc, setRpc] = useState(n.rpcOverride ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const s = status.data?.rpc;
  const walletHere = wallet.chainId === n.chainId;
  const rows: [string, React.ReactNode][] = [
    ["Chain ID", <span key="c" className="mono">{n.chainId} <span className="text-faint">(0x{n.chainId.toString(16)})</span></span>],
    ["RPC", <span key="r" className="mono flex items-center gap-1 break-all">{n.rpcOverride ?? n.rpcUrls[0]}<CopyButton value={n.rpcOverride ?? n.rpcUrls[0]} />{n.rpcOverride && <Badge tone="accent">custom</Badge>}</span>],
    ["Explorer", n.explorerUrl ? <a key="e" href={n.explorerUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-strong hover:underline">{n.explorerUrl}<ExternalLink className="size-3" /></a> : "—"],
    ["Currency", `${n.nativeCurrency.name} (${n.nativeCurrency.symbol}, ${n.nativeCurrency.decimals} decimals)`],
    ["Deployments", n.deploymentsAllowed ? <Badge key="d" tone="ok">enabled</Badge> : <Badge key="d" tone="warn">locked</Badge>],
  ];
  return (
    <Card padded={false} className={selected ? "border-accent/40" : undefined}>
      <CardHeader
        title={<span className="flex flex-wrap items-center gap-2">{n.name}<Badge tone={n.kind === "mainnet" ? "warn" : n.kind === "testnet" ? "blue" : "neutral"}>{n.kind}</Badge>{selected && <Badge tone="accent">selected</Badge>}</span>}
        description={n.description}
        action={!selected ? <Button size="sm" onClick={onSelect}>Use this network</Button> : undefined}
      />
      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <dl className="space-y-2.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 text-text">{v}</dd>
            </div>
          ))}
          {n.faucetUrl && (
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <dt className="text-muted">Faucet</dt>
              <dd><a href={n.faucetUrl} target="_blank" rel="noreferrer" className="text-blue-strong hover:underline">Get test QIE</a></dd>
            </div>
          )}
        </dl>
        <div className="space-y-3">
          <div className="rounded-md border border-line bg-panel-2 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Live RPC check (from the 4ORGE server)</span>
              <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={status.loading} onClick={() => status.reload()}>Check</Button>
            </div>
            {s ? (
              s.ok ? (
                <p className="mt-1 text-ok">✓ Chain ID {s.actualChainId} verified · block {s.blockNumber} · {s.latencyMs} ms</p>
              ) : (
                <p className="mt-1 text-bad">{s.error}</p>
              )
            ) : (
              <p className="mt-1 text-faint">Checking…</p>
            )}
            {status.data && (
              <p className="mt-1 text-xs text-muted">
                Explorer verification API: {status.data.explorer.kind === "blockscout" ? <span className="text-ok">{status.data.explorer.detail}</span> : status.data.explorer.detail}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {wallet.address ? (
              walletHere ? <Badge tone="ok">Your wallet is on this network</Badge> : (
                <Button size="sm" onClick={async () => { try { await wallet.switchNetwork(n.id); setMsg(null); } catch (e) { setMsg({ tone: "bad", text: (e as Error).message }); } }}>
                  Add / switch wallet to {n.name}
                </Button>
              )
            ) : <span className="text-xs text-faint">Connect a wallet to add this network to it.</span>}
          </div>
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setMsg(null);
              if (rpc.trim()) {
                const v = validateRpcUrl(rpc);
                if (!v.ok) return setMsg({ tone: "bad", text: v.error });
              }
              setSaving(true);
              try {
                const current = await api<{ settings: { rpcOverrides: Record<string, string> } }>("/settings");
                const overrides = { ...current.settings.rpcOverrides, [n.id]: rpc.trim() };
                await api("/settings", { method: "PUT", body: { rpcOverrides: overrides } });
                setMsg({ tone: "ok", text: rpc.trim() ? "Custom RPC saved. It must still report the correct chain ID." : "Reverted to the default RPC." });
                await onSaved();
                await status.reload();
              } catch (err) {
                setMsg({ tone: "bad", text: (err as Error).message });
              } finally {
                setSaving(false);
              }
            }}
          >
            <Label htmlFor={`rpc-${n.id}`} hint="optional — leave empty for the default">Custom RPC URL</Label>
            <div className="flex gap-2">
              <Input id={`rpc-${n.id}`} className="mono text-[13px]" value={rpc} placeholder={n.rpcUrls[0]} onChange={(e) => setRpc(e.target.value)} />
              <Button loading={saving}>Save</Button>
            </div>
          </form>
          {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
        </div>
      </div>
    </Card>
  );
}
