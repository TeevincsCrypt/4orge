"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useApp } from "./app-context";
import { ButtonLink, Callout, LoadingBlock } from "./ui";

export function AuthGate({ children }: { children: ReactNode }) {
  const { config } = useApp();
  if (!config) return <LoadingBlock label="Starting 4ORGE…" />;
  if (config.authError === "local_mode_remote_access") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Callout tone="warn" title="This server only accepts connections from its own machine">
          {config.authMessage ??
            "This 4ORGE server runs in local mode (no sign-in), so it only accepts requests from the machine it runs on."}
        </Callout>
        <div className="rounded-2xl border border-line/70 bg-panel p-6 text-sm text-muted shadow-card">
          <h2 className="text-[15px] font-medium text-text">Hosting it for testing? Choose one:</h2>
          <ol className="mt-3 list-decimal space-y-3 pl-5">
            <li>
              <span className="font-medium text-text">Quick test, no sign-in:</span> in your host&apos;s variables add{" "}
              <code className="mono rounded bg-panel-3 px-1.5 py-0.5 text-[12px] text-text">FORGE_ALLOW_REMOTE_LOCAL_MODE=true</code>, then
              redeploy (on Railway, click <span className="text-text">Deploy</span> to apply staged changes). Anyone with the link can
              use this workspace, so keep the link private.
            </li>
            <li>
              <span className="font-medium text-text">Proper setup with sign-in:</span> add Supabase (
              <code className="mono text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="mono text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>) as described in the{" "}
              <Link href="/docs/deployment-guide" className="font-medium text-accent">deployment guide</Link>.
            </li>
          </ol>
        </div>
      </div>
    );
  }
  if (!config.user) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <h1 className="text-xl font-semibold text-text">Sign in to 4ORGE</h1>
        <p className="mt-2 text-sm text-muted">Your projects and deployments are private to your account.</p>
        <ButtonLink href="/login" variant="primary" className="mt-6">
          Sign in
        </ButtonLink>
      </div>
    );
  }
  return <>{children}</>;
}
