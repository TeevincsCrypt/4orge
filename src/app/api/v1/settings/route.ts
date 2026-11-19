import { z } from "zod";
import { validateRpcUrl } from "@/lib/networks";
import { apiRoute } from "@/lib/server/api";
import { badRequest, json, readJson } from "@/lib/server/http";
import { getUserSettings, saveUserSettings } from "@/lib/server/services/settings";

export const GET = apiRoute(async (_req, { store }) => json({ settings: await getUserSettings(store) }));

const schema = z.object({
  defaultNetwork: z.enum(["qie-testnet", "qie-mainnet", "local-hardhat"]).optional(),
  rpcOverrides: z.record(z.enum(["qie-testnet", "qie-mainnet", "local-hardhat"]), z.string().max(500)).optional(),
  requireTestsBeforeDeploy: z.boolean().optional(),
});

export const PUT = apiRoute(async (req, { store }) => {
  const body = await readJson(req, schema);
  if (body.rpcOverrides) {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.rpcOverrides)) {
      if (!v?.trim()) continue;
      const check = validateRpcUrl(v);
      if (!check.ok) throw badRequest(`${k}: ${check.error}`);
      clean[k] = check.url;
    }
    body.rpcOverrides = clean;
  }
  await saveUserSettings(store, body);
  return json({ settings: await getUserSettings(store) });
});
