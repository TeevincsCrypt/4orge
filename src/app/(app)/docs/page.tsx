import Link from "next/link";
import { BookOpen } from "lucide-react";
import { DOCS } from "@/lib/server/docs";

export const metadata = { title: "Documentation" };

export default function DocsIndex() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-text sm:text-2xl">Documentation</h1>
        <p className="mt-1 text-sm text-muted">How 4ORGE works, how to run it, and how to integrate with it.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {DOCS.map((d) => (
          <Link key={d.slug} href={`/docs/${d.slug}`} className="rounded-2xl border border-line/70 bg-panel p-5 shadow-card hover:border-line-strong hover:bg-panel-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text"><BookOpen className="size-4 text-faint" />{d.title}</div>
            <p className="mt-1 text-sm text-muted">{d.summary}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
