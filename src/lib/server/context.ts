import "server-only";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getConfig, parseFlag } from "./config";
import { HttpError } from "./http";
import { LocalStore } from "./store/local";
import { SupabaseStore } from "./store/supabase";
import type { DataStore } from "./store/types";

/** Stable id for the single owner of a local-mode workspace. */
export const LOCAL_OWNER_ID = "00000000-0000-4000-8000-000000000001";

export interface RequestContext {
  store: DataStore;
  userId: string;
  userLabel: string;
  mode: "local" | "supabase";
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(hostHeader: string | null): string {
  if (!hostHeader) return "";
  if (hostHeader.startsWith("[")) return hostHeader.slice(0, hostHeader.indexOf("]") + 1);
  return hostHeader.split(":")[0];
}

export async function supabaseServerClient() {
  const cfg = getConfig();
  const cookieStore = await cookies();
  return createServerClient(cfg.supabaseUrl!, cfg.supabaseAnonKey!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a context where cookies are read-only; the proxy refreshes sessions.
        }
      },
    },
  });
}

/**
 * Resolve who is calling and return an owner-scoped store.
 * - Local mode: single owner, only reachable from loopback unless the operator
 *   explicitly allows remote access (FORGE_ALLOW_REMOTE_LOCAL_MODE).
 * - Supabase mode: a valid Supabase session cookie or `Authorization: Bearer
 *   <access token>` is required; RLS restricts every query to that user.
 */
export async function getContext(): Promise<RequestContext> {
  const cfg = getConfig();
  const h = await headers();

  if (cfg.storageMode === "local") {
    const host = hostnameOf(h.get("x-forwarded-host") ?? h.get("host"));
    if (!cfg.allowRemoteLocalMode && !LOOPBACK.has(host)) {
      const raw = cfg.remoteFlagRaw;
      const state =
        raw === null || raw.trim() === ""
          ? "FORGE_ALLOW_REMOTE_LOCAL_MODE is not set on this server."
          : parseFlag(raw) === "invalid"
            ? `FORGE_ALLOW_REMOTE_LOCAL_MODE is set to "${raw.slice(0, 40)}", which is not recognised. Use true.`
            : `FORGE_ALLOW_REMOTE_LOCAL_MODE is set to "${raw.slice(0, 40)}" (off).`;
      throw new HttpError(
        403,
        "local_mode_remote_access",
        `This 4ORGE server runs in local mode (no sign-in), so it only accepts requests from the machine it runs on. ${state}`,
      );
    }
    return {
      store: new LocalStore(LOCAL_OWNER_ID, cfg.dataDir),
      userId: LOCAL_OWNER_ID,
      userLabel: "Local workspace owner",
      mode: "local",
    };
  }

  const auth = h.get("authorization");
  let client;
  if (auth?.toLowerCase().startsWith("bearer ")) {
    client = createClient(cfg.supabaseUrl!, cfg.supabaseAnonKey!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } else {
    client = await supabaseServerClient();
  }
  const { data, error } = await client.auth.getUser(auth ? auth.slice(7).trim() : undefined);
  if (error || !data.user) {
    throw new HttpError(401, "unauthenticated", "Sign in to use 4ORGE.");
  }
  return {
    store: new SupabaseStore(data.user.id, client),
    userId: data.user.id,
    userLabel: data.user.email ?? data.user.user_metadata?.user_name ?? "Signed-in user",
    mode: "supabase",
  };
}

/**
 * Reject cross-site state-changing requests. Browsers always send `Origin`
 * on cross-origin POST/PUT/PATCH/DELETE, so a mismatch means another website
 * is trying to drive this 4ORGE instance.
 */
export async function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (CLI, tests) — still need auth in Supabase mode
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) {
      throw new HttpError(403, "cross_origin", "Cross-origin requests are not allowed.");
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "cross_origin", "Invalid Origin header.");
  }
}
