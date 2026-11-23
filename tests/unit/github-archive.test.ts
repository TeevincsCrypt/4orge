import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import * as tar from "tar";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractProjectFiles } from "@/lib/server/github";

// GitHub tarballs wrap everything in one "owner-repo-sha/" folder.
const ROOT = "acme-big-repo-abc123";
let dir: string;
let archive: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "4orge-archive-test-"));
  const repo = path.join(dir, ROOT);
  const write = async (rel: string, content: string | Buffer) => {
    await fs.mkdir(path.dirname(path.join(repo, rel)), { recursive: true });
    await fs.writeFile(path.join(repo, rel), content);
  };
  await write("contracts/Token.sol", "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\ncontract Token {}\n");
  await write("hardhat.config.ts", "export default {};\n");
  await write("package.json", '{"name":"big"}\n');
  await write("node_modules/dep/index.js", "module.exports = 1;\n");
  await write("frontend/public/video.mp4", Buffer.alloc(3 * 1024 * 1024, 7)); // large asset, not a project file
  await write("contracts/Huge.sol", "//" + "x".repeat(600 * 1024)); // over the per-file limit
  await fs.symlink("/etc/passwd", path.join(repo, "contracts", "Link.sol"));
  archive = path.join(dir, "repo.tgz");
  await tar.c({ gzip: true, file: archive, cwd: dir, portable: true }, [ROOT]);
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("GitHub archive extraction", () => {
  it("streams the archive and keeps only the files 4ORGE uses", async () => {
    const { files, skipped } = await extractProjectFiles(createReadStream(archive));
    expect(files.map((f) => f.path).sort()).toEqual(["contracts/Token.sol", "hardhat.config.ts", "package.json"]);
    expect(files.find((f) => f.path === "contracts/Token.sol")?.content).toContain("contract Token");
    expect(skipped).toEqual([{ path: "contracts/Huge.sol", reason: "File is larger than 512 KB." }]);
  });

  it("treats a non-archive as empty, so the import reports no Solidity files", async () => {
    await expect(extractProjectFiles(Readable.from([Buffer.from("not a tarball at all")]))).resolves.toEqual({ files: [], skipped: [] });
  });
});
