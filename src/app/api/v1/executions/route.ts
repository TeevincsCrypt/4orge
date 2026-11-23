import { apiRoute } from "@/lib/server/api";
import { json } from "@/lib/server/http";

export const GET = apiRoute(async (req, { store }) => {
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50, 200);
  const executions = await store.list("runbook_executions", {
    orderBy: "createdAt",
    desc: true,
    limit,
    columns: ["id", "runbookId", "projectId", "runbookName", "network", "status", "steps", "createdAt", "finishedAt"],
  });
  return json({ executions });
});
