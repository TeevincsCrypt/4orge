import { NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";
import { supabaseServerClient } from "@/lib/server/context";
import { publicUrl } from "@/lib/server/origin";

/** Supabase Auth redirect target (magic link / OAuth code exchange). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (getConfig().storageMode === "supabase" && code) {
    const supabase = await supabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(publicUrl(req, `/login?error=${encodeURIComponent(error.message)}`));
  }
  const next = url.searchParams.get("next");
  return NextResponse.redirect(publicUrl(req, next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"));
}
