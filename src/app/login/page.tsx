"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { GitBranch, Mail } from "lucide-react";
import { Logo } from "@/components/shell";
import { Button, Callout, Input, Label } from "@/components/ui";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [githubEnabled, setGithubEnabled] = useState(false);

  // Only offer GitHub sign-in when it is switched on in the Supabase project
  // (the public auth settings endpoint lists the enabled providers).
  useEffect(() => {
    if (!url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { external?: Record<string, boolean> } | null) => setGithubEnabled(Boolean(s?.external?.github)))
      .catch(() => setGithubEnabled(false));
  }, []);

  if (!url || !key) {
    return (
      <Shell>
        <Callout tone="blue" title="Local mode — no sign-in needed">
          Supabase is not configured, so 4ORGE runs as a single-user local workspace. <Link href="/dashboard">Open the dashboard</Link>.
        </Callout>
      </Shell>
    );
  }
  const supabase = createBrowserClient(url, key);
  const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") ?? "/dashboard" : "/dashboard";
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  const redirectTo = origin ? `${origin}/auth/callback?next=${encodeURIComponent(next)}` : undefined;

  return (
    <Shell>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setState("sending");
          const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
          if (error) {
            setError(error.message);
            setState("idle");
          } else setState("sent");
        }}
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <Button variant="primary" className="w-full" loading={state === "sending"} icon={<Mail className="size-4" />}>
          Email me a sign-in link
        </Button>
        {state === "sent" && (
          <Callout tone="ok">Check your inbox for the sign-in link, and open it in this same browser (the link only works where you requested it).</Callout>
        )}
        {error && <Callout tone="bad">{error}</Callout>}
      </form>
      {githubEnabled && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button
            className="w-full"
            icon={<GitBranch className="size-4" />}
            onClick={async () => {
              setError(null);
              const { error } = await supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo } });
              if (error) setError(error.message);
            }}
          >
            Continue with GitHub
          </Button>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-6">
        <Logo className="mb-6" />
        {children}
      </div>
    </div>
  );
}
