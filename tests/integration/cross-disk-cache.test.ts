import { statSync } from "node:fs";
import os from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";

// Hosting platforms often mount the cache on a separate volume (Railway: /data).
// A rename from the system temp folder into it fails with EXDEV, so downloads must
// be unpacked on the cache's own filesystem. /dev/shm is a different filesystem
// from the temp folder on Linux, which reproduces that setup.
const CACHE = "/dev/shm/4orge-cross-disk-cache";
const separateDisk = (() => {
  try {
    return statSync("/dev/shm").dev !== statSync(os.tmpdir()).dev;
  } catch {
    return false;
  }
})();
if (separateDisk) process.env.FORGE_CACHE_DIR = CACHE; // read lazily by getConfig()

afterAll(() => rmSync(CACHE, { recursive: true, force: true }));

describe.skipIf(!separateDisk)("compiler cache on a separate disk", () => {
  it("downloads the compiler and OpenZeppelin into it and compiles", async () => {
    const { compileProject } = await import("@/lib/server/compiler/compile");
    const { detectProject } = await import("@/lib/project/detect");
    const { getTemplate } = await import("@/lib/project/templates");
    const files = getTemplate("oz-token")!.files;
    const { detection, compiler } = detectProject(files);
    const out = await compileProject(files, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies });
    expect(out.errors).toEqual([]);
    expect(out.contracts.map((c) => c.name)).toEqual(["QieToken"]);
  });
});
