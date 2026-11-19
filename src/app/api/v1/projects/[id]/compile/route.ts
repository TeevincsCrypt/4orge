import { apiRoute } from "@/lib/server/api";
import { json } from "@/lib/server/http";
import { compileAndRecord, getProject } from "@/lib/server/services/projects";

export const maxDuration = 300;

export const POST = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  const project = await getProject(store, id);
  const { build, contracts, notes } = await compileAndRecord(store, project);
  const { input: _input, ...summary } = build;
  void _input;
  return json({ build: summary, contracts, notes });
});
