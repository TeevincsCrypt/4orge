import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { DOCS, readDoc } from "@/lib/server/docs";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS.find((d) => d.slug === slug);
  return { title: doc?.title ?? "Documentation" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = await readDoc(slug);
  if (source === null) notFound();
  return (
    <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
      <nav className="hidden lg:block">
        <div className="sticky top-20 space-y-0.5">
          <Link href="/docs" className="mb-2 block text-xs text-faint hover:text-text">← All docs</Link>
          {DOCS.map((d) => (
            <Link key={d.slug} href={`/docs/${d.slug}`} className={`block rounded px-2 py-1 text-sm ${d.slug === slug ? "bg-panel-3 text-text" : "text-muted hover:text-text"}`}>
              {d.title}
            </Link>
          ))}
        </div>
      </nav>
      <article className="min-w-0 max-w-3xl">
        <Markdown source={source} />
      </article>
    </div>
  );
}
