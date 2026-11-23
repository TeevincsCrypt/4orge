import { isDeploymentAllowed, listNetworks } from "@/lib/networks";
import { apiRoute } from "@/lib/server/api";
import { getConfig } from "@/lib/server/config";
import { json } from "@/lib/server/http";
import { getUserSettings } from "@/lib/server/services/settings";

export const GET = apiRoute(async (_req, { store }) => {
  const { networkFlags } = getConfig();
  const settings = await getUserSettings(store);
  return json({
    networks: listNetworks(networkFlags).map((n) => ({
      ...n,
      deploymentsAllowed: isDeploymentAllowed(n, networkFlags),
      rpcOverride: settings.rpcOverrides[n.id] ?? null,
    })),
    defaultNetwork: settings.defaultNetwork,
  });
});
