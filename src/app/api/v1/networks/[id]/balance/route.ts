import { formatEther, getAddress, isAddress } from "viem";
import { getNetwork, isNetworkId } from "@/lib/networks";
import { apiRoute } from "@/lib/server/api";
import { describeRpcError, publicClientFor } from "@/lib/server/chain";
import { badRequest, HttpError, json } from "@/lib/server/http";
import { getUserSettings } from "@/lib/server/services/settings";

/** Live native-token balance of an address on a network (read from the chain, never cached or estimated). */
export const GET = apiRoute<{ id: string }>(async (req, { store }, { id }) => {
  if (!isNetworkId(id)) throw badRequest("Unknown network.");
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) throw badRequest("address must be a 0x address.");
  const network = getNetwork(id);
  const settings = await getUserSettings(store);
  try {
    const client = await publicClientFor(id, settings.rpcOverrides[id] ?? null);
    const wei = await client.getBalance({ address: getAddress(address) });
    return json({ network: id, address: getAddress(address), wei: wei.toString(), formatted: formatEther(wei), symbol: network.nativeCurrency.symbol });
  } catch (e) {
    throw new HttpError(502, "rpc_unavailable", `Could not read the balance from ${network.name}: ${describeRpcError(e)}`);
  }
});
