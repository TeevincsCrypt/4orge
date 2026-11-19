import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { json, readJson } from "@/lib/server/http";
import { getRunbook, saveRunbook } from "@/lib/server/services/runbooks";

type P = { id: string };

export const GET = apiRoute<P>(async (_req, { store }, { id }) => {
  const runbook = await getRunbook(store, id);
  const project = await store.get("projects", runbook.projectId);
  const executions = await store.list("runbook_executions", {
    where: { runbookId: id },
    orderBy: "createdAt",
    desc: true,
    limit: 20,
    columns: ["id", "status", "network", "createdAt", "finishedAt", "context"],
  });
  return json({ runbook, project, executions });
});

export const PUT = apiRoute<P>(async (req, { store }, { id }) => {
  const body = await readJson(req, z.object({ projectId: z.string().min(1), definition: z.unknown() }));
  const result = await saveRunbook(store, { id, projectId: body.projectId, definition: body.definition });
  return json(result);
});

export const DELETE = apiRoute<P>(async (_req, { store }, { id }) => {
  await getRunbook(store, id);
  await store.remove("runbook_steps", { runbookId: id });
  await store.remove("runbooks", { id });
  return json({ deleted: true });
});
