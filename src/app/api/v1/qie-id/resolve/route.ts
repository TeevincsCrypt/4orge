import { isNetworkId } from "@/lib/networks";
import { apiRoute } from "@/lib/server/api";
import { badRequest, json } from "@/lib/server/http";
import { resolveQieName } from "@/lib/server/qie-id";

/**
 * Preview which address a QIE ID (name.qie) points to, for the deployment form.
 * The Runbook resolves names again when it runs and pins that result, so this
 * answer is informational only.
 */
export const GET = apiRoute(async (req) => {
  const params = new URL(req.url).searchParams;
  const name = params.get("name") ?? "";
  const network = params.get("network") ?? "qie-mainnet";
  if (!isNetworkId(network)) throw badRequest("Unknown network.");
  const address = await resolveQieName(name, network);
  return json({ name: name.trim().toLowerCase(), network, address });
});
