import { apiRoute } from "@/lib/server/api";
import { json } from "@/lib/server/http";

/** List deployments. Filters: ?network=&status=&projectId=&q= (contract name, address or tx hash). */
export const GET = apiRoute(async (req, { store }) => {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim().toLowerCase();
  let rows = await store.list("deployments", { orderBy: "createdAt", desc: true });
  const network = sp.get("network");
  const status = sp.get("status");
  const projectId = sp.get("projectId");
  if (network) rows = rows.filter((d) => d.network === network);
  if (status) rows = rows.filter((d) => d.status === status);
  if (projectId) rows = rows.filter((d) => d.projectId === projectId);
  if (q) {
    rows = rows.filter((d) =>
      [d.contractName, d.contractAddress ?? "", d.txHash, d.deployerAddress].some((v) => v.toLowerCase().includes(q)),
    );
  }
  const projects = await store.list("projects", { columns: ["id", "name"] });
  return json({
    deployments: rows.map((d) => ({ ...d, projectName: projects.find((p) => p.id === d.projectId)?.name ?? null })),
  });
});
