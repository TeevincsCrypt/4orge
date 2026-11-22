"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronsUpDown,
  FileCode2,
  FolderGit2,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  PanelLeft,
  Plus,
  Rocket,
  Search,
  Settings,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import { useApp } from "./app-context";
import { useWallet } from "./wallet/wallet-provider";
import { Avatar, Button, cn, CopyButton, shorten, StatusIcon, timeAgo } from "./ui";
import { explorerAddressUrl, getNetwork, getNetworkByChainId } from "@/lib/networks";
import { api } from "@/lib/client/api";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; add?: { href: string; label: string } };

const NAV_PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderGit2, add: { href: "/projects/new", label: "New project" } },
  { href: "/runbooks", label: "Runbooks", icon: Workflow },
  { href: "/deployments", label: "Deployments", icon: Rocket },
];
const NAV_SECONDARY: NavItem[] = [
  { href: "/contracts", label: "Contracts", icon: FileCode2 },
  { href: "/network", label: "Network", icon: Network },
  { href: "/docs", label: "Documentation", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Official 4ORGE "4F" mark (vector trace of the brand logo; source in docs/brand). */
export function LogoMark({ className }: { className?: string }) {
  const gid = `forge-4-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="100 334 632 574" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#7b7d83" />
          <stop offset="0.45" stopColor="#55585f" />
          <stop offset="1" stopColor="#383b44" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gid})`} stroke="#2e3036" strokeWidth="3" fillRule="evenodd" d="M408 338 L408 852 L359 905 L358 702 L103 702 Z M358 478 L358 645 L215 645 Z" />
      <path fill="#3d89e9" d="M452 408 L728 408 L690 461 L502 461 L502 550 L452 600 Z" />
      <path fill="#3d89e9" d="M452 647 L507 592 L609 592 L632 548 L688 548 L639 646 L502 646 L502 755 L409 855 L409 778 L452 735 Z" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-[35px]" />
      {!compact && (
        <span className="text-[19px] font-semibold tracking-[0.06em] text-[#2b2d33]">
          4<span className="text-[#3d89e9]">ORGE</span>
        </span>
      )}
      {compact && <span className="sr-only">4ORGE</span>}
    </span>
  );
}

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <div className="group relative flex items-center">
      <Link
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={cn(
          "flex flex-1 items-center gap-3 rounded-full py-2 text-[14px] transition-colors",
          collapsed ? "justify-center px-0" : "px-3.5",
          active ? "bg-panel font-medium text-text shadow-[0_1px_3px_rgba(22,22,40,0.08)]" : "text-muted hover:bg-panel/60 hover:text-text",
        )}
      >
        <Icon className={cn("size-[18px] shrink-0", active ? "text-text" : "text-faint group-hover:text-muted")} strokeWidth={active ? 2.1 : 1.8} />
        {!collapsed && item.label}
      </Link>
      {item.add && !collapsed && (
        <Link
          href={item.add.href}
          onClick={onNavigate}
          aria-label={item.add.label}
          title={item.add.label}
          className="absolute right-2 flex size-7 items-center justify-center rounded-full text-faint hover:bg-panel hover:text-text"
        >
          <Plus className="size-4" />
        </Link>
      )}
    </div>
  );
}

