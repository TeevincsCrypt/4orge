import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import semver from "semver";
import * as tar from "tar";
import { parseImports } from "@/lib/project/detect";
import { isSolidity, isSolidityTest } from "@/lib/project/paths";
import { getConfig } from "../config";

/**
 * Resolve the full set of Solidity sources a project needs, following import
 * statements. npm dependencies (e.g. @openzeppelin/contracts) are fetched
 * from the npm registry tarball, integrity-checked, and only `.sol` and
 * `package.json` files are extracted. No package scripts are ever executed.
 */

export interface SourceFile {
  path: string;
  content: string;
}

export interface ResolvedPackage {
  name: string;
  version: string;
  requested: string;
}

export interface ResolveResult {
  sources: Record<string, { content: string }>;
  remappings: string[];
  packages: ResolvedPackage[];
  missing: { importer: string; importPath: string; reason: string }[];
  notes: string[];
}

const MAX_SOURCES = 2000;

const NON_DEPLOYABLE_DIRS = new Set(["test", "tests", "script", "scripts", "lib", "node_modules"]);

/** Files that are compiled for deployment (tests and scripts are excluded). */
export function isDeployableSource(p: string): boolean {
  if (!isSolidity(p) || isSolidityTest(p)) return false;
  if (p.endsWith(".s.sol")) return false;
  // Test, script and vendored folders at any depth (e.g. contracts/test/mocks/ in a monorepo).
  return !p.split("/").slice(0, -1).some((dir) => NON_DEPLOYABLE_DIRS.has(dir));
}

function npmPackageName(importPath: string): { name: string; subpath: string } | null {
  const parts = importPath.split("/");
  if (importPath.startsWith("@")) {
    if (parts.length < 3) return null;
    return { name: `${parts[0]}/${parts[1]}`, subpath: parts.slice(2).join("/") };
  }
  if (parts.length < 2) return null;
  return { name: parts[0], subpath: parts.slice(1).join("/") };
}

function parseRemapping(r: string): { context: string; prefix: string; target: string } | null {
  const eq = r.indexOf("=");
  if (eq <= 0) return null;
  let left = r.slice(0, eq).trim();
  const target = r.slice(eq + 1).trim();
  let context = "";
  const colon = left.indexOf(":");
  if (colon >= 0) {
    context = left.slice(0, colon);
    left = left.slice(colon + 1);
  }
  if (!left || !target) return null;
  return { context, prefix: left, target };
}

