import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { json, readJson } from "@/lib/server/http";
import { getProject, testAndRecord } from "@/lib/server/services/projects";

export const maxDuration = 300;

export const POST = apiRoute<{ id: string }>(async (req, { store }, { id }) => {
  const body = await readJson(req, z.object({ scope: z.enum(["all", "solidity", "nodejs"]).default("all") }));
  const project = await getProject(store, id);
  const run = await testAndRecord(store, project, body.scope);
  return json({ testRun: run });
});
