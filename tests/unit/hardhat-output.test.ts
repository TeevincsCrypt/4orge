import { describe, expect, it } from "vitest";
import { parseHardhatTestOutput } from "@/lib/testing/parse-hardhat-output";

const SAMPLE = `Compiled 2 Solidity files with solc 0.8.28 (evm target: cancun)

Running Solidity tests

  contracts/Counter.t.sol:CounterTest
    ✔ test_Inc()
    1) test_Fails()
    ✔ testFuzz_IncBy(uint8) (runs: 256)

Running node:test tests

  Counter
    ✔ starts at constructor value (12ms)
    2) fails on purpose


3 passing (2 solidity, 1 nodejs)
2 failing (1 solidity, 1 nodejs)

  1) CounterTest#test_Fails()
    Error: intentional failure
      at CounterTest.test_Fails (contracts/Counter.t.sol:8)


  2) Counter
       fails on purpose:

   AssertionError: Expected values to be strictly equal

Test run failed
`;

describe("Hardhat output parser", () => {
  it("extracts suites, statuses, durations and failure messages", () => {
    const r = parseHardhatTestOutput(SAMPLE);
    expect(r.sawRunner).toBe(true);
    expect(r.passed).toBe(3);
    expect(r.failed).toBe(2);
    expect(r.tests[0]).toMatchObject({ kind: "solidity", suite: "contracts/Counter.t.sol:CounterTest", name: "test_Inc()", status: "passed" });
    expect(r.tests[2].name).toBe("testFuzz_IncBy(uint8) (runs: 256)");
    expect(r.tests[3]).toMatchObject({ kind: "nodejs", suite: "Counter", durationMs: 12 });
    expect(r.tests[1].error).toContain("intentional failure");
    expect(r.tests[4].error).toContain("AssertionError");
    expect(r.tests[4].error).not.toContain("Test run failed");
  });
  it("strips ANSI colours", () => {
    const r = parseHardhatTestOutput("Running Solidity tests\n\n  \u001b[32mA:T\u001b[0m\n    \u001b[32m✔\u001b[0m test_X()\n\n1 passing");
    expect(r.tests).toHaveLength(1);
    expect(r.tests[0].suite).toBe("A:T");
  });
});

describe("Hardhat failure summary", () => {
  it("surfaces the first error line", async () => {
    const { firstError } = await import("@/lib/server/testing/runner");
    const out = "Compiling...\nRuntimeError: memory access out of bounds\n    at wasm://wasm\nError HHE908: A wasm version of solc failed to run.\n";
    expect(firstError(out)).toBe(": RuntimeError: memory access out of bounds.");
    expect(firstError("nothing useful")).toBe(".");
  });
});
