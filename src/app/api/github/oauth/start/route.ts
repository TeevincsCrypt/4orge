import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";
import { getContext } from "@/lib/server/context";
import { errorResponse } from "@/lib/server/http";

/** Begin the GitHub OAuth web flow (server-side; the client secret never reaches the browser). */
export async function GET(req: Request) {
  try {
    await getContext(); // must be an authenticated 4ORGE user
    const cfg = getConfig();
    if (!cfg.github.configured) {
      return NextResponse.redirect(new URL("/settings?github=not-configured", req.url));
    }
    const state = randomBytes(24).toString("base64url");
    (await cookies()).set("forge_gh_state", state, { httpOnly: true, sameSite: "lax", secure: req.url.startsWith("https"), maxAge: 600, path: "/" });
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", cfg.github.clientId!);
    url.searchParams.set("redirect_uri", new URL("/api/github/oauth/callback", cfg.appUrl ?? req.url).toString());
    url.searchParams.set("scope", "repo read:user");
    url.searchParams.set("state", state);
    url.searchParams.set("allow_signup", "false");
    return NextResponse.redirect(url);
  } catch (e) {
    return errorResponse(e);
  }
}
