import { apiRoute } from "@/lib/server/api";
import { json } from "@/lib/server/http";
import { getProject } from "@/lib/server/services/projects";

export const GET = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  await getProject(store, id);
  const testRuns = await store.list("test_runs", {
    where: { projectId: id },
    orderBy: "createdAt",
    desc: true,
    limit: 50,
    columns: ["id", "status", "scope", "passed", "failed", "skipped", "durationMs", "createdAt", "errorMessage"],
  });
  return json({ testRuns });
});
