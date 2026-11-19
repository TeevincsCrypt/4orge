import "server-only";
import { DEFAULT_NETWORK_ID, type NetworkId } from "@/lib/networks";
import type { UserSettings } from "@/lib/types";
import type { DataStore } from "../store/types";

export const DEFAULT_SETTINGS = {
  defaultNetwork: DEFAULT_NETWORK_ID as NetworkId,
  rpcOverrides: {} as Partial<Record<NetworkId, string>>,
  requireTestsBeforeDeploy: true,
};

export async function getUserSettings(store: DataStore): Promise<Pick<UserSettings, "defaultNetwork" | "rpcOverrides" | "requireTestsBeforeDeploy"> & { id: string | null }> {
  const [row] = await store.list("user_settings", { limit: 1 });
  if (!row) return { id: null, ...DEFAULT_SETTINGS };
  return { id: row.id, defaultNetwork: row.defaultNetwork, rpcOverrides: row.rpcOverrides ?? {}, requireTestsBeforeDeploy: row.requireTestsBeforeDeploy };
}

export async function saveUserSettings(
  store: DataStore,
  patch: Partial<Pick<UserSettings, "defaultNetwork" | "rpcOverrides" | "requireTestsBeforeDeploy">>,
) {
  const current = await getUserSettings(store);
  if (current.id) return store.update("user_settings", current.id, patch);
  return store.insert("user_settings", { ...DEFAULT_SETTINGS, ...patch });
}
