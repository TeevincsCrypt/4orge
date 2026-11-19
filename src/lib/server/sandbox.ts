import "server-only";
import { spawn } from "node:child_process";

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}

export interface SpawnLimits {
  cwd: string;
  timeoutMs: number;
  maxOutputBytes?: number;
  memoryMb?: number;
  env?: Record<string, string>;
  stdin?: string;
}

/**
 * Run a Node.js script in a child process with:
 *  - a hard wall-clock timeout (whole process group is killed),
 *  - a V8 heap cap,
 *  - a scrubbed environment (no server secrets, tokens or keys are inherited),
 *  - bounded captured output.
 *
 * This is process-level isolation. For multi-tenant hosting, run the 4ORGE
 * worker inside a container/VM sandbox as described in docs/architecture.md.
 */
// Server-wide cap on concurrent compiler/test processes (FORGE_MAX_JOBS, default 2)
// so a burst of requests cannot exhaust CPU or memory.
const MAX_JOBS = Math.max(1, Number(process.env.FORGE_MAX_JOBS) || 2);
let running = 0;
const queue: (() => void)[] = [];
async function acquire() {
  if (running < MAX_JOBS) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  running++;
}
function release() {
  running--;
  queue.shift()?.();
}

export async function runNode(args: string[], limits: SpawnLimits): Promise<SpawnResult> {
  await acquire();
  try {
    return await spawnNode(args, limits);
  } finally {
    release();
  }
}

function spawnNode(args: string[], limits: SpawnLimits): Promise<SpawnResult> {
  const maxOut = limits.maxOutputBytes ?? 2 * 1024 * 1024;
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    NODE_ENV: "production",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    CI: "true",
    LANG: "C.UTF-8",
    ...(process.env.NODE_EXTRA_CA_CERTS ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS } : {}),
    ...limits.env,
  };
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`--max-old-space-size=${limits.memoryMb ?? 2048}`, ...args], {
      cwd: limits.cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    const take = (current: string, chunk: Buffer) => {
      if (current.length >= maxOut) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString("utf8");
      if (next.length > maxOut) {
        truncated = true;
        return next.slice(0, maxOut);
      }
      return next;
    };
    child.stdout.on("data", (c: Buffer) => (stdout = take(stdout, c)));
    child.stderr.on("data", (c: Buffer) => (stderr = take(stderr, c)));
    const kill = () => {
      try {
        if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, limits.timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut, truncated, durationMs: Date.now() - started });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut, truncated, durationMs: Date.now() - started });
    });
    if (limits.stdin !== undefined) child.stdin.end(limits.stdin);
    else child.stdin.end();
  });
}
