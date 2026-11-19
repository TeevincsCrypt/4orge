"use client";

import { useMemo, useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { cn } from "./ui";

export type TimelineEvent = { kind: "build" | "test" | "execution" | "deployment"; at: string };

const METRICS = {
  all: { label: "All activity", unit: "events", kinds: ["build", "test", "execution", "deployment"] },
  deployment: { label: "Deployments", unit: "deploys", kinds: ["deployment"] },
  build: { label: "Builds", unit: "builds", kinds: ["build"] },
  test: { label: "Test runs", unit: "runs", kinds: ["test"] },
  execution: { label: "Runbook runs", unit: "runs", kinds: ["execution"] },
} as const;
type Metric = keyof typeof METRICS;

function niceMax(v: number) {
  // Always a multiple of 4 so the four gridlines land on whole numbers.
  const steps = [4, 8, 12, 16, 20, 24, 32, 40, 48, 60, 80, 100, 120, 160, 200];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 40) * 40;
}

/**
 * Weekly activity bar chart (single series): one hue for every bar, today
 * emphasised, solid hairline grid, a dashed reference line at the week's peak,
 * value labels only on today + peak (hover shows the rest), and a table view
 * for screen readers.
 */
export function ActivityChart({ events }: { events: TimelineEvent[] }) {
  const [metric, setMetric] = useState<Metric>("all");
  const [hover, setHover] = useState<number | null>(null);

  const days = useMemo(() => {
    const kinds = METRICS[metric].kinds as readonly string[];
    const out: { label: string; date: Date; value: number; today: boolean }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      out.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), date: d, value: 0, today: i === 0 });
    }
    for (const e of events) {
      if (!kinds.includes(e.kind)) continue;
      const t = new Date(e.at);
      const day = out.find((d) => d.date.getFullYear() === t.getFullYear() && d.date.getMonth() === t.getMonth() && d.date.getDate() === t.getDate());
      if (day) day.value++;
    }
    return out;
  }, [events, metric]);

  const max = Math.max(...days.map((d) => d.value));
  // Headroom above the peak so value pills never collide with the header.
  const top = niceMax(Math.ceil(max * 1.25));
  const ticks = [top, (top * 3) / 4, top / 2, top / 4, 0];
  const total = days.reduce((a, d) => a + d.value, 0);
  const avg = total / 7;
  const peakIndex = max > 0 ? days.findIndex((d) => d.value === max) : -1;
  const PLOT = 220;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
        <div className="flex items-center gap-3">
          <h2 className="text-[17px] font-medium tracking-tight text-text">Activity</h2>
          <span className="h-5 w-px bg-line-strong" />
          <label className="relative flex items-center text-[13px] text-muted">
            <span className="sr-only">Metric</span>
            <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="cursor-pointer appearance-none bg-transparent pr-5 text-[13px] text-muted hover:text-text focus:outline-none">
              {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 size-3.5" />
          </label>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[26px] font-medium tracking-tight text-text tabular-nums">{avg.toFixed(1)}</span>
          <span className="text-[13px] text-muted">{METRICS[metric].unit}/day (avg)</span>
          <Activity className="size-6 text-accent-mid" />
        </div>
      </div>

      <div className="relative px-6 pt-6 pb-5" role="img" aria-label={`${METRICS[metric].label} over the last 7 days: ${days.map((d) => `${d.label} ${d.value}`).join(", ")}.`}>
        <div className="flex">
          {/* y axis */}
          <div className="relative mr-3 w-7 shrink-0" style={{ height: PLOT }} aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2 text-xs text-faint tabular-nums" style={{ top: `${(1 - t / top) * 100}%` }}>
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </span>
            ))}
          </div>
          <div className="relative flex-1" style={{ height: PLOT }}>
            {/* recessive solid gridlines */}
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-line" style={{ top: `${(1 - t / top) * 100}%` }} aria-hidden />
            ))}
            {/* peak reference line */}
            {max > 0 && (
              <div className="absolute inset-x-0 z-10 border-t-2 border-dashed border-rose/60" style={{ top: `${(1 - max / top) * 100}%` }} aria-hidden>
                <span className="absolute -top-3 -left-1 rounded-full bg-rose px-2 py-0.5 text-[11px] font-medium text-white">peak</span>
              </div>
            )}
            <div className="absolute inset-0 grid grid-cols-7 gap-2 sm:gap-3">
              {days.map((d, i) => {
                const h = (d.value / top) * 100;
                const emphasised = d.today;
                const showLabel = hover === i || d.today || i === peakIndex;
                return (
                  <div
                    key={i}
                    className="relative flex justify-center"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    aria-label={`${d.date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${d.value} ${METRICS[metric].unit}`}
                  >
                    <div className="hatch absolute inset-y-0 w-full max-w-[64px] rounded-xl" aria-hidden />
                    <div
                      className={cn(
                        "absolute bottom-0 w-full max-w-[64px] rounded-t-xl rounded-b-md transition-[height,background-color]",
                        emphasised ? "bg-brand" : hover === i ? "bg-accent-mid" : "bg-[#dbe7f8]",
                      )}
                      style={{ height: `${Math.max(h, d.value ? 3 : 0)}%` }}
                      aria-hidden
                    />
                    {showLabel && (
                      <span
                        className={cn(
                          "absolute z-20 rounded-full px-2.5 py-1 text-xs whitespace-nowrap shadow-[0_1px_3px_rgba(22,22,40,0.08)]",
                          emphasised ? "bg-accent text-white" : "bg-panel text-text",
                        )}
                        style={{ bottom: `calc(${Math.max(h, 0)}% + 6px)` }}
                      >
                        <span className="font-medium">{d.value}</span> <span className={emphasised ? "text-white/80" : "text-muted"}>{METRICS[metric].unit}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-3 ml-10 grid grid-cols-7 gap-2 sm:gap-3" aria-hidden>
          {days.map((d, i) => (
            <span key={i} className={cn("text-center text-[13px]", d.today ? "font-medium text-accent" : "text-muted")}>{d.label}</span>
          ))}
        </div>
        {total === 0 && <p className="mt-3 text-center text-[13px] text-faint">No {METRICS[metric].label.toLowerCase()} in the last 7 days.</p>}
      </div>

      <table className="sr-only">
        <caption>{METRICS[metric].label} per day, last 7 days</caption>
        <thead>
          <tr><th>Day</th><th>Count</th></tr>
        </thead>
        <tbody>
          {days.map((d, i) => <tr key={i}><td>{d.date.toDateString()}</td><td>{d.value}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
