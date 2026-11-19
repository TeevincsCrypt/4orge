import { apiRoute } from "@/lib/server/api";
import { json } from "@/lib/server/http";

/** Contracts from each project's latest successful build, with their deployments. */
export const GET = apiRoute(async (_req, { store }) => {
  const projects = await store.list("projects", { columns: ["id", "name", "lastBuildId"] });
  const deployments = await store.list("deployments", { orderBy: "createdAt", desc: true });
  const contracts = [];
  for (const p of projects) {
    if (!p.lastBuildId) continue;
    const rows = await store.list("contracts", {
      where: { buildId: p.lastBuildId },
      columns: ["id", "name", "sourcePath", "fullyQualifiedName", "bytecodeSize", "compilerVersion", "buildId", "projectId", "abi", "hasUnlinkedLibraries", "createdAt"],
    });
    for (const c of rows) {
      contracts.push({
        ...c,
        projectName: p.name,
        deployments: deployments.filter((d) => d.projectId === p.id && d.contractName === c.name && d.sourcePath === c.sourcePath),
      });
    }
  }
  return json({ contracts });
});
