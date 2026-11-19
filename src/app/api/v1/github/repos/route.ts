import { apiRoute } from "@/lib/server/api";
import { currentGithubSession, listUserRepos } from "@/lib/server/github";
import { HttpError, json } from "@/lib/server/http";

export const GET = apiRoute(async () => {
  const session = await currentGithubSession();
  if (!session) throw new HttpError(401, "github_not_connected", "Connect GitHub to list your repositories.");
  return json({ repositories: await listUserRepos(session.token) });
});
