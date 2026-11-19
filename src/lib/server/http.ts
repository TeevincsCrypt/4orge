import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { NotFoundError } from "./store/types";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found.`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return json({ error: { code: e.code, message: e.message, details: e.details } }, e.status);
  }
  if (e instanceof NotFoundError) {
    return json({ error: { code: "not_found", message: e.message } }, 404);
  }
  if (e instanceof ZodError) {
    return json(
      {
        error: {
          code: "validation_error",
          message: "Request body is invalid.",
          details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      422,
    );
  }
  // Never leak internals (paths, env) in 500 responses; log server-side only.
  console.error("[4orge] unhandled API error:", e);
  return json({ error: { code: "internal_error", message: "Something went wrong on the server." } }, 500);
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 15 * 1024 * 1024) throw badRequest("Request body is too large.");
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw badRequest("Request body must be valid JSON.");
  }
  return schema.parse(body);
}

export type RouteParams<P> = { params: Promise<P> };
