import { apiRoute } from "@/lib/server/api";
import { json } from "@/lib/server/http";
import { cancelExecution } from "@/lib/server/runbook/engine";

export const POST = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  return json({ execution: await cancelExecution(store, id) });
});
