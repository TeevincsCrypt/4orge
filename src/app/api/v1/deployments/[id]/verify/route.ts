import { z } from "zod";
import { apiRoute } from "@/lib/server/api";
import { json, notFound, readJson } from "@/lib/server/http";
import { refreshVerification, verifyDeployment } from "@/lib/server/verify";

export const maxDuration = 120;

/** Submit (mode=submit, default) or re-check (mode=check) explorer verification. */
export const POST = apiRoute<{ id: string }>(async (req, { store }, { id }) => {
  const { mode } = await readJson(req, z.object({ mode: z.enum(["submit", "check"]).default("submit") }));
  const deployment = await store.get("deployments", id);
  if (!deployment) throw notFound("Deployment");
  const result =
    mode === "check"
      ? await refreshVerification(deployment)
      : await verifyDeployment(deployment, await store.get("builds", deployment.buildId));
  if (!result) return json({ deployment, result: { status: deployment.verificationStatus, message: "Explorer could not be reached." } });
  const updated = await store.update("deployments", id, { verificationStatus: result.status, verificationMessage: result.message });
  return json({ deployment: updated, result });
});