function Sidebar({ collapsed, onToggle, onNavigate, mobile }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void; mobile?: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("mb-8 flex items-center", collapsed ? "justify-center" : "justify-between px-2")}>
        <Link href="/dashboard" onClick={onNavigate} aria-label="4ORGE dashboard">
          <Logo compact={collapsed} />
        </Link>
        {!collapsed && onToggle && (
          <button onClick={onToggle} aria-label={mobile ? "Close menu" : "Collapse sidebar"} className="flex size-8 items-center justify-center rounded-lg text-faint hover:bg-panel hover:text-text">
            {mobile ? <X className="size-[18px]" /> : <PanelLeft className="size-[18px]" />}
          </button>
        )}
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_PRIMARY.map((i) => <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />)}
      </nav>
      <div className={cn("my-5 border-t border-line-strong/70", collapsed ? "mx-2" : "mx-3")} />
      <nav className="flex flex-col gap-1">
        {NAV_SECONDARY.map((i) => <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />)}
        <Link
          href="/deploy"
          onClick={onNavigate}
          title={collapsed ? "New deployment" : undefined}
          className={cn("mt-2 flex items-center gap-3 rounded-full py-2 text-[14px] font-medium text-text hover:bg-panel/60", collapsed ? "justify-center" : "px-3.5")}
        >
          <Plus className="size-[18px]" />
          {!collapsed && "New deployment"}
        </Link>
      </nav>
      <div className="mt-auto">
        {collapsed && onToggle && (
          <button onClick={onToggle} aria-label="Expand sidebar" className="mx-auto mb-4 flex size-9 items-center justify-center rounded-lg text-faint hover:bg-panel hover:text-text">
            <PanelLeft className="size-[18px]" />
          </button>
        )}
        <ProfileCard collapsed={collapsed} />
      </div>
    </div>
  );
}

function ProfileCard({ collapsed }: { collapsed: boolean }) {
  const { config } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  if (!config) return null;
  const local = config.storageMode === "local";
  const name = config.user?.label ?? "Guest";
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={cn("flex w-full items-center gap-3 rounded-2xl text-left hover:bg-panel/70", collapsed ? "justify-center p-1" : "p-2")} aria-label="Workspace details">
        <Avatar name={local ? "Local Workspace" : name} size={40} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-text">{local ? "Local workspace" : name}</span>
              <span className={cn("block truncate text-xs", config.remoteAccess ? "text-warn" : "text-muted")}>
                {config.remoteAccess ? "Public test · no sign-in" : local ? "Stored on this machine" : "Supabase · cloud"}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-faint" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border border-line bg-panel p-4 text-[13px] text-muted shadow-pop">
          {local ? (
            <>
              <div className="font-medium text-text">{config.remoteAccess ? "Public test mode" : "Local mode"}</div>
              {config.remoteAccess ? (
                <p className="mt-1">
                  This server has no sign-in and accepts visitors from anywhere (<span className="mono text-text">FORGE_ALLOW_REMOTE_LOCAL_MODE</span>).
                  Anyone with the link can use this workspace. Fine for private testing; add Supabase before sharing it.
                </p>
              ) : (
                <p className="mt-1">Data is stored in <span className="mono text-text">.forge-data</span> on this computer and the app only accepts connections from it. Configure Supabase to host 4ORGE for a team.</p>
              )}
            </>
          ) : (
            <>
              <div className="font-medium text-text">Signed in as {name}</div>
              <p className="mt-1">Projects and deployments are private to your account (Row Level Security).</p>
            </>
          )}
          <div className="mt-3 flex items-center justify-between">
            <Link href="/settings" onClick={() => setOpen(false)} className="font-medium text-accent">Settings →</Link>
            {!local && config.user && (
              <button
                onClick={async () => {
                  const { createBrowserClient } = await import("@supabase/ssr");
                  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
                  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                  if (url && key) await createBrowserClient(url, key).auth.signOut();
                  // Full reload on purpose: clears all in-memory workspace state after signing out.
                  window.location.replace(new URL("/login", window.location.origin));
                }}
                className="flex items-center gap-1.5 font-medium text-muted hover:text-text"
              >
                <LogOut className="size-3.5" /> Sign out
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOutside]);
}

