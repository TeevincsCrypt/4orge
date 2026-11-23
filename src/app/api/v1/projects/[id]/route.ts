import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { json, readJson } from "@/lib/server/http";
import { deleteProject, getProject, latestContracts, updateCompilerSettings } from "@/lib/server/services/projects";

type P = { id: string };

export const GET = apiRoute<P>(async (_req, { store }, { id }) => {
  const project = await getProject(store, id);
  const [files, repository, contracts, lastBuild, lastTestRun, deployments, runbooks] = await Promise.all([
    store.list("project_files", { where: { projectId: id }, orderBy: "path", columns: ["id", "path", "size", "sha256", "updatedAt"] }),
    store.list("project_repositories", { where: { projectId: id }, limit: 1 }).then((r) => r[0] ?? null),
    latestContracts(store, project),
    store.list("builds", { where: { projectId: id }, orderBy: "createdAt", desc: true, limit: 1, columns: ["id", "status", "compilerVersion", "errors", "warnings", "durationMs", "sourceCount", "contractCount", "createdAt", "settings"] }).then((r) => r[0] ?? null),
    project.lastTestRunId ? store.get("test_runs", project.lastTestRunId) : null,
    store.list("deployments", { where: { projectId: id }, orderBy: "createdAt", desc: true }),
    store.list("runbooks", { where: { projectId: id }, orderBy: "updatedAt", desc: true }),
  ]);
  return json({ project, files, repository, contracts, lastBuild, lastTestRun, deployments, runbooks });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  compiler: z
    .object({
      version: z.string().regex(/^\d+\.\d+\.\d+$/).nullable(),
      optimizer: z.object({ enabled: z.boolean(), runs: z.number().int().min(1).max(4294967295) }),
      evmVersion: z.enum(["homestead", "tangerineWhistle", "spuriousDragon", "byzantium", "constantinople", "petersburg", "istanbul", "berlin", "london", "paris", "shanghai", "cancun", "prague", "osaka"]).nullable(),
      viaIR: z.boolean(),
    })
    .optional(),
});

export const PATCH = apiRoute<P>(async (req, { store }, { id }) => {
  const body = await readJson(req, patchSchema);
  let project = await getProject(store, id);
  if (body.name !== undefined || body.description !== undefined) {
    project = await store.update("projects", id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    });
  }
  if (body.compiler) project = await updateCompilerSettings(store, project, body.compiler);
  return json({ project });
});

export const DELETE = apiRoute<P>(async (_req, { store }, { id }) => {
  const project = await getProject(store, id);
  await deleteProject(store, project);
  return json({ deleted: true });
});
