import { describe, expect, it } from "vitest";
import { compileProject } from "@/lib/server/compiler/compile";
import { runProjectTests } from "@/lib/server/testing/runner";
import { detectProject } from "@/lib/project/detect";
import { getTemplate } from "@/lib/project/templates";

function load(id: string) {
  const t = getTemplate(id)!;
  const { detection, compiler } = detectProject(t.files);
  return { files: t.files, detection, compiler };
}

describe("compilation engine", () => {
  it("compiles the counter template with real solc", async () => {
    const { files, detection, compiler } = load("counter");
    const out = await compileProject(files, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies });
    expect(out.errors).toEqual([]);
    expect(out.ok).toBe(true);
    expect(out.compilerVersion).toMatch(/^0\.8\.28\+commit\./);
    const counter = out.contracts.find((c) => c.name === "Counter")!;
    expect(counter.bytecode.length).toBeGreaterThan(100);
    expect(counter.abi.find((a) => a.type === "constructor")?.inputs?.[0].type).toBe("uint256");
    // tests are excluded from deployment builds
    expect(out.contracts.find((c) => c.name === "CounterTest")).toBeUndefined();
  });

  it("resolves OpenZeppelin from the npm registry and compiles", async () => {
    const { files, detection, compiler } = load("oz-token");
    const out = await compileProject(files, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies });
    expect(out.errors).toEqual([]);
    expect(out.packages[0].name).toBe("@openzeppelin/contracts");
    expect(out.contracts.map((c) => c.name)).toEqual(["QieToken"]);
  });

  it("reports real compiler errors", async () => {
    const files = [{ path: "contracts/Bad.sol", content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract Bad { function f() public { undefinedThing(); } }\n" }];
    const out = await compileProject(files, { settings: { version: null, optimizer: { enabled: false, runs: 200 }, evmVersion: null, viaIR: false }, remappings: [], dependencies: {} });
    expect(out.ok).toBe(false);
    expect(out.errors[0].type).toBe("DeclarationError");
    expect(out.errors[0].formattedMessage).toContain("contracts/Bad.sol");
  });

  it("reports unresolved imports", async () => {
    const files = [{ path: "contracts/A.sol", content: 'pragma solidity ^0.8.20;\nimport "./Missing.sol";\ncontract A {}' }];
    const out = await compileProject(files, { settings: { version: null, optimizer: { enabled: false, runs: 200 }, evmVersion: null, viaIR: false }, remappings: [], dependencies: {} });
    expect(out.ok).toBe(false);
    expect(out.errors[0].type).toBe("ImportError");
  });
});

describe("test runner", () => {
  it("runs Solidity and node:test suites of the counter template", async () => {
    const { files, detection, compiler } = load("counter");
    const out = await runProjectTests(files, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies, scope: "all" });
    if (out.status !== "passed") console.log(out.output, out.errorMessage);
    expect(out.status).toBe("passed");
    expect(out.tests.filter((t) => t.kind === "solidity").length).toBe(4);
    expect(out.tests.filter((t) => t.kind === "nodejs").length).toBe(2);
  });

  it("reports failing tests with messages", async () => {
    const { files, detection, compiler } = load("counter");
    const broken = files.map((f) => f.path === "contracts/Counter.t.sol" ? { ...f, content: f.content.replace("counter.count() == 11", "counter.count() == 99") } : f);
    const out = await runProjectTests(broken, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies, scope: "solidity" });
    expect(out.status).toBe("failed");
    const failed = out.tests.find((t) => t.status === "failed")!;
    expect(failed.name).toContain("test_Increment");
    expect(failed.error).toContain("count should be 11");
  });

  it("runs OpenZeppelin-based Solidity tests", async () => {
    const { files, detection, compiler } = load("oz-token");
    const out = await runProjectTests(files, { settings: compiler, remappings: detection.remappings, dependencies: detection.dependencies, scope: "solidity" });
    if (out.status !== "passed") console.log(out.output, out.errorMessage);
    expect(out.status).toBe("passed");
    expect(out.passed).toBe(2);
  });
});
