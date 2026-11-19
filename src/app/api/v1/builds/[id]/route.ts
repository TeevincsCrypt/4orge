import { apiRoute } from "@/lib/server/api";
import { json, notFound } from "@/lib/server/http";

/** GET a build. Add ?input=1 to include the Standard JSON input (used for verification). */
export const GET = apiRoute<{ id: string }>(async (req, { store }, { id }) => {
  const build = await store.get("builds", id);
  if (!build) throw notFound("Build");
  const contracts = await store.list("contracts", { where: { buildId: id }, orderBy: "fullyQualifiedName" });
  const withInput = new URL(req.url).searchParams.get("input") === "1";
  const { input, ...rest } = build;
  return json({ build: withInput ? { ...rest, input } : rest, contracts });
});
