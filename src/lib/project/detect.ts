/**
 * Static analysis of a project's files. Configuration files (hardhat.config.*,
 * foundry.toml, package.json) are *read as text*, never executed — running a
 * user's hardhat.config would execute arbitrary code on the 4ORGE server.
 */
import type { CompilerSettings, DetectedContract, Framework, ProjectDetection } from "../types";
import { isNodeTestFile, isSolidity, isSolidityTest } from "./paths";

export interface FileLike {
  path: string;
  content: string;
}

export function stripSolidityComments(src: string): string {
  // Remove block and line comments while preserving string literals reasonably.
  let out = "";
  let i = 0;
  let inString: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Replace the contents of string literals with spaces (keeps offsets stable). */
function blankStrings(src: string): string {
  return src.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => m[0] + " ".repeat(m.length - 2) + m[0]);
}

export function parseDeclarations(path: string, source: string): DetectedContract[] {
  const clean = blankStrings(stripSolidityComments(source));
  const re = /\b(abstract\s+contract|contract|interface|library)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  const found: DetectedContract[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const raw = m[1].replace(/\s+/g, " ");
    const kind = raw === "abstract contract" ? "abstract" : (raw as DetectedContract["kind"]);
    found.push({ name: m[2], kind, path });
  }
  return found;
}

export function parsePragmas(source: string): string[] {
  const clean = stripSolidityComments(source);
  const re = /pragma\s+solidity\s+([^;]+);/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) out.push(m[1].trim());
  return out;
}

/** Returns raw import paths, e.g. "./Token.sol" or "@openzeppelin/contracts/token/ERC20/ERC20.sol". */
export function parseImports(source: string): string[] {
  const clean = stripSolidityComments(source);
  const re = /import\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']\s*(?:as\s+[A-Za-z_$][\w$]*)?\s*;/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) out.push(m[1]);
  return out;
}

const DEFAULT_COMPILER: CompilerSettings = {
  version: null,
  optimizer: { enabled: false, runs: 200 },
  evmVersion: null,
  viaIR: false,
};