function NetworkSwitcher() {
  const { networks, network, setNetworkId, rpcStatus, rpcChecking } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const dot = rpcChecking && !rpcStatus ? "bg-faint animate-pulse" : rpcStatus?.ok ? "bg-ok" : rpcStatus ? "bg-bad" : "bg-faint";
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2 rounded-full px-3 text-[14px] text-text hover:bg-panel" aria-label="Select network">
        <span className="relative">
          <Globe2 className="size-[18px] text-muted" />
          <span className={cn("absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-bg", dot)} title={rpcStatus?.error ?? (rpcStatus?.ok ? "RPC healthy" : "Checking RPC")} />
        </span>
        <span className="hidden sm:inline">{network.name}</span>
        <span className="max-[420px]:hidden sm:hidden">{network.shortName}</span>
        <ChevronDown className="size-4 text-faint" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-line bg-panel p-2 shadow-pop">
          {networks.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setNetworkId(n.id);
                setOpen(false);
              }}
              className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel-2", n.id === network.id && "bg-panel-2")}
            >
              <span className={cn("mt-1.5 size-2 rounded-full", n.kind === "mainnet" ? "bg-warn" : n.kind === "testnet" ? "bg-accent" : "bg-faint")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium text-text">
                  {n.name}
                  <span className="mono text-[11px] font-normal text-faint">#{n.chainId}</span>
                </span>
                <span className="block text-xs text-muted">{n.deploymentsAllowed ? "Deployments enabled" : "Read-only · deployments locked"}</span>
              </span>
            </button>
          ))}
          <Link href="/network" onClick={() => setOpen(false)} className="mt-1 block border-t border-line px-3 pt-2.5 pb-1.5 text-xs font-medium text-accent">
            Network details & custom RPC →
          </Link>
        </div>
      )}
    </div>
  );
}

interface Pending {
  id: string;
  runbookId: string;
  runbookName: string;
  status: string;
  createdAt: string;
}

