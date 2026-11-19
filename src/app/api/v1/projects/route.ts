import { z } from "zod";
import { getTemplate } from "@/lib/project/templates";
import { apiRoute } from "@/lib/server/api";
import { badRequest, json, readJson } from "@/lib/server/http";
import { createProject } from "@/lib/server/services/projects";

export const GET = apiRoute(async (_req, { store }) => {
  const projects = await store.list("projects", { orderBy: "updatedAt", desc: true });
  const deployments = await store.list("deployments", { columns: ["projectId", "status"] });
  const runbooks = await store.list("runbooks", { columns: ["projectId"] });
  return json({
    projects: projects.map((p) => ({
      ...p,
      stats: {
        deployments: deployments.filter((d) => d.projectId === p.id && d.status === "confirmed").length,
        runbooks: runbooks.filter((r) => r.projectId === p.id).length,
      },
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  template: z.enum(["counter", "token", "oz-token", "blank"]).optional(),
  files: z.array(z.object({ path: z.string(), content: z.string() })).max(2500).optional(),
});

export const POST = apiRoute(async (req, { store }) => {
  const body = await readJson(req, createSchema);
  let files = body.files ?? [];
  let source: "blank" | "template" | "upload" = files.length ? "upload" : "blank";
  if (body.template) {
    const t = getTemplate(body.template);
    if (!t) throw badRequest("Unknown template.");
    files = t.files;
    source = body.template === "blank" ? "blank" : "template";
  }
  const { project, result } = await createProject(store, { name: body.name, description: body.description, source, files });
  return json({ project, files: result }, 201);
});
