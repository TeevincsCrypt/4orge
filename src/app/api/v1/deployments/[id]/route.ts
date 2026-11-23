import { apiRoute } from "@/lib/server/api";
import { json, notFound } from "@/lib/server/http";

export const GET = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  const deployment = await store.get("deployments", id);
  if (!deployment) throw notFound("Deployment");
  const [project, contract, execution] = await Promise.all([
    deployment.projectId ? store.get("projects", deployment.projectId) : null,
    store
      .list("contracts", { where: { buildId: deployment.buildId } })
      .then((cs) => cs.find((c) => c.name === deployment.contractName && c.sourcePath === deployment.sourcePath) ?? null),
    deployment.executionId ? store.get("runbook_executions", deployment.executionId) : null,
  ]);
  return json({
    deployment,
    project: project ? { id: project.id, name: project.name } : null,
    contract,
    execution: execution ? { id: execution.id, runbookId: execution.runbookId, status: execution.status } : null,
  });
});
