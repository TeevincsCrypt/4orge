import { apiRoute } from "@/lib/server/api";
import { json } from "@/lib/server/http";
import { getProject } from "@/lib/server/services/projects";

export const GET = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  await getProject(store, id);
  const builds = await store.list("builds", {
    where: { projectId: id },
    orderBy: "createdAt",
    desc: true,
    limit: 50,
    columns: ["id", "status", "compilerVersion", "errors", "warnings", "durationMs", "sourceCount", "contractCount", "createdAt", "settings", "inputHash"],
  });
  return json({ builds });
});
