import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isNodeTestFile, isSolidity, normalizeProjectPath } from "@/lib/project/paths";
import { parseHardhatTestOutput } from "@/lib/testing/parse-hardhat-output";
import type { CompilerSettings, TestCaseResult, TestRunStatus } from "@/lib/types";
import { getConfig } from "../config";
import { runNode } from "../sandbox";
import { cachedPackageDir, resolveSources, type SourceFile } from "../compiler/dependencies";
import { availableCompilerVersions, chooseVersion, ensureCompiler } from "../compiler/solc-versions";
import { parsePragmas } from "@/lib/project/detect";

export interface TestOutcome {
  status: TestRunStatus;
  scope: "all" | "solidity" | "nodejs";
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  tests: TestCaseResult[];
  output: string;
  errorMessage: string | null;
  compilerVersion: string | null;
}

/**
 * Run a project's test suites with Hardhat 3 inside a throw-away sandbox:
 *
 *  1. Only project source/test files are written (paths re-validated).
 *  2. 4ORGE writes its OWN hardhat.config.ts — the project's config file is
 *     never executed.
 *  3. Hardhat and plugins come from 4ORGE's pinned `runner/` toolchain;
 *     Solidity dependencies come from the integrity-checked npm cache.
 *  4. The process runs with a scrubbed environment, a timeout and a heap cap,
 *     and the sandbox directory is deleted afterwards.
 *
 * Solidity tests execute inside the EVM (EDR) and cannot touch the host;
 * JavaScript/TypeScript tests are real code and only run when the operator
 * allows it (FORGE_TEST_RUNNER=all, the default for local single-user mode).
 */
