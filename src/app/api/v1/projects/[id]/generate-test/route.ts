import { z } from "zod";
import { constructorInputs } from "@/lib/abi-args";
import { generateSolidityTest } from "@/lib/project/templates";
import { apiRoute } from "@/lib/server/api";
import { conflict, json, notFound, readJson } from "@/lib/server/http";
import { getProject, writeProjectFiles } from "@/lib/server/services/projects";

export const POST = apiRoute<{ id: string }>(async (req, { store }, { id }) => {
  const { contractId } = await readJson(req, z.object({ contractId: z.string().min(1) }));
  const project = await getProject(store, id);
  const contract = await store.get("contracts", contractId);
  if (!contract || contract.projectId !== project.id) throw notFound("Contract");
  const test = generateSolidityTest(contract.name, contract.sourcePath, constructorInputs(contract.abi));
  const [existing] = await store.list("project_files", { where: { projectId: id, path: test.path }, limit: 1, columns: ["id"] });
  if (existing) throw conflict(`${test.path} already exists.`);
  await writeProjectFiles(store, project, [test], { replace: false });
  return json({ path: test.path }, 201);
});
