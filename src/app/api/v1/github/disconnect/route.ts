import { cookies } from "next/headers";
import { apiRoute } from "@/lib/server/api";
import { GH_COOKIE } from "@/lib/server/github";
import { json } from "@/lib/server/http";

export const POST = apiRoute(async () => {
  (await cookies()).delete(GH_COOKIE);
  return json({ connected: false });
});
