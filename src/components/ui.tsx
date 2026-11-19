"use client";

import Link from "next/link";
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy, ExternalLink, Info, Loader2, XCircle } from "lucide-react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-[#7c4dee] border border-[#9b74f8]/40 shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset]",
  secondary: "bg-panel-3 text-text border border-line-strong hover:bg-[#21212c] hover:border-[#3a3a48]",
  ghost: "text-muted hover:text-text hover:bg-panel-3 border border-transparent",
  danger: "bg-transparent text-bad border border-bad/40 hover:bg-bad/10",
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
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
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
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
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
  return <div className={cn("rounded-lg border border-line bg-panel", padded && "p-5", className)}>{children}</div>;
}

export function CardHeader({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-faint">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs text-faint">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-text sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "accent" | "blue";
const TONES: Record<Tone, string> = {
  neutral: "bg-panel-3 text-muted border-line-strong",
  ok: "bg-ok/10 text-ok border-ok/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/25",
  accent: "bg-accent/12 text-accent-strong border-accent/30",
  blue: "bg-blue/10 text-blue-strong border-blue/30",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap", TONES[tone], className)}>
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
  awaiting_confirmation: { tone: "accent", label: "Awaiting confirmation" },
  failed: { tone: "bad", label: "Failed" },
  error: { tone: "bad", label: "Error" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  skipped: { tone: "neutral", label: "Skipped" },
  unverified: { tone: "neutral", label: "Unverified" },
  unsupported: { tone: "neutral", label: "Unsupported" },
  "no-tests": { tone: "warn", label: "No tests" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as Tone, label: status };
  return <Badge tone={s.tone}>{label ?? s.label}</Badge>;
}

export function StatusIcon({ status, className }: { status: string; className?: string }) {
  const c = cn("size-4 shrink-0", className);
  if (["succeeded", "confirmed", "passed", "verified"].includes(status)) return <CheckCircle2 className={cn(c, "text-ok")} />;
  if (["failed", "error"].includes(status)) return <XCircle className={cn(c, "text-bad")} />;
  if (status === "warning" || status === "no-tests") return <AlertTriangle className={cn(c, "text-warn")} />;
  if (["running", "waiting", "awaiting_wallet", "awaiting_confirmation"].includes(status)) return <Loader2 className={cn(c, "animate-spin text-blue-strong")} />;
  return <CircleDashed className={cn(c, "text-faint")} />;
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
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-line">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-lg border border-line bg-panel-2 p-2.5 text-muted">{icon}</div>}
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Callout({ tone = "neutral", title, children, className }: { tone?: "neutral" | "warn" | "bad" | "ok" | "blue"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const styles = {
    neutral: "border-line-strong bg-panel-2 text-muted",
    warn: "border-warn/30 bg-warn/[0.06] text-[#f3d08a]",
    bad: "border-bad/30 bg-bad/[0.06] text-[#f6a7a7]",
    ok: "border-ok/30 bg-ok/[0.06] text-[#9be2b4]",
    blue: "border-blue/30 bg-blue/[0.06] text-[#a9c8f8]",
  }[tone];
  const Icon = tone === "bad" ? XCircle : tone === "warn" ? AlertTriangle : tone === "ok" ? CheckCircle2 : Info;
  return (
    <div className={cn("flex gap-2.5 rounded-md border px-3.5 py-3 text-sm", styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className="text-[13px] leading-relaxed opacity-90 [&_a]:underline">{children}</div>}
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
  "rounded-md border border-line-strong bg-panel-2 px-3 text-sm text-text placeholder:text-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

// Full width unless the caller sets an explicit width (avoids conflicting w-* classes).
const width = (className?: string) => (/(^|\s)w-/.test(className ?? "") ? "" : "w-full");

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(field, width(props.className), "h-9", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(field, width(props.className), "py-2", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(field, width(props.className), "h-9 pr-8", props.className)} />;
}

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block">
      <span className="text-xs font-medium text-text">{children}</span>
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
      className={cn("inline-flex size-6 items-center justify-center rounded text-faint hover:bg-panel-3 hover:text-text", className)}
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
    <span className={cn("inline-flex min-w-0 items-center gap-0.5", className)}>
      <span className="mono truncate text-[13px] text-text" title={value}>
        {full ? value : shorten(value, 8, 6)}
      </span>
      <CopyButton value={value} />
      {href && (
        <a href={href} target="_blank" rel="noreferrer" title="Open in explorer" className="inline-flex size-6 items-center justify-center rounded text-faint hover:bg-panel-3 hover:text-blue-strong">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "ok" | "bad" | "accent" }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums tracking-tight", tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent-strong" : "text-text")}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist">
      <div className="flex min-w-max gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              value === t.id ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded bg-panel-3 px-1.5 text-[11px] text-faint">{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CodeBlock({ children, className, maxHeight = "28rem" }: { children: string; className?: string; maxHeight?: string }) {
  return (
    <div className={cn("group relative rounded-md border border-line bg-[#0b0b10]", className)}>
      <CopyButton value={children} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100" />
      <pre className="mono overflow-auto p-3.5 text-[12px] leading-relaxed text-[#cfcfdc]" style={{ maxHeight }}>
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
    <div className={cn("overflow-x-auto rounded-lg border border-line", className)}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("border-b border-line bg-panel-2 px-4 py-2.5 text-xs font-medium text-muted", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle text-muted", className)}>{children}</td>;
}
