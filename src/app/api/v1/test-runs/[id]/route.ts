import { apiRoute } from "@/lib/server/api";
import { json, notFound } from "@/lib/server/http";

export const GET = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  const testRun = await store.get("test_runs", id);
  if (!testRun) throw notFound("Test run");
  return json({ testRun });
});
