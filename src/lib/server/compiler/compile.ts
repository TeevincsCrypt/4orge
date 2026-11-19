import "server-only";
import { createHash } from "node:crypto";
import path from "node:path";
import { parsePragmas } from "@/lib/project/detect";
import type { AbiItem, CompilerMessage, CompilerSettings } from "@/lib/types";
import { runNode } from "../sandbox";
import { resolveSources, type ResolvedPackage, type SourceFile } from "./dependencies";
import { availableCompilerVersions, chooseVersion, ensureCompiler } from "./solc-versions";

export interface CompiledContract {
  name: string;
  sourcePath: string;
  fullyQualifiedName: string;
  abi: AbiItem[];
  bytecode: `0x${string}`;
  deployedBytecode: `0x${string}`;
  hasUnlinkedLibraries: boolean;
}

export interface CompileOutcome {
  ok: boolean;
  compilerVersion: string; // long version (or short if compilation never started)
  shortVersion: string | null;
  settings: CompilerSettings;
  errors: CompilerMessage[];
  warnings: CompilerMessage[];
  contracts: CompiledContract[];
  sourceCount: number;
  durationMs: number;
  input: StandardJsonInput | null;
  inputHash: string;
  packages: ResolvedPackage[];
  notes: string[];
}

export interface StandardJsonInput {
  language: "Solidity";
  sources: Record<string, { content: string }>;
  settings: {
    optimizer: { enabled: boolean; runs: number };
    evmVersion?: string;
    viaIR?: boolean;
    remappings?: string[];
    outputSelection: Record<string, Record<string, string[]>>;
  };
}

export function buildStandardInput(
  sources: Record<string, { content: string }>,
  settings: CompilerSettings,
  remappings: string[],
): StandardJsonInput {
  return {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: settings.optimizer.enabled, runs: settings.optimizer.runs },
      ...(settings.evmVersion ? { evmVersion: settings.evmVersion } : {}),
      ...(settings.viaIR ? { viaIR: true } : {}),
      ...(remappings.length ? { remappings } : {}),
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.bytecode.linkReferences", "evm.deployedBytecode.object"],
        },
      },
    },
  };
}

interface SolcError {
  severity: "error" | "warning" | "info";
  type: string;
  message: string;
  formattedMessage?: string;
  sourceLocation?: { file: string; start: number; end: number };
}

interface SolcOutput {
  errors?: SolcError[];
  contracts?: Record<
    string,
    Record<
      string,
      {
        abi: AbiItem[];
        evm: {
          bytecode: { object: string; linkReferences?: Record<string, unknown> };
          deployedBytecode: { object: string };
        };
      }
    >
  >;
}

export function parseSolcOutput(output: SolcOutput, projectPaths: Set<string>) {
  const messages: CompilerMessage[] = (output.errors ?? []).map((e) => ({
    severity: e.severity,
    type: e.type,
    message: e.message,
    formattedMessage: (e.formattedMessage ?? e.message).trim(),
    sourceLocation: e.sourceLocation,
  }));
  const errors = messages.filter((m) => m.severity === "error");
  const warnings = messages.filter((m) => m.severity !== "error");
  const contracts: CompiledContract[] = [];
  for (const [sourcePath, byName] of Object.entries(output.contracts ?? {})) {
    if (!projectPaths.has(sourcePath)) continue; // dependency contracts are not listed
    for (const [name, c] of Object.entries(byName)) {
      contracts.push({
        name,
        sourcePath,
        fullyQualifiedName: `${sourcePath}:${name}`,
        abi: c.abi,
        bytecode: `0x${c.evm.bytecode.object}`,
        deployedBytecode: `0x${c.evm.deployedBytecode.object}`,
        hasUnlinkedLibraries:
          Object.keys(c.evm.bytecode.linkReferences ?? {}).length > 0 || c.evm.bytecode.object.includes("__$"),
      });
    }
  }
  return { errors, warnings, contracts };
}

function msg(message: string, type = "4ORGE"): CompilerMessage {
  return { severity: "error", type, message, formattedMessage: message };
}

