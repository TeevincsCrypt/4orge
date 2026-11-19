import "server-only";
import { createHash } from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import semver from "semver";
import * as tar from "tar";
import { getConfig } from "../config";

/**
 * Solidity compiler management.
 *
 * Compilers are the official `soljson.js` (WebAssembly) builds. They are
 * fetched from the `solc` package on the npm registry — which publishes one
 * package version per compiler release — and the tarball's SHA-512 integrity
 * hash from the registry is verified before anything is extracted. If the
 * registry is unreachable, binaries.soliditylang.org is tried and its
 * published SHA-256 is verified.
 *
 * The same cached compiler files are handed to Hardhat (via the `path`
 * compiler option), so compilation and tests use identical binaries.
 */

interface NpmVersionMeta {
  dist: { tarball: string; integrity?: string; shasum?: string };
}

let bundled: { version: string; path: string } | null = null;

/** The compiler shipped with the `solc` npm dependency (works offline). */
export function bundledCompiler(): { version: string; path: string } {
  if (!bundled) {
    // Resolved from the project root at runtime (not via the bundler).
    const dir = path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "solc");
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { version: string };
    bundled = { version: pkg.version, path: path.join(dir, "soljson.js") };
  }
  return bundled;
}

let versionsMemo: { at: number; versions: Record<string, NpmVersionMeta> } | null = null;

async function npmSolcVersions(): Promise<Record<string, NpmVersionMeta>> {
  if (versionsMemo && Date.now() - versionsMemo.at < 6 * 3600_000) return versionsMemo.versions;
  const cacheFile = path.join(getConfig().cacheDir, "solc", "npm-versions.json");
  try {
    const res = await fetch("https://registry.npmjs.org/solc", {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`npm registry answered ${res.status}`);
    const body = (await res.json()) as { versions: Record<string, NpmVersionMeta> };
    versionsMemo = { at: Date.now(), versions: body.versions };
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(body.versions));
    return body.versions;
  } catch (e) {
    try {
      const versions = JSON.parse(await fs.readFile(cacheFile, "utf8")) as Record<string, NpmVersionMeta>;
      versionsMemo = { at: Date.now(), versions };
      return versions;
    } catch {
      throw new Error(`Could not list Solidity compiler versions: ${(e as Error).message}`);
    }
  }
}

/** All installable release versions, newest first. Falls back to the bundled compiler offline. */
export async function availableCompilerVersions(): Promise<{ versions: string[]; offline: boolean }> {
  try {
    const versions = Object.keys(await npmSolcVersions())
      .filter((v) => semver.valid(v) && !semver.prerelease(v) && semver.gte(v, "0.4.11"))
      .sort(semver.rcompare);
    return { versions, offline: false };
  } catch {
    return { versions: [bundledCompiler().version], offline: true };
  }
}

/** Convert a Solidity pragma expression to a semver range. */
export function pragmaToRange(pragma: string): string {
  // Solidity accepts `>=0.8.0 <0.9.0`, `^0.8.20`, `0.8.28`, `=0.8.28` and `||`.
  return pragma.replace(/\s+/g, " ").trim();
}

/**
 * Pick the compiler version. An explicitly configured version wins (and must
 * satisfy every pragma); otherwise the newest release satisfying all pragmas.
 */
export function chooseVersion(
  pragmas: string[],
  available: string[],
  configured: string | null,
): { ok: true; version: string } | { ok: false; error: string } {
  const ranges = pragmas.map(pragmaToRange);
  for (const r of ranges) {
    if (!semver.validRange(r)) return { ok: false, error: `Unsupported pragma expression "pragma solidity ${r};".` };
  }
  if (configured) {
    if (!semver.valid(configured)) return { ok: false, error: `Configured compiler "${configured}" is not a valid version.` };
    const bad = ranges.find((r) => !semver.satisfies(configured, r));
    if (bad) {
      return { ok: false, error: `Configured solc ${configured} does not satisfy "pragma solidity ${bad};".` };
    }
    if (!available.includes(configured)) {
      return { ok: false, error: `solc ${configured} is not available (offline or unknown version).` };
    }
    return { ok: true, version: configured };
  }
  const candidates = available.filter((v) => ranges.every((r) => semver.satisfies(v, r)));
  if (!candidates.length) {
    return {
      ok: false,
      error: `No available compiler satisfies all pragmas (${ranges.join(" ; ") || "none"}).`,
    };
  }
  return { ok: true, version: candidates.sort(semver.rcompare)[0] };
}

const inflight = new Map<string, Promise<string>>();

/** Ensure the soljson.js for `version` exists locally and return its path. */
export async function ensureCompiler(version: string): Promise<string> {
  if (!semver.valid(version)) throw new Error(`Invalid compiler version "${version}".`);
  const b = bundledCompiler();
  if (b.version === version) return b.path;

  const target = path.join(getConfig().cacheDir, "solc", `soljson-v${version}.js`);
  try {
    await fs.access(target);
    return target;
  } catch {
    /* not cached yet */
  }
  const existing = inflight.get(version);
  if (existing) return existing;
  const job = (async () => {
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await downloadFromNpm(version, target);
    } catch (npmError) {
      try {
        await downloadFromSoliditylang(version, target);
      } catch (binError) {
        throw new Error(
          `Could not download solc ${version}. npm: ${(npmError as Error).message}; binaries.soliditylang.org: ${(binError as Error).message}`,
        );
      }
    }
    return target;
  })().finally(() => inflight.delete(version));
  inflight.set(version, job);
  return job;
}

async function downloadFromNpm(version: string, target: string) {
  const meta = (await npmSolcVersions())[version];
  if (!meta) throw new Error("version not published on npm");
  const integrity = meta.dist.integrity;
  if (!integrity?.startsWith("sha512-")) throw new Error("registry did not provide a sha512 integrity hash");
  const res = await fetch(meta.dist.tarball, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`tarball download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const digest = `sha512-${createHash("sha512").update(buf).digest("base64")}`;
  if (digest !== integrity) throw new Error("tarball integrity check failed");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "4orge-solc-"));
  try {
    const tgz = path.join(tmpDir, "solc.tgz");
    await fs.writeFile(tgz, buf);
    await tar.x({ file: tgz, cwd: tmpDir, filter: (p) => p === "package/soljson.js" });
    await fs.rename(path.join(tmpDir, "package", "soljson.js"), `${target}.tmp`);
    await fs.rename(`${target}.tmp`, target);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function downloadFromSoliditylang(version: string, target: string) {
  const listRes = await fetch("https://binaries.soliditylang.org/wasm/list.json", { signal: AbortSignal.timeout(20_000) });
  if (!listRes.ok) throw new Error(`list.json ${listRes.status}`);
  const list = (await listRes.json()) as { builds: { version: string; path: string; sha256: string; prerelease?: string }[] };
  const build = list.builds.find((b) => b.version === version && !b.prerelease);
  if (!build) throw new Error("version not listed");
  const res = await fetch(`https://binaries.soliditylang.org/wasm/${build.path}`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = `0x${createHash("sha256").update(buf).digest("hex")}`;
  if (sha !== build.sha256) throw new Error("sha256 mismatch");
  await fs.writeFile(`${target}.tmp`, buf);
  await fs.rename(`${target}.tmp`, target);
}
