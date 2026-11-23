import { mkdtempSync, promises as fs, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { afterAll, describe, expect, it, vi } from "vitest";

// Fresh cache so nothing is already downloaded (read lazily by getConfig()).
const cache = mkdtempSync(path.join(os.tmpdir(), "4orge-pinned-test-"));
process.env.FORGE_CACHE_DIR = cache;
afterAll(() => rmSync(cache, { recursive: true, force: true }));

async function fakeForgeStd(testSol: string): Promise<Buffer> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "4orge-fake-forge-std-"));
  try {
    const root = path.join(dir, "foundry-rs-forge-std-f3dae6e");
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), '{"name":"forge-std","version":"1.17.0"}');
    await fs.writeFile(path.join(root, "src", "Test.sol"), testSol);
    await tar.c({ gzip: true, file: path.join(dir, "a.tgz"), cwd: dir, portable: true }, ["foundry-rs-forge-std-f3dae6e"]);
    return await fs.readFile(path.join(dir, "a.tgz"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("pinned packages (forge-std from GitHub)", () => {
  it("rejects a download whose contents don't match the pinned hash", async () => {
    const archive = await fakeForgeStd("// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Test { /* tampered */ }\n");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      expect(String(input)).toBe("https://codeload.github.com/foundry-rs/forge-std/tar.gz/f3dae6e6ee381f25eb6a246f7da9b85c91a68219");
      return new Response(new Uint8Array(archive));
    });
    const { resolveSources } = await import("@/lib/server/compiler/dependencies");
    const out = await resolveSources(
      [{ path: "test/A.t.sol", content: 'pragma solidity ^0.8.0;\nimport {Test} from "forge-std/Test.sol";\ncontract A is Test {}\n' }],
      { remappings: [], dependencies: { "forge-std": "github:foundry-rs/forge-std#v1.9.4" }, includeTests: true },
    );
    fetchSpy.mockRestore();
    expect(out.missing).toHaveLength(1);
    expect(out.missing[0].reason).toContain("does not match its pinned content hash");
    // Nothing unverified is left in the cache.
    await expect(fs.access(path.join(cache, "npm", "forge-std@1.17.0"))).rejects.toThrow();
  });
});
