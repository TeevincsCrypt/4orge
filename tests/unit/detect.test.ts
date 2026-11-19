import { describe, expect, it } from "vitest";
import { detectProject, parseDeclarations, parseHardhatConfig, parseImports, parsePragmas, parseFoundryToml } from "@/lib/project/detect";
import { TEMPLATES } from "@/lib/project/templates";

describe("project detection (static, never executes config)", () => {
  it("parses declarations ignoring comments and strings", () => {
    const src = `// contract Fake {}\n/* interface Nope {} */\nabstract contract Base {}\ncontract Real is Base { string s = "contract InString"; }\nlibrary L {}\ninterface I {}`;
    expect(parseDeclarations("a.sol", src).map((d) => `${d.kind}:${d.name}`)).toEqual(["abstract:Base", "contract:Real", "library:L", "interface:I"]);
  });
  it("parses pragmas and imports", () => {
    const src = `pragma solidity ^0.8.20;\nimport "./A.sol";\nimport {B} from "@oz/B.sol";\nimport * as C from '../C.sol';`;
    expect(parsePragmas(src)).toEqual(["^0.8.20"]);
    expect(parseImports(src)).toEqual(["./A.sol", "@oz/B.sol", "../C.sol"]);
  });
  it("reads hardhat config settings as text", () => {
    const cfg = `export default { solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 1000 }, evmVersion: "paris", viaIR: true } } }`;
    expect(parseHardhatConfig(cfg)).toEqual({ version: "0.8.24", optimizer: { enabled: true, runs: 1000 }, evmVersion: "paris", viaIR: true });
  });
  it("reads foundry.toml", () => {
    const r = parseFoundryToml(`[profile.default]\nsrc = "src"\nsolc_version = "0.8.26"\noptimizer = true\noptimizer_runs = 500\nremappings = ["@oz/=lib/oz/"]`);
    expect(r.settings.version).toBe("0.8.26");
    expect(r.settings.optimizer).toEqual({ enabled: true, runs: 500 });
    expect(r.remappings).toEqual(["@oz/=lib/oz/"]);
  });
  it("detects every template as a hardhat project with contracts", () => {
    for (const t of TEMPLATES) {
      const { detection, compiler } = detectProject(t.files);
      expect(detection.framework).toBe("hardhat");
      expect(compiler.version).toBe("0.8.28");
      expect(detection.contracts.some((c) => c.kind === "contract")).toBe(true);
    }
  });
  it("separates tests from sources", () => {
    const { detection } = detectProject(TEMPLATES[0].files);
    expect(detection.testFiles.solidity).toEqual(["contracts/Counter.t.sol"]);
    expect(detection.testFiles.nodejs).toEqual(["test/Counter.ts"]);
    expect(detection.contracts.map((c) => c.name)).toEqual(["Counter"]);
  });
});
