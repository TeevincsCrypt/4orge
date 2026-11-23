import { afterEach, describe, expect, it } from "vitest";
import { publicOrigin, publicUrl } from "@/lib/server/origin";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

describe("public origin behind a proxy", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
  it("prefers NEXT_PUBLIC_APP_URL over the internal request URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "forge.up.railway.app/";
    expect(publicUrl(req("http://localhost:8080/auth/callback"), "/dashboard").toString()).toBe("https://forge.up.railway.app/dashboard");
  });
  it("uses forwarded headers when no public URL is configured", () => {
    expect(publicOrigin(req("http://localhost:8080/x", { "x-forwarded-host": "forge.up.railway.app", "x-forwarded-proto": "https" }))).toBe("https://forge.up.railway.app");
  });
  it("falls back to the request URL locally", () => {
    expect(publicOrigin(req("http://localhost:3000/x"))).toBe("http://localhost:3000");
  });
});
