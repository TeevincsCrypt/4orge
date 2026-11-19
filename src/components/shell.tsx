"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  ChevronDown,
  FileCode2,
  FolderGit2,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Rocket,
  ScrollText,
  Settings,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import { useApp } from "./app-context";
import { useWallet } from "./wallet/wallet-provider";
import { Badge, Button, cn, CopyButton, shorten } from "./ui";
import { getNetworkByChainId, explorerAddressUrl, getNetwork } from "@/lib/networks";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderGit2 },
  { href: "/runbooks", label: "Runbooks", icon: Workflow },
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/contracts", label: "Contracts", icon: FileCode2 },
  { href: "/network", label: "Network", icon: Network },
  { href: "/docs", label: "Documentation", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <defs>
          <linearGradient id="forge-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="7" fill="#121219" stroke="#2f2f3b" />
        <path d="M18.5 7 9 18.5h7.5V25h3v-6.5H23v-3h-3.5V7h-1Zm-2 8.5h-3.1l3.1-3.8v3.8Z" fill="url(#forge-g)" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[0.18em] text-text">4ORGE</span>
    </span>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active ? "bg-panel-3 text-text" : "text-muted hover:bg-panel-2 hover:text-text",
            )}
          >
            <Icon className={cn("size-4", active ? "text-accent-strong" : "text-faint")} />
            {label}
          </Link>
        );
      })}
    </nav>
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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-2 rounded-md border border-line-strong bg-panel-2 px-2.5 text-xs text-text hover:border-[#3a3a48]"
        aria-label="Select network"
      >
        <span className={cn("size-2 rounded-full", dot)} title={rpcStatus?.error ?? (rpcStatus?.ok ? "RPC healthy" : "Checking RPC")} />
        <span className="hidden sm:inline">{network.name}</span>
        <span className="sm:hidden">{network.shortName}</span>
        {network.kind === "mainnet" && <Badge tone="warn">Mainnet</Badge>}
        <ChevronDown className="size-3.5 text-faint" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-72 rounded-lg border border-line-strong bg-panel-2 p-1.5 shadow-2xl shadow-black/50">
          {networks.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setNetworkId(n.id);
                setOpen(false);
              }}
              className={cn("flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-panel-3", n.id === network.id && "bg-panel-3")}
            >
              <span className={cn("mt-1.5 size-2 rounded-full", n.kind === "mainnet" ? "bg-warn" : n.kind === "testnet" ? "bg-blue" : "bg-faint")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm text-text">
                  {n.name}
                  <span className="mono text-[11px] text-faint">#{n.chainId}</span>
                </span>
                <span className="block text-xs text-muted">{n.deploymentsAllowed ? "Deployments enabled" : "Read-only · deployments locked"}</span>
              </span>
            </button>
          ))}
          <Link href="/network" onClick={() => setOpen(false)} className="mt-1 block border-t border-line px-2.5 pt-2 pb-1 text-xs text-muted hover:text-text">
            Network details & custom RPC →
          </Link>
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
        <Button variant="primary" size="sm" className="h-8" icon={<Wallet className="size-3.5" />} loading={w.connecting} onClick={() => setOpen((o) => !o)}>
          Connect wallet
        </Button>
        {open && (
          <div className="absolute right-0 z-40 mt-1.5 w-72 rounded-lg border border-line-strong bg-panel-2 p-2 shadow-2xl shadow-black/50">
            <p className="px-1.5 pb-2 text-xs text-muted">Choose a browser wallet. 4ORGE never asks for your seed phrase or private key.</p>
            {w.wallets.length === 0 && (
              <div className="rounded-md border border-dashed border-line-strong p-3 text-xs text-muted">
                No wallet detected. Install{" "}
                <a className="text-blue-strong underline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a> or{" "}
                <a className="text-blue-strong underline" href="https://rabby.io/" target="_blank" rel="noreferrer">Rabby</a> and reload.
              </div>
            )}
            {w.wallets.map((info) => (
              <button
                key={info.uuid}
                onClick={async () => {
                  setOpen(false);
                  await w.connect(info.rdns || info.uuid);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm text-text hover:bg-panel-3"
              >
                {info.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={info.icon} alt="" className="size-5 rounded" />
                ) : (
                  <Wallet className="size-5 text-faint" />
                )}
                {info.name}
              </button>
            ))}
            {w.error && <p className="mt-2 rounded-md bg-bad/10 px-2 py-1.5 text-xs text-bad">{w.error}</p>}
          </div>
        )}
        {!open && w.error && (
          <div className="absolute right-0 z-40 mt-1.5 w-72 rounded-md border border-bad/30 bg-panel-2 p-2.5 text-xs text-bad shadow-xl">
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
          "flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs",
          mismatch ? "border-warn/40 bg-warn/10 text-warn" : "border-line-strong bg-panel-2 text-text hover:border-[#3a3a48]",
        )}
      >
        {mismatch ? <AlertTriangle className="size-3.5" /> : <span className="size-2 rounded-full bg-ok" />}
        <span className="mono">{shorten(w.address, 6, 4)}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-80 rounded-lg border border-line-strong bg-panel-2 p-3 shadow-2xl shadow-black/50">
          <div className="text-xs text-muted">Connected with {w.active?.name ?? "wallet"}</div>
          <div className="mt-1 flex items-center gap-1">
            <span className="mono truncate text-sm text-text">{w.address}</span>
            <CopyButton value={w.address} />
          </div>
          <div className="mt-3 rounded-md border border-line bg-panel px-2.5 py-2 text-xs">
            <div className="flex justify-between text-muted">
              <span>Wallet network</span>
              <span className="text-text">{walletNet ? walletNet.name : `Chain ${w.chainId}`}</span>
            </div>
            <div className="mt-1 flex justify-between text-muted">
              <span>4ORGE network</span>
              <span className="text-text">{network.name}</span>
            </div>
          </div>
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
              <a href={explorerAddressUrl(getNetwork(network.id), w.address) ?? "#"} target="_blank" rel="noreferrer" className="flex-1 rounded-md border border-line-strong px-2 py-1.5 text-center text-xs text-muted hover:text-text">
                View in explorer
              </a>
            )}
            <button
              onClick={async () => {
                await w.disconnect();
                setOpen(false);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line-strong px-2 py-1.5 text-xs text-muted hover:text-text"
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

export function AppShell({ children }: { children: ReactNode }) {
  const { config } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-panel px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 px-1.5">
          <Logo />
        </Link>
        <NavLinks />
        <div className="mt-auto space-y-3 px-1.5">
          <Link href="/deploy" className="flex items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent-strong hover:bg-accent/15">
            <Rocket className="size-4" />
            Start deployment
          </Link>
          <ModeIndicator />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-panel px-3 py-4">
            <div className="mb-6 flex items-center justify-between px-1.5">
              <Logo />
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="text-muted">
                <X className="size-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto space-y-3 px-1.5">
              <Link href="/deploy" onClick={() => setMobileOpen(false)} className="flex items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent-strong">
                <Rocket className="size-4" />
                Start deployment
              </Link>
              <ModeIndicator />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6">
          <button className="text-muted lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <Link href="/" className="lg:hidden">
            <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {config?.user && <NetworkSwitcher />}
            {config?.user && <WalletButton />}
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

function ModeIndicator() {
  const { config } = useApp();
  if (!config) return null;
  return (
    <div className="rounded-md border border-line bg-panel-2 px-2.5 py-2 text-[11px] leading-snug text-faint">
      {config.storageMode === "local" ? (
        <>
          <div className="flex items-center gap-1.5 font-medium text-muted">
            <ScrollText className="size-3" /> Local mode
          </div>
          Data is stored on this machine (.forge-data). Supabase is not configured.
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 font-medium text-muted">
            <Boxes className="size-3" /> Supabase
          </div>
          {config.user ? `Signed in as ${config.user.label}` : "Not signed in"}
        </>
      )}
    </div>
  );
}
