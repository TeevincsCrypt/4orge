import { apiRoute } from "@/lib/server/api";
import { json } from "@/lib/server/http";
import { getExecution } from "@/lib/server/runbook/engine";

export const GET = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  const execution = await getExecution(store, id);
  const logs = await store.list("execution_logs", { where: { executionId: id }, orderBy: "createdAt" });
  return json({ execution, logs });
});