export async function resolveSources(
  files: SourceFile[],
  opts: { remappings: string[]; dependencies: Record<string, string>; includeTests?: boolean },
): Promise<ResolveResult> {
  const project = new Map(files.map((f) => [f.path, f.content]));
  const remaps = opts.remappings.map(parseRemapping).filter((r): r is NonNullable<typeof r> => r !== null);
  const sources: Record<string, { content: string }> = {};
  const missing: ResolveResult["missing"] = [];
  const notes: string[] = [];
  const packages = new Map<string, ResolvedPackage>();
  const usedRemappings = new Set<string>();

  const roots = files
    .filter((f) => (opts.includeTests ? isSolidity(f.path) : isDeployableSource(f.path)))
    .map((f) => f.path);
  const queue: string[] = [];
  for (const r of roots) {
    sources[r] = { content: project.get(r)! };
    queue.push(r);
  }

  while (queue.length) {
    const current = queue.shift()!;
    for (const imp of parseImports(sources[current].content)) {
      let name: string;
      if (imp.startsWith("./") || imp.startsWith("../")) {
        name = path.posix.normalize(path.posix.join(path.posix.dirname(current), imp));
        if (name.startsWith("../") || name === "..") {
          missing.push({ importer: current, importPath: imp, reason: "Import escapes the project root." });
          continue;
        }
      } else {
        name = imp;
        const remap = remaps
          .filter((r) => (!r.context || current.startsWith(r.context)) && imp.startsWith(r.prefix))
          .sort((a, b) => b.prefix.length - a.prefix.length)[0];
        if (remap) {
          name = remap.target + imp.slice(remap.prefix.length);
          usedRemappings.add(`${remap.context ? `${remap.context}:` : ""}${remap.prefix}=${remap.target}`);
        }
      }
      if (sources[name]) continue;
      if (Object.keys(sources).length >= MAX_SOURCES) {
        throw new Error(`Project imports more than ${MAX_SOURCES} source files.`);
      }

      const local = project.get(name);
      if (local !== undefined) {
        sources[name] = { content: local };
        queue.push(name);
        continue;
      }

      // Remapped into node_modules/ or lib/ → treat the remainder as an npm path.
      const npmPath = name.replace(/^node_modules\//, "");
      const pkgRef = npmPackageName(npmPath);
      if (!pkgRef || !isSolidity(npmPath)) {
        missing.push({ importer: current, importPath: imp, reason: "File not found in the project." });
        continue;
      }
      try {
        const pkg = await ensurePackage(pkgRef.name, opts.dependencies[pkgRef.name], notes);
        packages.set(pkg.name, pkg);
        const content = await readPackageSource(pkg, pkgRef.subpath);
        if (content === null) {
          missing.push({
            importer: current,
            importPath: imp,
            reason: `${pkgRef.subpath} does not exist in ${pkg.name}@${pkg.version}.`,
          });
          continue;
        }
        sources[name] = { content };
        queue.push(name);
      } catch (e) {
        missing.push({ importer: current, importPath: imp, reason: (e as Error).message });
      }
    }
  }

  return { sources, remappings: [...usedRemappings], packages: [...packages.values()], missing, notes: [...new Set(notes)] };
}

// ---------------------------------------------------------------------------
// npm package cache
// ---------------------------------------------------------------------------

const VALID_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const inflight = new Map<string, Promise<ResolvedPackage>>();

function pkgDir(name: string, version: string) {
  return path.join(getConfig().cacheDir, "npm", `${name.replace("/", "__")}@${version}`);
}

async function ensurePackage(name: string, requested: string | undefined, notes: string[]): Promise<ResolvedPackage> {
  if (!VALID_NAME.test(name)) throw new Error(`"${name}" is not a valid npm package name.`);
  const pinned = PINNED_PACKAGES[name];
  if (pinned) return ensurePinnedPackage(name, pinned, requested, notes);
  const spec = requested ?? "latest";
  if (/^(git|github:|https?:|file:|link:|workspace:)/.test(spec) || spec.includes("/")) {
    throw new Error(`${name}@${spec} is not an npm registry version; 4ORGE can only resolve registry packages.`);
  }
  const key = `${name}@${spec}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const job = (async () => {
    const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) throw new Error(`npm package ${name} does not exist.`);
    if (!res.ok) throw new Error(`npm registry answered ${res.status} for ${name}.`);
    const meta = (await res.json()) as {
      "dist-tags": Record<string, string>;
      versions: Record<string, { dist: { tarball: string; integrity?: string } }>;
    };
    const version =
      meta["dist-tags"][spec] ?? semver.maxSatisfying(Object.keys(meta.versions), spec) ?? undefined;
    if (!version) throw new Error(`No published version of ${name} matches "${spec}".`);
    if (!requested) {
      notes.push(`${name} is not listed in package.json; used the latest version (${version}). Pin it for reproducible builds.`);
    }
    const dir = pkgDir(name, version);
    try {
      await fs.access(path.join(dir, ".complete"));
    } catch {
      await downloadPackage(meta.versions[version].dist, dir);
    }
    return { name, version, requested: spec };
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function downloadPackage(dist: { tarball: string; integrity?: string }, dir: string) {
  if (!dist.integrity?.startsWith("sha512-")) throw new Error("Registry did not provide a sha512 integrity hash.");
  const buf = await downloadTarball(dist.tarball);
  const digest = `sha512-${createHash("sha512").update(buf).digest("base64")}`;
  if (digest !== dist.integrity) throw new Error("Package integrity check failed.");
  await extractPackage(buf, dir);
}

async function downloadTarball(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Package download failed (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 50 * 1024 * 1024) throw new Error("Package tarball is larger than 50 MB.");
  return buf;
}

/**
 * Unpack the Solidity sources and package.json of a package tarball into `dir`.
 * `verify` runs on the unpacked folder before it is moved into place.
 */
async function extractPackage(buf: Buffer, dir: string, verify?: (unpacked: string) => Promise<void>) {
  // Extract next to the final folder: a rename only works within one filesystem,
  // and the cache often lives on a mounted volume (e.g. /data) separate from /tmp.
  await fs.mkdir(path.dirname(dir), { recursive: true });
  const tmp = await fs.mkdtemp(path.join(path.dirname(dir), ".tmp-pkg-"));
  try {
    const tgz = path.join(tmp, "pkg.tgz");
    await fs.writeFile(tgz, buf);
    const out = path.join(tmp, "out");
    await fs.mkdir(out);
    await tar.x({
      file: tgz,
      cwd: out,
      strip: 1,
      filter: (p, entry) => {
        const type = (entry as { type?: string }).type;
        if (type && type !== "File" && type !== "OldFile") return false;
        return p.endsWith(".sol") || /^[^/]+\/package\.json$/.test(p);
      },
    });
    if (verify) await verify(out);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rename(out, dir);
    await fs.writeFile(path.join(dir, ".complete"), new Date().toISOString());
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Packages pinned to an upstream release
// ---------------------------------------------------------------------------

interface PinnedPackage {
  version: string;
  repository: string;
  commit: string;
  /** contentHash() of the unpacked .sol files and package.json. */
  contentHash: string;
}

/**
 * Packages whose npm releases are abandoned. forge-std (Foundry's test library)
 * was last published to npm as 1.1.2 in 2022; current releases exist only on
 * GitHub, which is also how Hardhat 3 recommends installing it. These are
 * downloaded from a pinned commit and checked against a hash of their contents
 * (GitHub archives carry no registry integrity hash), so the code that runs is
 * exactly the code that was reviewed here.
 */
export const PINNED_PACKAGES: Record<string, PinnedPackage> = {
  "forge-std": {
    version: "1.17.0",
    repository: "foundry-rs/forge-std",
    commit: "f3dae6e6ee381f25eb6a246f7da9b85c91a68219",
    contentHash: "sha256-5993bc33d177b48e4d832034f6835353b1e025a97d8ad78ed4a5d2001fdd2ef6",
  },
};

/** Deterministic hash of an unpacked package: every file's path and SHA-256, sorted by path. */
export async function contentHash(root: string): Promise<string> {
  const entries: string[] = [];
  const walk = async (dir: string) => {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join("/");
        entries.push(`${rel}\n${createHash("sha256").update(await fs.readFile(full)).digest("hex")}\n`);
      }
    }
  };
  await walk(root);
  entries.sort();
  return `sha256-${createHash("sha256").update(entries.join("")).digest("hex")}`;
}

async function ensurePinnedPackage(name: string, pin: PinnedPackage, requested: string | undefined, notes: string[]): Promise<ResolvedPackage> {
  const key = `${name}@pinned`;
  const existing = inflight.get(key);
  if (existing) {
    const pkg = await existing;
    return { ...pkg, requested: requested ?? "latest" };
  }
  const job = (async () => {
    const dir = pkgDir(name, pin.version);
    try {
      await fs.access(path.join(dir, ".complete"));
    } catch {
      const buf = await downloadTarball(`https://codeload.github.com/${pin.repository}/tar.gz/${pin.commit}`);
      await extractPackage(buf, dir, async (unpacked) => {
        if ((await contentHash(unpacked)) !== pin.contentHash) {
          throw new Error(`${name} ${pin.version} from GitHub does not match its pinned content hash.`);
        }
      });
    }
    return { name, version: pin.version, requested: requested ?? "latest" };
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  const pkg = await job;
  notes.push(
    `${name} ${pin.version} is fetched from GitHub (${pin.repository}) because its npm package is outdated${
      requested ? `; the requested "${requested}" was replaced by this pinned release` : ""
    }.`,
  );
  return pkg;
}

/**
 * Read an imported file from a package. forge-std keeps its sources in src/,
 * and "forge-std/Test.sol" means "src/Test.sol": the same rule Hardhat 3 applies.
 */
async function readPackageSource(pkg: ResolvedPackage, subpath: string): Promise<string | null> {
  const direct = await readPackageFile(pkg, subpath);
  if (direct !== null || pkg.name !== "forge-std" || subpath.startsWith("src/")) return direct;
  return readPackageFile(pkg, `src/${subpath}`);
}

async function readPackageFile(pkg: ResolvedPackage, subpath: string): Promise<string | null> {
  const root = pkgDir(pkg.name, pkg.version);
  const full = path.resolve(root, subpath);
  if (!full.startsWith(root + path.sep)) return null;
  try {
    return await fs.readFile(full, "utf8");
  } catch {
    return null;
  }
}

/** Directory of a cached npm package (used to expose deps to the Hardhat sandbox). */
export function cachedPackageDir(pkg: ResolvedPackage): string {
  return pkgDir(pkg.name, pkg.version);
}