export async function runProjectTests(
  files: SourceFile[],
  opts: {
    settings: CompilerSettings;
    remappings: string[];
    dependencies: Record<string, string>;
    scope: "all" | "solidity" | "nodejs";
  },
): Promise<TestOutcome> {
  const cfg = getConfig();
  const started = Date.now();
  const base = {
    scope: opts.scope,
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: [] as TestCaseResult[],
    compilerVersion: null as string | null,
  };
  const error = (message: string, output = ""): TestOutcome => ({
    ...base,
    status: "error",
    durationMs: Date.now() - started,
    output,
    errorMessage: message,
  });

  if (cfg.testRunner === "disabled") {
    return error("The test runner is disabled on this server (FORGE_TEST_RUNNER=disabled).");
  }
  let scope = opts.scope;
  if (cfg.testRunner === "solidity" && scope !== "solidity") {
    if (scope === "nodejs") {
      return error(
        "JavaScript/TypeScript tests are disabled on this server because they execute project code. Set FORGE_TEST_RUNNER=all on a trusted/sandboxed host to enable them.",
      );
    }
    scope = "solidity";
  }

  const solTests = files.filter((f) => f.path.endsWith(".t.sol") || (f.path.startsWith("test/") && isSolidity(f.path)));
  const nodeTests = files.filter((f) => isNodeTestFile(f.path));
  const relevant = scope === "solidity" ? solTests : scope === "nodejs" ? nodeTests : [...solTests, ...nodeTests];
  if (relevant.length === 0) {
    return {
      ...base,
      scope,
      status: "no-tests",
      durationMs: Date.now() - started,
      output: "",
      errorMessage:
        scope === "solidity"
          ? "No Solidity tests found (*.t.sol files or .sol files under test/)."
          : "No tests found. Add *.t.sol Solidity tests or node:test files under test/.",
    };
  }

  try {
    await fs.access(path.join(cfg.runnerDir, "node_modules", "hardhat", "dist", "src", "cli.js"));
  } catch {
    return error("The Hardhat runner toolchain is not installed. Run `npm run setup:runner` in the 4ORGE folder.");
  }

  // Resolve Solidity deps (including tests) so they can be exposed to Hardhat.
  const resolved = await resolveSources(files, {
    remappings: opts.remappings,
    dependencies: opts.dependencies,
    includeTests: true,
  });
  if (resolved.missing.length) {
    return error(
      "Some imports could not be resolved:\n" +
        resolved.missing.map((m) => `  ${m.importer}: "${m.importPath}" — ${m.reason}`).join("\n"),
    );
  }
  const pragmas = [...new Set(Object.values(resolved.sources).flatMap((s) => parsePragmas(s.content)))];
  const { versions } = await availableCompilerVersions();
  const choice = chooseVersion(pragmas, versions, opts.settings.version);
  if (!choice.ok) return error(choice.error);
  let compilerPath: string;
  try {
    compilerPath = await ensureCompiler(choice.version);
  } catch (e) {
    return error((e as Error).message);
  }

  await fs.mkdir(path.join(cfg.dataDir, "sandboxes"), { recursive: true });
  const dir = await fs.mkdtemp(path.join(cfg.dataDir, "sandboxes", "run-"));
  try {
    // 1. Project files (sources + tests + remappings only).
    for (const f of files) {
      const keep = isSolidity(f.path) || isNodeTestFile(f.path) || f.path === "remappings.txt";
      if (!keep) continue;
      const norm = normalizeProjectPath(f.path);
      if (!norm.ok) continue;
      const dest = path.resolve(dir, norm.path);
      if (!dest.startsWith(dir + path.sep)) continue;
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, f.content, "utf8");
    }

    // 2. node_modules: runner toolchain + resolved Solidity packages (symlinks).
    const nm = path.join(dir, "node_modules");
    await fs.mkdir(nm);
    const runnerNm = path.join(cfg.runnerDir, "node_modules");
    const depScopes = new Set(resolved.packages.filter((p) => p.name.startsWith("@")).map((p) => p.name.split("/")[0]));
    for (const entry of await fs.readdir(runnerNm)) {
      if (entry.startsWith(".")) continue;
      if (depScopes.has(entry)) {
        await fs.mkdir(path.join(nm, entry), { recursive: true });
        for (const child of await fs.readdir(path.join(runnerNm, entry))) {
          await fs.symlink(path.join(runnerNm, entry, child), path.join(nm, entry, child));
        }
      } else {
        await fs.symlink(path.join(runnerNm, entry), path.join(nm, entry));
      }
    }
    for (const pkg of resolved.packages) {
      const target = path.join(nm, pkg.name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rm(target, { force: true, recursive: true });
      await fs.symlink(cachedPackageDir(pkg), target);
    }

    // 3. 4ORGE-generated config and package.json.
    const deps = Object.fromEntries(resolved.packages.map((p) => [p.name, p.version]));
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "forge-sandbox", private: true, type: "module", dependencies: deps }, null, 2),
    );
    const sourceDirs = [
      ...new Set(
        files
          .filter((f) => isSolidity(f.path) && f.path.includes("/"))
          .map((f) => f.path.split("/")[0])
          .filter((top) => !["test", "tests", "script", "scripts", "lib", "node_modules"].includes(top)),
      ),
    ];
    const settings: Record<string, unknown> = {
      optimizer: opts.settings.optimizer,
      ...(opts.settings.evmVersion ? { evmVersion: opts.settings.evmVersion } : {}),
      ...(opts.settings.viaIR ? { viaIR: true } : {}),
    };
    const config = `// Generated by 4ORGE for an isolated test run. The project's own config is not executed.
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: ${JSON.stringify(choice.version)},
    path: ${JSON.stringify(compilerPath)},
    settings: ${JSON.stringify(settings)},
  },
  paths: {
    sources: ${JSON.stringify(sourceDirs.length ? sourceDirs : ["contracts"])},
    tests: { solidity: "test", nodejs: "test" },
  },
});
`;
    await fs.writeFile(path.join(dir, "hardhat.config.ts"), config);

    // 4. Run.
    const args = [path.join(runnerNm, "hardhat", "dist", "src", "cli.js"), "test"];
    if (scope !== "all") args.push(scope);
    const home = path.join(dir, ".home");
    await fs.mkdir(home);
    const run = await runNode(args, {
      cwd: dir,
      timeoutMs: 300_000,
      memoryMb: 2048,
      maxOutputBytes: 1024 * 1024,
      env: {
        HOME: home,
        XDG_CACHE_HOME: path.join(home, ".cache"),
        XDG_CONFIG_HOME: path.join(home, ".config"),
        XDG_DATA_HOME: path.join(home, ".local"),
        NODE_ENV: "test",
        HARDHAT_DISABLE_TELEMETRY_PROMPT: "true",
      },
    });

    const output = `${run.stdout}${run.stderr ? `\n${run.stderr}` : ""}`.replaceAll(dir, "<sandbox>").replaceAll(cfg.cacheDir, "<cache>");
    const parsed = parseHardhatTestOutput(output);
    const durationMs = Date.now() - started;
    if (run.timedOut) {
      return { ...base, ...parsed, scope, status: "error", durationMs, output, errorMessage: "Tests timed out after 5 minutes.", compilerVersion: choice.version };
    }
    let status: TestRunStatus;
    let errorMessage: string | null = null;
    if (parsed.tests.length === 0) {
      status = run.code === 0 ? "no-tests" : "error";
      errorMessage = run.code === 0 ? "Hardhat found no tests to run." : "Hardhat failed before running tests — see output.";
    } else if (parsed.failed > 0 || run.code !== 0) {
      status = "failed";
      if (parsed.failed === 0) errorMessage = "Hardhat exited with an error — see output.";
    } else {
      status = "passed";
    }
    return {
      scope,
      status,
      passed: parsed.passed,
      failed: parsed.failed,
      skipped: parsed.skipped,
      tests: parsed.tests,
      durationMs,
      output: run.truncated ? `${output}\n[output truncated]` : output,
      errorMessage,
      compilerVersion: choice.version,
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
