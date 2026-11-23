"use client";

import Link from "next/link";
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertTriangle, Ban, Check, CheckCircle2, CircleDashed, Clock3, Copy, ExternalLink, Info, Loader2, XCircle } from "lucide-react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-[#2a2a35] shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
  secondary: "bg-panel text-text border border-line-strong hover:border-[#c8c8d8] hover:bg-panel-2",
  ghost: "text-muted hover:text-text hover:bg-panel-3",
  danger: "bg-panel text-bad border border-bad/30 hover:bg-bad/5",
  soft: "bg-accent-soft text-accent-strong hover:bg-[#d6e5fb]",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: "sm" | "md";
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors whitespace-nowrap",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cn("rounded-2xl border border-line/70 bg-panel shadow-card", padded && "p-6", className)}>{children}</div>;
}

export function CardHeader({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-faint">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[17px] font-medium tracking-tight text-text">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[13px] text-faint [&_a:hover]:text-text">{eyebrow}</div>}
        <h1 className="text-2xl font-medium tracking-tight text-text sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "accent" | "blue";
const TONES: Record<Tone, string> = {
  neutral: "bg-panel-3 text-muted",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  bad: "bg-bad/10 text-bad",
  accent: "bg-accent-soft text-accent-strong",
  blue: "bg-blue/10 text-blue-strong",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-[1.4] whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  succeeded: { tone: "ok", label: "Succeeded" },
  confirmed: { tone: "ok", label: "Confirmed" },
  passed: { tone: "ok", label: "Passed" },
  verified: { tone: "ok", label: "Verified" },
  warning: { tone: "warn", label: "Warning" },
  pending: { tone: "neutral", label: "Pending" },
  waiting: { tone: "blue", label: "Waiting" },
  running: { tone: "blue", label: "Running" },
  awaiting_wallet: { tone: "accent", label: "Awaiting wallet" },
  awaiting_confirmation: { tone: "accent", label: "Awaiting review" },
  failed: { tone: "bad", label: "Failed" },
  error: { tone: "bad", label: "Error" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  skipped: { tone: "neutral", label: "Skipped" },
  unverified: { tone: "neutral", label: "Unverified" },
  unsupported: { tone: "neutral", label: "Unsupported" },
  "no-tests": { tone: "warn", label: "No tests" },
};

const PILL_TONE: Record<Tone, string> = {
  neutral: "text-muted",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  accent: "text-accent",
  blue: "text-blue",
};

/** Outlined status pill with an icon — status is never conveyed by color alone. */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as Tone, label: status };
  const Icon =
    s.tone === "ok" ? CheckCircle2 : s.tone === "bad" ? Ban : s.tone === "warn" ? AlertTriangle : s.tone === "accent" ? Clock3 : s.tone === "blue" ? Loader2 : CircleDashed;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-panel px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap", PILL_TONE[s.tone])}>
      <Icon className={cn("size-3.5", s.tone === "blue" && "animate-spin")} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

export function StatusIcon({ status, className }: { status: string; className?: string }) {
  const c = cn("size-[18px] shrink-0", className);
  if (["succeeded", "confirmed", "passed", "verified"].includes(status)) return <CheckCircle2 className={cn(c, "text-ok")} aria-label={status} />;
  if (["failed", "error"].includes(status)) return <XCircle className={cn(c, "text-bad")} aria-label={status} />;
  if (status === "warning" || status === "no-tests") return <AlertTriangle className={cn(c, "text-warn")} aria-label={status} />;
  if (["running", "waiting", "awaiting_wallet", "awaiting_confirmation"].includes(status)) return <Loader2 className={cn(c, "animate-spin text-accent")} aria-label={status} />;
  return <CircleDashed className={cn(c, "text-faint")} aria-label={status} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-2xl bg-panel/60">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-panel/60 px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-panel text-accent shadow-card">{icon}</div>}
      <h3 className="text-[15px] font-medium text-text">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Callout({ tone = "neutral", title, children, className }: { tone?: "neutral" | "warn" | "bad" | "ok" | "blue"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const styles = {
    neutral: "bg-panel-2 text-muted border-line",
    warn: "bg-[#fdf6e8] text-[#8a5a12] border-[#f3e2bd]",
    bad: "bg-[#fdeef2] text-[#a92f53] border-[#f6d3dd]",
    ok: "bg-[#eaf7f0] text-[#17774b] border-[#cfecdd]",
    blue: "bg-accent-soft/70 text-accent-strong border-[#cfe0f8]",
  }[tone];
  const Icon = tone === "bad" ? XCircle : tone === "warn" ? AlertTriangle : tone === "ok" ? CheckCircle2 : Info;
  return (
    <div className={cn("flex gap-2.5 rounded-xl border px-4 py-3 text-sm", styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className="text-[13px] leading-relaxed opacity-95 [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <Callout tone="bad" title="Could not load data">
      <p>{error.message}</p>
      {retry && (
        <button onClick={retry} className="mt-2 text-xs font-medium underline">
          Try again
        </button>
      )}
    </Callout>
  );
}

const field =
  "rounded-xl border border-line-strong bg-panel px-3.5 text-sm text-text placeholder:text-faint focus:border-accent/50 focus:outline-none focus:ring-4 focus:ring-accent/10 disabled:opacity-60";

// Full width unless the caller sets an explicit width (avoids conflicting w-* classes).
const width = (className?: string) => (/(^|\s)w-/.test(className ?? "") ? "" : "w-full");

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(field, width(props.className), "h-10", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(field, width(props.className), "py-2.5", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(field, width(props.className), "h-10 pr-8", props.className)} />;
}

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block">
      <span className="text-[13px] font-medium text-text">{children}</span>
      {hint && <span className="ml-1.5 text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function CopyButton({ value, className, label }: { value: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      aria-label={label ?? "Copy to clipboard"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={cn("inline-flex size-6 items-center justify-center rounded-md text-faint hover:bg-panel-3 hover:text-text", className)}
    >
      {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function shorten(value: string, head = 6, tail = 4) {
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** A hash/address with copy and (optional) explorer link. */
export function HexValue({ value, href, full, className }: { value: string; href?: string | null; full?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-0.5", className)}>
      <span className="mono truncate text-[13px] text-text" title={value}>
        {full ? value : shorten(value, 8, 6)}
      </span>
      <CopyButton value={value} />
      {href && (
        <a href={href} target="_blank" rel="noreferrer" title="Open in explorer" className="inline-flex size-6 items-center justify-center rounded-md text-faint hover:bg-panel-3 hover:text-accent">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}

export type Pastel = "pink" | "lilac" | "blue" | "mint";

/** Pastel headline tile (icon in a white circle, label, big value). */
export function StatTile({ label, value, unit, icon, pastel = "lilac", hint }: { label: string; value: ReactNode; unit?: ReactNode; icon: ReactNode; pastel?: Pastel; hint?: ReactNode }) {
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl px-5 py-4", `bg-pastel-${pastel}`)}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-panel text-text shadow-[0_1px_2px_rgba(0,0,0,0.05)]">{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-[13px] text-muted">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-medium tracking-tight text-text tabular-nums">{value}</span>
          {unit && <span className="truncate text-[13px] text-muted">{unit}</span>}
        </div>
        {hint && <div className="truncate text-xs text-faint">{hint}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "ok" | "bad" | "accent" }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-panel px-5 py-4 shadow-card">
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{label}</span>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <div className={cn("mt-1.5 text-2xl font-medium tabular-nums tracking-tight", tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent" : "text-text")}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

const AVATAR_TINTS = ["#fbe4ec", "#e5eefc", "#e3f4ee", "#fdf1dc", "#e3ebfb", "#f1e6f7"];

/** Initials avatar on a pastel tint chosen deterministically from the name. */
export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-text/80", className)}
      style={{ width: size, height: size, background: AVATAR_TINTS[h % AVATAR_TINTS.length] }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Small donut showing completion (0–1). Accompanied by a % label for accessibility. */
export function ProgressRing({ value, tone = "accent", size = 28 }: { value: number; tone?: "accent" | "ok" | "bad"; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = tone === "ok" ? "var(--ok)" : tone === "bad" ? "var(--rose)" : "var(--accent)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-3)" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(1, value)) * c} ${c}`} />
    </svg>
  );
}

/** Segmented pill tabs (white active pill on a soft track). */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="mb-6 max-w-full overflow-x-auto" role="tablist">
      <div className="inline-flex min-w-max gap-1 rounded-full bg-panel-3/80 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
              value === t.id ? "bg-panel font-medium text-text shadow-[0_1px_3px_rgba(22,22,40,0.1)]" : "text-muted hover:text-text",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cn("rounded-full px-1.5 text-[11px]", value === t.id ? "bg-accent-soft text-accent-strong" : "bg-panel/70 text-faint")}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CodeBlock({ children, className, maxHeight = "28rem" }: { children: string; className?: string; maxHeight?: string }) {
  return (
    <div className={cn("group relative rounded-xl border border-line bg-panel-2", className)}>
      <CopyButton value={children} className="absolute right-2 top-2 bg-panel opacity-0 shadow-card group-hover:opacity-100" />
      <pre className="mono overflow-auto p-4 text-[12px] leading-relaxed text-[#33334a]" style={{ maxHeight }}>
        {children}
      </pre>
    </div>
  );
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-x-auto rounded-2xl border border-line/70 bg-panel px-2 shadow-card", className)}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("border-b border-line px-4 py-3 text-[13px] font-normal text-muted", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-line px-4 py-4 align-middle text-muted [tr:last-child_&]:border-0", className)}>{children}</td>;
}
