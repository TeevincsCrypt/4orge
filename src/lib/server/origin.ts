import "server-only";

/**
 * The public origin users reach this app at. Behind a hosting proxy
 * (Railway, Render, Docker) `request.url` can carry the internal address
 * (e.g. http://localhost:8080), so redirects must not be built from it alone.
 * Order: NEXT_PUBLIC_APP_URL → forwarded headers → Host header → request URL.
 */
export function publicOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through to headers */
    }
  }
  const fallback = new URL(req.url);
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? fallback.host).split(",")[0].trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? fallback.protocol.replace(":", "")).split(",")[0].trim();
  return `${proto}://${host}`;
}

/** Absolute URL on the public origin for an internal path. */
export function publicUrl(req: Request, path: string): URL {
  return new URL(path, publicOrigin(req));
}
