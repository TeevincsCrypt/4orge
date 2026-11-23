import { z } from "zod";
import { normalizeProjectPath } from "@/lib/project/paths";
import { apiRoute } from "@/lib/server/api";
import { badRequest, json, notFound, readJson } from "@/lib/server/http";
import { deleteProjectFile, getProject, writeProjectFiles } from "@/lib/server/services/projects";

type P = { id: string };

/** GET ?path=contracts/Foo.sol returns one file's content; without ?path lists all files with contents. */
export const GET = apiRoute<P>(async (req, { store }, { id }) => {
  await getProject(store, id);
  const raw = new URL(req.url).searchParams.get("path");
  if (raw) {
    const norm = normalizeProjectPath(raw);
    if (!norm.ok) throw badRequest(norm.reason);
    const [file] = await store.list("project_files", { where: { projectId: id, path: norm.path }, limit: 1 });
    if (!file) throw notFound("File");
    return json({ file });
  }
  const files = await store.list("project_files", { where: { projectId: id }, orderBy: "path" });
  return json({ files });
});

const putSchema = z.object({
  files: z.array(z.object({ path: z.string().max(400), content: z.string() })).min(1).max(2500),
  replace: z.boolean().default(false),
});

export const PUT = apiRoute<P>(async (req, { store }, { id }) => {
  const body = await readJson(req, putSchema);
  const project = await getProject(store, id);
  const result = await writeProjectFiles(store, project, body.files, { replace: body.replace });
  return json({ result, project: await getProject(store, id) });
});

export const DELETE = apiRoute<P>(async (req, { store }, { id }) => {
  const project = await getProject(store, id);
  const norm = normalizeProjectPath(new URL(req.url).searchParams.get("path") ?? "");
  if (!norm.ok) throw badRequest(norm.reason);
  await deleteProjectFile(store, project, norm.path);
  return json({ deleted: norm.path });
});
