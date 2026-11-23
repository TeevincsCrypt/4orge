import { describe, expect, it } from "vitest";
import { acceptProjectFile, normalizeProjectPath } from "@/lib/project/paths";

describe("project path safety", () => {
  it.each(["../etc/passwd", "contracts/../../x.sol", "/abs/file.sol", "C:\\win\\x.sol", "a/\u0000b.sol", "..\\..\\x.sol"])("rejects %s", (p) => {
    expect(normalizeProjectPath(p).ok).toBe(false);
  });
  it("normalises separators and dots", () => {
    expect(normalizeProjectPath("./contracts//Token.sol")).toEqual({ ok: true, path: "contracts/Token.sol" });
    expect(normalizeProjectPath("contracts\\A.sol")).toEqual({ ok: true, path: "contracts/A.sol" });
  });
  it("skips dependency and build directories", () => {
    expect(acceptProjectFile("node_modules/x/a.sol", 10).ok).toBe(false);
    expect(acceptProjectFile("artifacts/a.json", 10).ok).toBe(false);
    expect(acceptProjectFile("lib/forge-std/src/Test.sol", 10).ok).toBe(false);
    expect(acceptProjectFile("package-lock.json", 10).ok).toBe(false);
  });
  it("rejects binaries, unknown types and oversized files", () => {
    expect(acceptProjectFile("logo.png", 10).ok).toBe(false);
    expect(acceptProjectFile(".env", 10).ok).toBe(false);
    expect(acceptProjectFile("contracts/Big.sol", 600 * 1024).ok).toBe(false);
  });
  it("accepts sources, tests and configs", () => {
    for (const p of ["contracts/A.sol", "test/A.ts", "hardhat.config.ts", "foundry.toml", "remappings.txt", "package.json"]) {
      expect(acceptProjectFile(p, 100).ok).toBe(true);
    }
  });
});
