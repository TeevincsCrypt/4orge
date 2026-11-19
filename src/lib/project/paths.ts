/**
 * Project file paths are untrusted input (they come from GitHub tarballs,
 * browser uploads and the API). Every path is normalised to a POSIX relative
 * path and rejected if it could escape the project root.
 */

export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_PROJECT_BYTES = 12 * 1024 * 1024;
export const MAX_PROJECT_FILES = 2500;

const ALLOWED_EXTENSIONS = [
  ".sol",
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".json",
  ".toml",
  ".txt",
  ".md",
  ".yaml",
  ".yml",
];

const IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "artifacts",
  "cache",
  "out",
  "typechain",
  "typechain-types",
  "coverage",
  "broadcast",
  ".next",
  "dist",
  "build",
  "ignition/deployments",
]);

export type PathCheck = { ok: true; path: string } | { ok: false; reason: string };

export function normalizeProjectPath(input: string): PathCheck {
  if (typeof input !== "string" || input.length === 0) return { ok: false, reason: "Empty path." };
  if (input.length > 400) return { ok: false, reason: "Path is too long." };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(input)) return { ok: false, reason: "Path contains control characters." };
  const unified = input.replace(/\\/g, "/");
  if (unified.startsWith("/") || /^[a-zA-Z]:/.test(unified)) {
    return { ok: false, reason: "Absolute paths are not allowed." };
  }
  const parts: string[] = [];
  for (const seg of unified.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return { ok: false, reason: "Paths may not contain '..'." };
    parts.push(seg);
  }
  if (parts.length === 0) return { ok: false, reason: "Empty path." };
  return { ok: true, path: parts.join("/") };
}

export function hasAllowedExtension(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.endsWith(".d.ts")) return false;
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isIgnoredPath(path: string): boolean {
  const segments = path.split("/");
  if (segments.some((s) => IGNORED_SEGMENTS.has(s))) return true;
  if (path.startsWith("ignition/deployments/")) return true;
  if (path === "package-lock.json" || path.endsWith("/package-lock.json")) return true;
  if (path.endsWith("yarn.lock") || path.endsWith("pnpm-lock.yaml")) return true;
  // Foundry vendored libraries (git submodules) are resolved through remappings/npm instead.
  if (segments[0] === "lib" && segments.length > 2) return true;
  return false;
}

/** Decide whether an incoming file should be stored in a project. */
export function acceptProjectFile(path: string, size: number): PathCheck {
  const norm = normalizeProjectPath(path);
  if (!norm.ok) return norm;
  if (isIgnoredPath(norm.path)) return { ok: false, reason: "Ignored directory or lockfile." };
  if (!hasAllowedExtension(norm.path)) return { ok: false, reason: "File type is not used by 4ORGE." };
  if (size > MAX_FILE_BYTES) return { ok: false, reason: "File is larger than 512 KB." };
  return norm;
}

export function isSolidity(path: string): boolean {
  return path.toLowerCase().endsWith(".sol");
}

export function isSolidityTest(path: string): boolean {
  return path.toLowerCase().endsWith(".t.sol");
}

export function isNodeTestFile(path: string): boolean {
  return /^test\/.+\.(ts|js|mjs|cjs|mts|cts)$/.test(path) && !path.endsWith(".d.ts");
}
