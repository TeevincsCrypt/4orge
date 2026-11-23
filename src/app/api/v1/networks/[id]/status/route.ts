import { isNetworkId } from "@/lib/networks";
import { apiRoute } from "@/lib/server/api";
import { checkNetwork } from "@/lib/server/chain";
import { badRequest, json } from "@/lib/server/http";
import { getUserSettings } from "@/lib/server/services/settings";
import { probeExplorer } from "@/lib/server/verify";

/** Live, server-side check: eth_chainId must match the configured chain ID. */
export const GET = apiRoute<{ id: string }>(async (_req, { store }, { id }) => {
  if (!isNetworkId(id)) throw badRequest("Unknown network.");
  const settings = await getUserSettings(store);
  const [rpc, explorer] = await Promise.all([checkNetwork(id, settings.rpcOverrides[id] ?? null), probeExplorer(id)]);
  return json({ rpc, explorer });
});
