import { apiRoute } from "@/lib/server/api";
import { getConfig } from "@/lib/server/config";
import { currentGithubSession } from "@/lib/server/github";
import { json } from "@/lib/server/http";

export const GET = apiRoute(async () => {
  const configured = getConfig().github.configured;
  const session = configured ? await currentGithubSession() : null;
  return json({ configured, connected: Boolean(session), login: session?.login ?? null, scope: session?.scope ?? null });
});
