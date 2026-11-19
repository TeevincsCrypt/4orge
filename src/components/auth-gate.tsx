"use client";

import type { ReactNode } from "react";
import { useApp } from "./app-context";
import { ButtonLink, Callout, LoadingBlock } from "./ui";

export function AuthGate({ children }: { children: ReactNode }) {
  const { config } = useApp();
  if (!config) return <LoadingBlock label="Starting 4ORGE…" />;
  if (config.authError === "local_mode_remote_access") {
    return (
      <Callout tone="warn" title="Local mode only accepts connections from this computer">
        This 4ORGE server has no authentication configured (local mode), so it refuses requests that do not come from
        localhost. Open it at http://localhost:3000 on the machine running it, or configure Supabase (see the deployment
        guide) to host it for other people.
      </Callout>
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
