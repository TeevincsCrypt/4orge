import { describe, expect, it } from "vitest";
import { normalizeAppUrl } from "@/lib/app-url";

describe("NEXT_PUBLIC_APP_URL normalisation", () => {
  it.each([
    ["4orge-production.up.railway.app", "https://4orge-production.up.railway.app"],
    ["https://4orge-production.up.railway.app/", "https://4orge-production.up.railway.app"],
    ["  https://forge.example.com/some/path  ", "https://forge.example.com"],
    ['"https://forge.example.com"', "https://forge.example.com"],
    ["localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3000", "http://127.0.0.1:3000"],
  ])("%s → %s", (raw, expected) => expect(normalizeAppUrl(raw)).toBe(expected));
  it("rejects empty or unusable values instead of crashing", () => {
    for (const v of [undefined, "", "   ", "ftp://x.com", "not a url at all", "javascript:alert(1)"]) expect(normalizeAppUrl(v)).toBeNull();
  });
});