export async function compileProject(
  files: SourceFile[],
  opts: { settings: CompilerSettings; remappings: string[]; dependencies: Record<string, string> },
): Promise<CompileOutcome> {
  const started = Date.now();
  const base = {
    ok: false,
    compilerVersion: opts.settings.version ?? "unknown",
    shortVersion: opts.settings.version,
    settings: opts.settings,
    warnings: [] as CompilerMessage[],
    contracts: [] as CompiledContract[],
    sourceCount: 0,
    input: null,
    inputHash: "",
    packages: [] as ResolvedPackage[],
    notes: [] as string[],
  };
  const fail = (errors: CompilerMessage[], extra: Partial<CompileOutcome> = {}): CompileOutcome => ({
    ...base,
    ...extra,
    errors,
    durationMs: Date.now() - started,
  });

  const resolved = await resolveSources(files, { remappings: opts.remappings, dependencies: opts.dependencies });
  const sourceNames = Object.keys(resolved.sources);
  if (sourceNames.length === 0) return fail([msg("No deployable Solidity sources found (tests and scripts are excluded).")]);
  if (resolved.missing.length) {
    return fail(
      resolved.missing.map((m) =>
        msg(`${m.importer}: cannot resolve import "${m.importPath}" — ${m.reason}`, "ImportError"),
      ),
      { packages: resolved.packages, notes: resolved.notes, sourceCount: sourceNames.length },
    );
  }

  const pragmas = [...new Set(Object.values(resolved.sources).flatMap((s) => parsePragmas(s.content)))];
  const { versions, offline } = await availableCompilerVersions();
  const choice = chooseVersion(pragmas, versions, opts.settings.version);
  if (!choice.ok) {
    return fail([msg(choice.error + (offline ? " (compiler list unavailable — only the bundled compiler can be used)" : ""), "CompilerVersion")], {
      sourceCount: sourceNames.length,
    });
  }

  let soljsonPath: string;
  try {
    soljsonPath = await ensureCompiler(choice.version);
  } catch (e) {
    return fail([msg((e as Error).message, "CompilerDownload")], { shortVersion: choice.version });
  }

  const input = buildStandardInput(resolved.sources, opts.settings, resolved.remappings);
  const inputJson = JSON.stringify(input);
  const inputHash = createHash("sha256").update(inputJson).digest("hex");

  const result = await runNode([path.join(process.cwd(), "scripts", "solc-worker.cjs")], {
    cwd: process.cwd(),
    timeoutMs: 180_000,
    memoryMb: 3072,
    maxOutputBytes: 64 * 1024 * 1024,
    stdin: JSON.stringify({ soljsonPath, input }),
  });
  const extra = {
    shortVersion: choice.version,
    compilerVersion: choice.version,
    input,
    inputHash,
    sourceCount: sourceNames.length,
    packages: resolved.packages,
    notes: resolved.notes,
  };
  if (result.timedOut) return fail([msg("Compilation timed out after 180 seconds.")], extra);
  if (result.truncated) return fail([msg("Compiler output exceeded the 64 MB limit.")], extra);

  let parsed: { version?: string; output?: SolcOutput; fatal?: string };
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return fail([msg(`Compiler process failed (exit ${result.code}). ${result.stderr.slice(0, 2000)}`)], extra);
  }
  if (parsed.fatal || !parsed.output) return fail([msg(`Compiler error: ${parsed.fatal ?? "no output"}`)], extra);

  const longVersion = (parsed.version ?? choice.version).replace(/\.Emscripten.*$/, "");
  const { errors, warnings, contracts } = parseSolcOutput(parsed.output, new Set(files.map((f) => f.path)));
  return {
    ok: errors.length === 0,
    compilerVersion: longVersion,
    shortVersion: choice.version,
    settings: { ...opts.settings, version: opts.settings.version },
    errors,
    warnings,
    contracts: errors.length ? [] : contracts,
    sourceCount: sourceNames.length,
    durationMs: Date.now() - started,
    input,
    inputHash,
    packages: resolved.packages,
    notes: resolved.notes,
  };
}
