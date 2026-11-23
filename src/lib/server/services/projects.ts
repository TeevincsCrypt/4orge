import "server-only";
import { createHash } from "node:crypto";
import { detectProject } from "@/lib/project/detect";
import { acceptProjectFile, MAX_PROJECT_BYTES, MAX_PROJECT_FILES } from "@/lib/project/paths";
import type { Build, CompilerSettings, ContractArtifact, Project, ProjectFile, ProjectSource, TestRun } from "@/lib/types";
import { compileProject } from "../compiler/compile";
import { badRequest, notFound } from "../http";
import type { DataStore, NewRow } from "../store/types";
import { runProjectTests } from "../testing/runner";

export interface IncomingFile {
  path: string;
  content: string;
}

export interface WriteResult {
  written: number;
  unchanged: number;
  deleted: number;
  skipped: { path: string; reason: string }[];
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function getProject(store: DataStore, id: string): Promise<Project> {
  const p = await store.get("projects", id);
  if (!p) throw notFound("Project");
  return p;
}

export async function getProjectFiles(store: DataStore, projectId: string): Promise<ProjectFile[]> {
  return store.list("project_files", { where: { projectId }, orderBy: "path" });
}

export async function createProject(
  store: DataStore,
  input: { name: string; description?: string; source: ProjectSource; files: IncomingFile[] },
): Promise<{ project: Project; result: WriteResult }> {
  const { detection, compiler } = detectProject(input.files.map((f) => ({ path: f.path, content: f.content })));
  const project = await store.insert("projects", {
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
    source: input.source,
    compiler,
    detection,
    lastBuildId: null,
    lastTestRunId: null,
  });
  const result = await writeProjectFiles(store, project, input.files, { replace: true, redetectCompiler: true });
  return { project: await getProject(store, project.id), result };
}

/**
 * Validate and store files. Paths are normalised and checked for traversal,
 * file types are restricted, and per-file / per-project size limits apply.
 */
export async function writeProjectFiles(
  store: DataStore,
  project: Project,
  incoming: IncomingFile[],
  opts: { replace: boolean; redetectCompiler?: boolean },
): Promise<WriteResult> {
  const skipped: WriteResult["skipped"] = [];
  const accepted = new Map<string, string>();
  for (const f of incoming) {
    const size = Buffer.byteLength(f.content ?? "", "utf8");
    const check = acceptProjectFile(f.path, size);
    if (!check.ok) {
      skipped.push({ path: f.path, reason: check.reason });
      continue;
    }
    if (typeof f.content !== "string" || f.content.includes("\u0000")) {
      skipped.push({ path: f.path, reason: "Binary files are not supported." });
      continue;
    }
    accepted.set(check.path, f.content);
  }

  const existing = await store.list("project_files", {
    where: { projectId: project.id },
    columns: ["id", "path", "sha256", "size"],
  });
  const existingByPath = new Map(existing.map((f) => [f.path, f]));

  // Enforce project-wide limits on the resulting file set.
  const finalSizes = new Map<string, number>();
  if (!opts.replace) for (const f of existing) finalSizes.set(f.path, f.size);
  for (const [p, c] of accepted) finalSizes.set(p, Buffer.byteLength(c, "utf8"));
  if (finalSizes.size > MAX_PROJECT_FILES) throw badRequest(`Projects are limited to ${MAX_PROJECT_FILES} files.`);
  const total = [...finalSizes.values()].reduce((a, b) => a + b, 0);
  if (total > MAX_PROJECT_BYTES) throw badRequest(`Projects are limited to ${MAX_PROJECT_BYTES / 1024 / 1024} MB of source files.`);

  let written = 0;
  let unchanged = 0;
  const inserts: NewRow<"project_files">[] = [];
  for (const [p, content] of accepted) {
    const hash = sha256(content);
    const prev = existingByPath.get(p);
    if (prev && prev.sha256 === hash) {
      unchanged++;
      continue;
    }
    if (prev) {
      await store.update("project_files", prev.id, { content, sha256: hash, size: Buffer.byteLength(content, "utf8") });
    } else {
      inserts.push({ projectId: project.id, path: p, content, sha256: hash, size: Buffer.byteLength(content, "utf8") });
    }
    written++;
  }
  await store.insertMany("project_files", inserts);

  let deleted = 0;
  if (opts.replace) {
    for (const f of existing) {
      if (!accepted.has(f.path)) {
        await store.remove("project_files", { id: f.id });
        deleted++;
      }
    }
  }

  const configTouched = [...accepted.keys()].some((p) => /^(hardhat\.config\.|foundry\.toml$)/.test(p));
  await refreshDetection(store, project, { redetectCompiler: opts.redetectCompiler || configTouched });
  return { written, unchanged, deleted, skipped };
}

export async function deleteProjectFile(store: DataStore, project: Project, path: string) {
  await store.remove("project_files", { projectId: project.id, path });
  await refreshDetection(store, project, { redetectCompiler: /^(hardhat\.config\.|foundry\.toml$)/.test(path) });
}

export async function refreshDetection(store: DataStore, project: Project, opts: { redetectCompiler?: boolean } = {}) {
  const files = await getProjectFiles(store, project.id);
  const { detection, compiler } = detectProject(files);
  return store.update("projects", project.id, {
    detection,
    ...(opts.redetectCompiler ? { compiler } : {}),
  });
}

export async function updateCompilerSettings(store: DataStore, project: Project, settings: CompilerSettings) {
  return store.update("projects", project.id, { compiler: settings });
}

export async function compileAndRecord(
  store: DataStore,
  project: Project,
): Promise<{ build: Build; contracts: ContractArtifact[]; notes: string[] }> {
  const files = await getProjectFiles(store, project.id);
  const outcome = await compileProject(files, {
    settings: project.compiler,
    remappings: project.detection.remappings,
    dependencies: project.detection.dependencies,
  });
  const build = await store.insert("builds", {
    projectId: project.id,
    status: outcome.ok ? "succeeded" : "failed",
    compilerVersion: outcome.compilerVersion,
    settings: { ...outcome.settings, version: outcome.shortVersion },
    errors: outcome.errors,
    warnings: outcome.warnings,
    durationMs: outcome.durationMs,
    sourceCount: outcome.sourceCount,
    contractCount: outcome.contracts.length,
    input: outcome.input,
    inputHash: outcome.inputHash,
  });
  const rows = outcome.contracts.map((c) => ({
    projectId: project.id,
    buildId: build.id,
    name: c.name,
    sourcePath: c.sourcePath,
    fullyQualifiedName: c.fullyQualifiedName,
    abi: c.abi,
    bytecode: c.bytecode,
    deployedBytecode: c.deployedBytecode,
    bytecodeSize: (c.deployedBytecode.length - 2) / 2,
    hasUnlinkedLibraries: c.hasUnlinkedLibraries,
    compilerVersion: outcome.compilerVersion,
  }));
  await store.insertMany("contracts", rows);
  if (outcome.ok) await store.update("projects", project.id, { lastBuildId: build.id });
  const contracts = await store.list("contracts", { where: { buildId: build.id }, orderBy: "fullyQualifiedName" });
  const notes = [...outcome.notes, ...outcome.packages.map((p) => `Resolved ${p.name}@${p.version} from the npm registry.`)];
  return { build, contracts, notes };
}

export async function testAndRecord(
  store: DataStore,
  project: Project,
  scope: "all" | "solidity" | "nodejs",
): Promise<TestRun> {
  const files = await getProjectFiles(store, project.id);
  const outcome = await runProjectTests(files, {
    settings: project.compiler,
    remappings: project.detection.remappings,
    dependencies: project.detection.dependencies,
    scope,
  });
  const run = await store.insert("test_runs", { projectId: project.id, ...outcome });
  await store.update("projects", project.id, { lastTestRunId: run.id });
  return run;
}

/** Contracts from the project's latest successful build. */
export async function latestContracts(store: DataStore, project: Project): Promise<ContractArtifact[]> {
  if (!project.lastBuildId) return [];
  return store.list("contracts", { where: { buildId: project.lastBuildId }, orderBy: "fullyQualifiedName" });
}

export async function deleteProject(store: DataStore, project: Project) {
  // Deployment records are permanent and intentionally kept.
  const runbooks = await store.list("runbooks", { where: { projectId: project.id }, columns: ["id"] });
  for (const r of runbooks) await store.remove("runbook_steps", { runbookId: r.id });
  await store.remove("runbooks", { projectId: project.id });
  await store.remove("project_files", { projectId: project.id });
  await store.remove("project_repositories", { projectId: project.id });
  await store.remove("contracts", { projectId: project.id });
  await store.remove("test_runs", { projectId: project.id });
  await store.remove("projects", { id: project.id });
}
