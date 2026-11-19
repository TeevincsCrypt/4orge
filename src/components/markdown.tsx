"use client";

import { marked } from "marked";
import { useMemo } from "react";

/**
 * Render Markdown authored by 4ORGE itself (bundled docs, generated reports).
 * Raw HTML in the source is escaped so content can never inject markup.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => {
    const renderer = new marked.Renderer();
    renderer.html = ({ text }) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    renderer.link = ({ href, text }) => {
      const safe = /^(https?:|\/|#|mailto:)/.test(href) ? href : "#";
      const external = /^https?:/.test(safe);
      return `<a href="${safe.replace(/"/g, "&quot;")}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${text}</a>`;
    };
    return marked.parse(source, { renderer, async: false, gfm: true }) as string;
  }, [source]);
  return <div className={`prose-forge ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
