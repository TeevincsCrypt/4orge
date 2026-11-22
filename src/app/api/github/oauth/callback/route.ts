import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";
import { getContext } from "@/lib/server/context";
import { GH_COOKIE, sealToken } from "@/lib/server/github";
import { publicOrigin, publicUrl } from "@/lib/server/origin";

export async function GET(req: Request) {
  const back = (q: string) => NextResponse.redirect(publicUrl(req, `/settings?github=${q}`));
  try {
    await getContext();
    const cfg = getConfig();
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";
    const jar = await cookies();
    const expected = jar.get("forge_gh_state")?.value ?? "";
    jar.delete("forge_gh_state");
    if (!code || !expected || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
      return back("state-mismatch");
    }
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ client_id: cfg.github.clientId, client_secret: cfg.github.clientSecret, code }),
      signal: AbortSignal.timeout(20_000),
    });
    const token = (await tokenRes.json()) as { access_token?: string; scope?: string; error?: string };
    if (!token.access_token) return back("denied");
    const userRes = await fetch("https://api.github.com/user", {
      headers: { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "user-agent": "4orge" },
      signal: AbortSignal.timeout(20_000),
    });
    const user = (await userRes.json()) as { login?: string };
    jar.set(GH_COOKIE, sealToken({ token: token.access_token, login: user.login ?? "unknown", scope: token.scope ?? "" }), {
      httpOnly: true,
      sameSite: "lax",
      secure: publicOrigin(req).startsWith("https"),
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return back("connected");
  } catch {
    return back("error");
  }
}
