import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { json, readJson } from "@/lib/server/http";
import { submitWalletResult } from "@/lib/server/runbook/engine";

export const maxDuration = 300;

const schema = z.object({
  stepId: z.string().min(1),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  from: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  error: z.object({ code: z.number().optional(), message: z.string().max(2000) }).optional(),
});

/** Report the outcome of the wallet signature request (tx hash or wallet error). */
export const POST = apiRoute<{ id: string }>(async (req, { store, userLabel }, { id }) => {
  const body = await readJson(req, schema);
  return json({ execution: await submitWalletResult(store, userLabel, id, body) });
});
