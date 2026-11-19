import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { json, readJson } from "@/lib/server/http";
import { advanceExecution } from "@/lib/server/runbook/engine";

export const maxDuration = 300;

export const POST = apiRoute<{ id: string }>(async (req, { store, userLabel }, { id }) => {
  const body = await readJson(req, z.object({ deployer: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional() }));
  const execution = await advanceExecution(store, userLabel, id, { deployer: body.deployer });
  return json({ execution });
});
