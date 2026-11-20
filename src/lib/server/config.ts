import "server-only";
import path from "node:path";
import type { NetworkFlags } from "../networks";

/**
 * Parse a boolean environment flag. Tolerates the mistakes hosting dashboards
 * make easy (surrounding spaces or quotes, any letter case).
 * Returns null for an unset/empty value and "invalid" for anything unrecognised.
 */
export function parseFlag(raw: string | undefined): boolean | null | "invalid" {
  if (raw === undefined) return null;
  const v = raw.trim().replace(/^(['"])(.*)\1$/, "$2").trim().toLowerCase();
  if (v === "") return null;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return "invalid";
}

function flag(name: string, fallback: boolean): boolean {
  const v = parseFlag(process.env[name]);
  return v === null || v === "invalid" ? fallback : v;
}

export type StorageMode = "local" | "supabase";
export type TestRunnerMode = "disabled" | "solidity" | "all";

export interface ServerConfig {
  storageMode: StorageMode;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  dataDir: string;
  cacheDir: string;
  runnerDir: string;
  networkFlags: NetworkFlags;
  testRunner: TestRunnerMode;
  allowRemoteLocalMode: boolean;
  /** Raw FORGE_ALLOW_REMOTE_LOCAL_MODE value, kept only to explain a refusal (it is not a secret). */
  remoteFlagRaw: string | null;
  github: { clientId: string | null; clientSecret: string | null; configured: boolean };
  sessionSecret: string | null;
  appUrl: string | null;
}

let cached: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  if (cached) return cached;
  const root = process.cwd();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
  const storageMode: StorageMode = supabaseUrl && supabaseAnonKey ? "supabase" : "local";

  const runnerEnv = (process.env.FORGE_TEST_RUNNER || "").toLowerCase();
  // Executing JavaScript test files means running code from the project. On a
  // single-user local install that's the owner's own code; on a shared cloud
  // deployment it's untrusted, so only Solidity tests (which run inside the
  // EVM, not on the host) are enabled unless the operator opts in.
  const testRunner: TestRunnerMode =
    runnerEnv === "disabled" || runnerEnv === "solidity" || runnerEnv === "all"
      ? runnerEnv
      : storageMode === "local"
        ? "all"
        : "solidity";

  const clientId = process.env.GITHUB_CLIENT_ID || null;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || null;
  const sessionSecret = process.env.FORGE_SESSION_SECRET && process.env.FORGE_SESSION_SECRET.length >= 32 ? process.env.FORGE_SESSION_SECRET : null;

  cached = {
    storageMode,
    supabaseUrl,
    supabaseAnonKey,
    dataDir: path.resolve(/* turbopackIgnore: true */ root, process.env.FORGE_DATA_DIR || ".forge-data"),
    cacheDir: path.resolve(/* turbopackIgnore: true */ root, process.env.FORGE_CACHE_DIR || ".forge-cache"),
    runnerDir: path.resolve(/* turbopackIgnore: true */ root, "runner"),
    networkFlags: {
      // Mainnet deployments stay locked unless the operator deliberately opts in.
      mainnetDeploymentsEnabled: flag("FORGE_ENABLE_MAINNET_DEPLOYMENTS", false),
      localChainEnabled: flag("FORGE_ENABLE_LOCAL_CHAIN", false),
    },
    testRunner,
    allowRemoteLocalMode: flag("FORGE_ALLOW_REMOTE_LOCAL_MODE", false),
    remoteFlagRaw: process.env.FORGE_ALLOW_REMOTE_LOCAL_MODE ?? null,
    github: { clientId, clientSecret, configured: Boolean(clientId && clientSecret && sessionSecret) },
    sessionSecret,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
  };
  return cached;
}

/** Public, non-sensitive view of the configuration for the UI. */
export function publicConfig() {
  const c = getConfig();
  return {
    storageMode: c.storageMode,
    networkFlags: c.networkFlags,
    testRunner: c.testRunner,
    githubConfigured: c.github.configured,
    /** Local mode opened to the network without sign-in (testing only). */
    remoteAccess: c.storageMode === "local" && c.allowRemoteLocalMode,
  };
}
export type PublicConfig = ReturnType<typeof publicConfig>;
