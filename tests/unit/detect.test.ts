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
  it("uses a config in a subfolder when the root has none (monorepos)", () => {
    const { detection, compiler } = detectProject([
      { path: "package.json", content: '{"name":"app"}' },
      { path: "apps/web/hardhat.config.ts", content: "export default {}" }, // deeper: not chosen
      {
        path: "contracts/foundry.toml",
        content: `[profile.default]\nsolc_version = "0.8.28"\nevm_version = "cancun"\noptimizer = true\noptimizer_runs = 200\nremappings = [\n  "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",\n  "forge-std/=lib/forge-std/src/",\n  "@local/=src/shared/",\n]`,
      },
      { path: "contracts/src/shared/Lib.sol", content: "pragma solidity ^0.8.20; library Lib {}" },
      { path: "contracts/src/A.sol", content: "pragma solidity ^0.8.20; contract A {}" },
    ]);
    expect(detection.framework).toBe("foundry");
    expect(detection.configFile).toBe("contracts/foundry.toml");
    expect(compiler).toMatchObject({ version: "0.8.28", evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } });
    // Rebased to the root; the lib/ submodule remappings aren't in the project and are dropped.
    expect(detection.remappings).toEqual(["@local/=contracts/src/shared/"]);
    expect(detection.notes.join(" ")).toContain("Ignored 2 remapping(s)");
  });
  it("drops root remappings into missing git submodules but keeps node_modules ones", () => {
    const { detection } = detectProject([
      { path: "foundry.toml", content: `[profile.default]\nremappings = ["forge-std/=lib/forge-std/src/", "@oz/=node_modules/@openzeppelin/contracts/"]` },
      { path: "src/A.sol", content: "pragma solidity ^0.8.20; contract A {}" },
    ]);
    expect(detection.remappings).toEqual(["@oz/=node_modules/@openzeppelin/contracts/"]);
  });
});
