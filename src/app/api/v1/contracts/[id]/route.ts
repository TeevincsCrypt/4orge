import { apiRoute } from "@/lib/server/api";
import { json, notFound } from "@/lib/server/http";

export const GET = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  const contract = await store.get("contracts", id);
  if (!contract) throw notFound("Contract");
  return json({ contract });
});
