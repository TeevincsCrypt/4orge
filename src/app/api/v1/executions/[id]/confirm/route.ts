import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { json, readJson } from "@/lib/server/http";
import { confirmStep } from "@/lib/server/runbook/engine";

export const maxDuration = 300;

export const POST = apiRoute<{ id: string }>(async (req, { store, userLabel }, { id }) => {
  const { stepId } = await readJson(req, z.object({ stepId: z.string().min(1) }));
  return json({ execution: await confirmStep(store, userLabel, id, stepId) });
});