/** Best-effort, static read of compiler settings from hardhat.config.* text. */
export function parseHardhatConfig(text: string): Partial<CompilerSettings> {
  const clean = stripSolidityComments(text);
  const out: Partial<CompilerSettings> = {};
  const version =
    clean.match(/\bsolidity\s*:\s*["'`](\d+\.\d+\.\d+)["'`]/) ??
    clean.match(/\bversion\s*:\s*["'`](\d+\.\d+\.\d+)["'`]/);
  if (version) out.version = version[1];
  const optimizerBlock = clean.match(/optimizer\s*:\s*\{([^}]*)\}/);
  if (optimizerBlock) {
    const enabled = /enabled\s*:\s*true/.test(optimizerBlock[1]);
    const runs = optimizerBlock[1].match(/runs\s*:\s*(\d+)/);
    out.optimizer = { enabled, runs: runs ? Number(runs[1]) : 200 };
  }
  const evm = clean.match(/evmVersion\s*:\s*["'`]([a-z]+)["'`]/);
  if (evm) out.evmVersion = evm[1];
  if (/viaIR\s*:\s*true/.test(clean)) out.viaIR = true;
  return out;
}

export function parseFoundryToml(text: string): { settings: Partial<CompilerSettings>; src?: string; remappings: string[] } {
  const settings: Partial<CompilerSettings> = {};
  const v = text.match(/^\s*solc(?:_version)?\s*=\s*["'](\d+\.\d+\.\d+)["']/m);
  if (v) settings.version = v[1];
  const opt = text.match(/^\s*optimizer\s*=\s*(true|false)/m);
  const runs = text.match(/^\s*optimizer_runs\s*=\s*(\d+)/m);
  if (opt || runs) settings.optimizer = { enabled: opt?.[1] === "true", runs: runs ? Number(runs[1]) : 200 };
  const evm = text.match(/^\s*evm_version\s*=\s*["']([a-z]+)["']/m);
  if (evm) settings.evmVersion = evm[1];
  if (/^\s*via_ir\s*=\s*true/m.test(text)) settings.viaIR = true;
  const src = text.match(/^\s*src\s*=\s*["']([^"']+)["']/m)?.[1];
  const remapBlock = text.match(/remappings\s*=\s*\[([\s\S]*?)\]/);
  const remappings = remapBlock ? [...remapBlock[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]) : [];
  return { settings, src, remappings };
}

const HARDHAT_CONFIGS = ["hardhat.config.ts", "hardhat.config.js", "hardhat.config.cjs", "hardhat.config.mjs", "hardhat.config.mts"];

/** The project's config file: at the root, else the shallowest one in a subfolder (max. 2 levels). */
function findConfig(files: FileLike[]): { path: string; kind: "hardhat" | "foundry" } | null {
  const kindOf = (p: string) => {
    const name = p.slice(p.lastIndexOf("/") + 1);
    return HARDHAT_CONFIGS.includes(name) ? ("hardhat" as const) : name === "foundry.toml" ? ("foundry" as const) : null;
  };
  const candidates = files
    .map((f) => ({ path: f.path, kind: kindOf(f.path), depth: f.path.split("/").length - 1 }))
    .filter((c): c is { path: string; kind: "hardhat" | "foundry"; depth: number } => c.kind !== null && c.depth <= 2)
    .sort((a, b) => a.depth - b.depth || (a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === "hardhat" ? -1 : 1));
  return candidates[0] ?? null;
}

/** Make a remapping written relative to `base` (e.g. "contracts/") relative to the repository root. */
function rebaseRemapping(r: string, base: string): string {
  const eq = r.indexOf("=");
  let left = r.slice(0, eq);
  const target = r.slice(eq + 1).trim();
  const colon = left.indexOf(":");
  if (colon >= 0) left = `${base}${left.slice(0, colon)}:${left.slice(colon + 1)}`;
  return `${left}=${target.startsWith("node_modules/") ? target : `${base}${target}`}`;
}

export function detectProject(files: FileLike[]): { detection: ProjectDetection; compiler: CompilerSettings } {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const notes: string[] = [];
  let framework: Framework = "plain";
  let configFile: string | null = null;
  let compiler: CompilerSettings = { ...DEFAULT_COMPILER, optimizer: { ...DEFAULT_COMPILER.optimizer } };
  let remappings: string[] = [];

  // The config normally sits at the root. Monorepos often keep it in a
  // subfolder (e.g. contracts/foundry.toml): then the shallowest one is used,
  // and paths in it are relative to that folder.
  const config = findConfig(files);
  const base = config ? config.path.slice(0, config.path.lastIndexOf("/") + 1) : "";
  if (config?.kind === "hardhat") {
    framework = "hardhat";
    configFile = config.path;
    compiler = { ...compiler, ...parseHardhatConfig(byPath.get(config.path)!.content) };
  } else if (config?.kind === "foundry") {
    framework = "foundry";
    configFile = config.path;
    const parsed = parseFoundryToml(byPath.get(config.path)!.content);
    compiler = { ...compiler, ...parsed.settings };
    remappings = parsed.remappings;
  }
  if (base) notes.push(`Using ${config!.path} (no configuration file at the repository root).`);

  const remapFile = byPath.get(`${base}remappings.txt`) ?? byPath.get("remappings.txt");
  if (remapFile) {
    remappings = [
      ...remappings,
      ...remapFile.content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("=")),
    ];
  }
  if (base) remappings = remappings.map((r) => rebaseRemapping(r, base));

  // Remappings into git submodules (lib/…) point at folders that GitHub
  // archives and uploads don't contain. Those imports resolve from npm instead
  // (e.g. @openzeppelin/contracts, forge-std), so the remapping is dropped.
  const unavailable = remappings.filter((r) => {
    const target = r.slice(r.indexOf("=") + 1).trim();
    return target && !target.startsWith("node_modules/") && !files.some((f) => f.path.startsWith(target));
  });
  if (unavailable.length) {
    remappings = remappings.filter((r) => !unavailable.includes(r));
    notes.push(
      `Ignored ${unavailable.length} remapping(s) pointing to folders that aren't in the project (usually git submodules): ${unavailable.join(", ")}. Those imports are resolved from npm instead.`,
    );
  }

  let dependencies: Record<string, string> = {};
  if (byPath.has("package.json")) {
    try {
      const pkg = JSON.parse(byPath.get("package.json")!.content) as Record<string, unknown>;
      dependencies = {
        ...((pkg.devDependencies as Record<string, string>) ?? {}),
        ...((pkg.dependencies as Record<string, string>) ?? {}),
      };
    } catch {
      notes.push("package.json is not valid JSON; npm dependencies cannot be resolved.");
    }
  }

  const solFiles = files.filter((f) => isSolidity(f.path));
  const contracts = solFiles.filter((f) => !isSolidityTest(f.path)).flatMap((f) => parseDeclarations(f.path, f.content));
  const pragmas = [...new Set(solFiles.flatMap((f) => parsePragmas(f.content)))];
  const sourceDirs = [...new Set(solFiles.filter((f) => !isSolidityTest(f.path)).map((f) => f.path.split("/").slice(0, -1).join("/") || "."))];

  const testFiles = {
    solidity: solFiles.filter((f) => isSolidityTest(f.path)).map((f) => f.path),
    nodejs: files.filter((f) => isNodeTestFile(f.path)).map((f) => f.path),
  };

  if (solFiles.length === 0) {
    framework = files.length === 0 ? "plain" : framework === "plain" ? "unknown" : framework;
    notes.push("No Solidity (.sol) files found.");
  }
  if (framework === "hardhat" && testFiles.nodejs.some((p) => /require\(|ethers/.test(byPath.get(p)?.content ?? ""))) {
    notes.push(
      "Some tests look like Hardhat 2 / ethers style. 4ORGE runs tests with Hardhat 3 (Solidity tests and node:test + viem); older test files may need updating.",
    );
  }
  if (framework === "foundry") {
    notes.push("Foundry project detected: sources are compiled with solc and forge-std tests run with Hardhat 3. Foundry-only features (ffi, forking, forge script) are not available.");
  }

  return {
    compiler,
    detection: {
      framework,
      configFile,
      sourceDirs,
      testFiles,
      contracts,
      pragmas,
      dependencies,
      remappings,
      notes,
    },
  };
}
