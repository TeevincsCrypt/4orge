import { mkdtempSync, rmSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyFsPermissions } from "@/lib/server/testing/runner";

const dir = mkdtempSync(path.join(os.tmpdir(), "4orge-fsperm-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("test sandbox file permissions", () => {
  it("copies permitted files and never grants writes to the root or node_modules", async () => {
    const out = await applyFsPermissions(dir, [
      {
        path: "foundry.toml",
        content: `fs_permissions = [\n  { access = "read", path = "./config" },\n  { access = "read-write", path = "./deployments" },\n  { access = "read-write", path = "./" },\n  { access = "write", path = "./node_modules" },\n]\n`,
      },
      { path: "config/a.json", content: "{}" },
      { path: "src/A.sol", content: "contract A {}" },
    ]);
    expect(out).toEqual({
      readDirectory: [path.join(dir, "config"), dir, path.join(dir, "node_modules")],
      dangerouslyReadWriteDirectory: [path.join(dir, "deployments")],
    });
    expect(await fs.readFile(path.join(dir, "config", "a.json"), "utf8")).toBe("{}");
    // Solidity sources are written by the runner itself, not duplicated here.
    await expect(fs.access(path.join(dir, "src", "A.sol"))).rejects.toThrow();
  });
});
