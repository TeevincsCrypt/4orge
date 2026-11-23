/**
 * Normalise the public app URL setting (NEXT_PUBLIC_APP_URL). Hosting
 * dashboards make it easy to paste a bare domain ("app.up.railway.app"),
 * a trailing slash or surrounding quotes, so accept all of those and return
 * a clean origin like "https://app.up.railway.app". Returns null when the
 * value is empty or not a usable http(s) URL.
 */
export function normalizeAppUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let v = raw.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(v);
    v = `${local ? "http" : "https"}://${v}`;
  }
  try {
    const url = new URL(v);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname || url.hostname.includes(" ")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** The configured public app URL, normalised (null when unset or invalid). */
export const APP_URL: string | null = normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);