/** Bell: Runbook executions that are waiting on the user (review or wallet signature). */
function Notifications() {
  const pathname = usePathname();
  const [items, setItems] = useState<Pending[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ activeExecutions: Pending[] }>("/overview")
        .then((o) => alive && setItems(o.activeExecutions))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);
  const waiting = items.filter((i) => i.status !== "running");
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] text-muted hover:bg-panel hover:text-text" aria-label={`Notifications (${waiting.length})`}>
        <Bell className="size-[18px]" />
        {waiting.length > 0 && <span className="text-text">+{waiting.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-line bg-panel p-2 shadow-pop">
          <div className="px-3 pt-1.5 pb-2 text-xs font-medium text-muted">Runbooks in progress</div>
          {items.length === 0 && <p className="px-3 pb-3 text-sm text-muted">Nothing needs your attention.</p>}
          {items.map((i) => (
            <Link key={i.id} href={`/runbooks/${i.runbookId}/executions/${i.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-panel-2">
              <StatusIcon status={i.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text">{i.runbookName}</span>
                <span className="block text-xs text-muted">
                  {i.status === "awaiting_wallet" ? "Waiting for your wallet signature" : i.status === "awaiting_confirmation" ? "Waiting for your review" : "Running"} · {timeAgo(i.createdAt)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface SearchHit {
  kind: "Project" | "Runbook" | "Deployment";
  title: string;
  sub: string;
  href: string;
}

/** Quick search across projects, Runbooks and deployments (loaded on first focus). */
function QuickSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<SearchHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  async function load() {
    if (index) return;
    try {
      const [p, r, d] = await Promise.all([
        api<{ projects: { id: string; name: string; detection: { framework: string } }[] }>("/projects"),
        api<{ runbooks: { id: string; name: string; projectName: string }[] }>("/runbooks"),
        api<{ deployments: { id: string; contractName: string; contractAddress: string | null; txHash: string; network: string }[] }>("/deployments"),
      ]);
      setIndex([
        ...p.projects.map((x) => ({ kind: "Project" as const, title: x.name, sub: x.detection.framework, href: `/projects/${x.id}` })),
        ...r.runbooks.map((x) => ({ kind: "Runbook" as const, title: x.name, sub: x.projectName, href: `/runbooks/${x.id}` })),
        ...d.deployments.map((x) => ({
          kind: "Deployment" as const,
          title: x.contractName,
          sub: `${x.contractAddress ?? x.txHash} · ${x.network}`,
          href: `/deployments/${x.id}`,
        })),
      ]);
    } catch {
      setIndex([]);
    }
  }

  const hits = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || !index) return [];
    return index.filter((h) => `${h.title} ${h.sub}`.toLowerCase().includes(term)).slice(0, 8);
  }, [q, index]);

  return (
    <div className="relative hidden w-full max-w-xs md:block" ref={ref}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
      <input
        value={q}
        onFocus={() => {
          setOpen(true);
          void load();
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) {
            router.push(hits[0].href);
            setOpen(false);
            setQ("");
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search…"
        aria-label="Search projects, Runbooks and deployments"
        className="h-10 w-full rounded-full bg-transparent pr-3 pl-9 text-[14px] text-text placeholder:text-faint hover:bg-panel/60 focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/10"
      />
      {open && q.trim() && (
        <div className="absolute left-0 z-40 mt-2 w-96 max-w-[90vw] rounded-2xl border border-line bg-panel p-2 shadow-pop">
          {index === null && <p className="px-3 py-2 text-sm text-muted">Loading…</p>}
          {index && hits.length === 0 && <p className="px-3 py-2 text-sm text-muted">No matches for “{q}”.</p>}
          {hits.map((h) => (
            <Link key={h.href} href={h.href} onClick={() => { setOpen(false); setQ(""); }} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-panel-2">
              <span className="w-[74px] shrink-0 text-[11px] font-medium text-faint">{h.kind}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-text">{h.title}</span>
                <span className="mono block truncate text-[11px] text-muted">{h.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function WalletButton() {
  const w = useWallet();
  const { network } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const mismatch = w.address && w.chainId !== null && w.chainId !== network.chainId;
  const walletNet = w.chainId ? getNetworkByChainId(w.chainId) : undefined;

  if (!w.address) {
    return (
      <div className="relative" ref={ref}>
        <Button variant="primary" className="h-10 max-sm:w-10 max-sm:px-0" icon={<Wallet className="size-4" />} loading={w.connecting} onClick={() => setOpen((o) => !o)} aria-label="Connect wallet">
          <span className="max-sm:hidden">Connect wallet</span>
        </Button>
        {open && (
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-line bg-panel p-3 shadow-pop">
            <p className="px-1 pb-3 text-[13px] text-muted">Choose a browser wallet. 4ORGE never asks for your seed phrase or private key.</p>
            {w.wallets.length === 0 && (
              <div className="rounded-xl bg-panel-2 p-3 text-[13px] text-muted">
                No wallet detected. Install{" "}
                <a className="font-medium text-accent underline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a> or{" "}
                <a className="font-medium text-accent underline" href="https://rabby.io/" target="_blank" rel="noreferrer">Rabby</a> and reload.
              </div>
            )}
            {w.wallets.map((info) => (
              <button
                key={info.uuid}
                onClick={async () => {
                  setOpen(false);
                  await w.connect(info.rdns || info.uuid);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium text-text hover:bg-panel-2"
              >
                {info.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={info.icon} alt="" className="size-6 rounded-md" />
                ) : (
                  <span className="flex size-6 items-center justify-center rounded-md bg-panel-3"><Wallet className="size-3.5 text-muted" /></span>
                )}
                {info.name}
              </button>
            ))}
            {w.error && <p className="mt-2 rounded-xl bg-bad/8 px-3 py-2 text-xs text-bad">{w.error}</p>}
          </div>
        )}
        {!open && w.error && (
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-bad/20 bg-panel p-3 text-xs text-bad shadow-pop">
            {w.error}
            <button className="ml-2 underline" onClick={w.clearError}>Dismiss</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium",
          mismatch ? "bg-warn/12 text-warn ring-1 ring-warn/30" : "bg-ink text-white hover:bg-[#2a2a35]",
        )}
      >
        {mismatch ? <AlertTriangle className="size-4" /> : <span className="size-2 rounded-full bg-[#7ee2b0]" />}
        <span className="mono max-sm:hidden">{shorten(w.address, 6, 4)}</span>
        <ChevronDown className="size-4 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-line bg-panel p-4 shadow-pop">
          <div className="flex items-center gap-3">
            <Avatar name={w.address.slice(2, 6)} size={36} />
            <div className="min-w-0">
              <div className="text-xs text-muted">Connected with {w.active?.name ?? "wallet"}</div>
              <div className="flex items-center gap-1">
                <span className="mono truncate text-[13px] text-text">{shorten(w.address, 10, 8)}</span>
                <CopyButton value={w.address} />
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5 rounded-xl bg-panel-2 px-3 py-2.5 text-xs">
            <div className="flex justify-between text-muted">
              <span>Wallet network</span>
              <span className="text-text">{walletNet ? walletNet.name : `Chain ${w.chainId}`}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>4ORGE network</span>
              <span className="text-text">{network.name}</span>
            </div>
          </div>
          <WalletBalance address={w.address} />
          {mismatch && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-warn">Your wallet is on a different network than the one selected in 4ORGE.</p>
              <Button
                size="sm"
                variant="primary"
                className="w-full"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await w.switchNetwork(network.id);
                  } catch {
                    /* error is displayed by wallet provider */
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Switch wallet to {network.name}
              </Button>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {network.explorerUrl && (
              <a href={explorerAddressUrl(getNetwork(network.id), w.address) ?? "#"} target="_blank" rel="noreferrer" className="flex h-8 flex-1 items-center justify-center rounded-full border border-line-strong text-xs text-muted hover:text-text">
                View in explorer
              </a>
            )}
            <button
              onClick={async () => {
                await w.disconnect();
                setOpen(false);
              }}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong text-xs text-muted hover:text-text"
            >
              <LogOut className="size-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Real balance of the connected account on the selected 4ORGE network, read from the chain. */
function WalletBalance({ address }: { address: string }) {
  const { network } = useApp();
  const [state, setState] = useState<{ key: string; formatted?: string; symbol?: string; error?: string } | null>(null);
  const key = `${network.id}:${address}`;
  useEffect(() => {
    let alive = true;
    api<{ formatted: string; symbol: string }>(`/networks/${network.id}/balance?address=${address}`)
      .then((r) => alive && setState({ key, formatted: r.formatted, symbol: r.symbol }))
      .catch((e) => alive && setState({ key, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [key, network.id, address]);
  const current = state?.key === key ? state : null;
  const amount = current?.formatted !== undefined ? Number(current.formatted) : null;
  return (
    <div className="mt-3 rounded-xl border border-line px-3 py-2.5">
      <div className="text-xs text-muted">Balance on {network.name}</div>
      {!current && <div className="mt-0.5 text-sm text-faint">Checking…</div>}
      {current?.error && <div className="mt-0.5 text-xs text-bad">{current.error}</div>}
      {amount !== null && (
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="text-lg font-medium text-text tabular-nums">
            {amount === 0 ? "0" : amount < 0.0001 ? "< 0.0001" : amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
            <span className="text-sm text-muted">{current?.symbol}</span>
          </span>
          {amount === 0 && network.faucetUrl && (
            <a href={network.faucetUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent">Get test QIE →</a>
          )}
        </div>
      )}
    </div>
  );
}

const COLLAPSE_KEY = "4orge.sidebar-collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const { config } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // Restore the remembered sidebar state after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 border-r border-line-strong/60 bg-sidebar py-6 transition-[width] lg:block", collapsed ? "w-[84px] px-3" : "w-[272px] px-4")}>
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#16161d]/30 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-sidebar px-4 py-6 shadow-pop">
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} mobile />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur">
          <div className="mx-auto flex h-[72px] w-full max-w-[1280px] items-center gap-2 px-4 sm:px-8">
            <button className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-panel lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <Link href="/dashboard" className="lg:hidden" aria-label="4ORGE dashboard">
              <Logo compact />
            </Link>
            {config?.user && <QuickSearch />}
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {config?.user && <Notifications />}
              {config?.user && <NetworkSwitcher />}
              {config?.user && <WalletButton />}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-4 pb-12 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
