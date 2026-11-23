import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { json, readJson } from "@/lib/server/http";
import { startExecution } from "@/lib/server/runbook/engine";
import { getRunbook } from "@/lib/server/services/runbooks";

type P = { id: string };

export const GET = apiRoute<P>(async (_req, { store }, { id }) => {
  await getRunbook(store, id);
  const executions = await store.list("runbook_executions", { where: { runbookId: id }, orderBy: "createdAt", desc: true, limit: 50 });
  return json({ executions });
});

const schema = z.object({
  network: z.enum(["qie-testnet", "qie-mainnet", "local-hardhat"]).optional(),
  deployer: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional(),
  constructorArgs: z.array(z.unknown()).max(64).optional(),
});

/** Start a new execution. Steps then run via POST /executions/:id/advance. */
export const POST = apiRoute<P>(async (req, { store }, { id }) => {
  const body = await readJson(req, schema);
  const runbook = await getRunbook(store, id);
  const execution = await startExecution(store, runbook, body);
  return json({ execution }, 201);
});
