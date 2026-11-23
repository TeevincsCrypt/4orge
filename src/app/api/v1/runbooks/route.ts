import { z } from "zod";
import { createRunbookTemplate } from "@/lib/runbook/validate";
import { apiRoute } from "@/lib/server/api";
import { json, readJson } from "@/lib/server/http";
import { saveRunbook } from "@/lib/server/services/runbooks";

export const GET = apiRoute(async (req, { store }) => {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
  const runbooks = await store.list("runbooks", { where: projectId ? { projectId } : undefined, orderBy: "updatedAt", desc: true });
  const projects = await store.list("projects", { columns: ["id", "name"] });
  const executions = await store.list("runbook_executions", {
    orderBy: "createdAt",
    desc: true,
    columns: ["id", "runbookId", "status", "createdAt", "network"],
  });
  return json({
    runbooks: runbooks.map((r) => ({
      ...r,
      projectName: projects.find((p) => p.id === r.projectId)?.name ?? "(deleted project)",
      lastExecution: executions.find((e) => e.runbookId === r.id) ?? null,
      executionCount: executions.filter((e) => e.runbookId === r.id).length,
    })),
  });
});

const schema = z.union([
  z.object({ projectId: z.string().min(1), definition: z.unknown() }),
  z.object({
    projectId: z.string().min(1),
    template: z.enum(["full-deploy", "checks-only"]),
    name: z.string().trim().min(1).max(120),
    network: z.enum(["qie-testnet", "qie-mainnet", "local-hardhat"]).optional(),
    contract: z.string().optional(),
    source: z.string().optional(),
    constructorArgs: z.array(z.unknown()).optional(),
  }),
]);

export const POST = apiRoute(async (req, { store }) => {
  const body = await readJson(req, schema);
  const definition =
    "template" in body
      ? createRunbookTemplate(body.template, {
          name: body.name,
          network: body.network,
          contract: body.contract,
          source: body.source,
          constructorArgs: body.constructorArgs,
        })
      : body.definition;
  const { runbook, warnings } = await saveRunbook(store, { projectId: body.projectId, definition });
  return json({ runbook, warnings }, 201);
});
