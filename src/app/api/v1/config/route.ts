import { getContext } from "@/lib/server/context";
import { publicConfig } from "@/lib/server/config";
import { errorResponse, HttpError, json } from "@/lib/server/http";

/** Public, non-sensitive server configuration plus the current user (if signed in). */
export async function GET() {
  try {
    let user: { id: string; label: string } | null = null;
    let authError: string | null = null;
    try {
      const ctx = await getContext();
      user = { id: ctx.userId, label: ctx.userLabel };
    } catch (e) {
      if (e instanceof HttpError) authError = e.code;
      else throw e;
    }
    return json({ ...publicConfig(), user, authError, apiVersion: "v1" });
  } catch (e) {
    return errorResponse(e);
  }
}
