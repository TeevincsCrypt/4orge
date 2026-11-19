import { NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";
import { supabaseServerClient } from "@/lib/server/context";

/** Supabase Auth redirect target (magic link / OAuth code exchange). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (getConfig().storageMode === "supabase" && code) {
    const supabase = await supabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, req.url));
  }
  const next = url.searchParams.get("next");
  return NextResponse.redirect(new URL(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard", req.url));
}
