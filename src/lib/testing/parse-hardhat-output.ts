/**
 * Parse Hardhat 3 `hardhat test` console output into structured results.
 *
 * Hardhat 3 prints a mocha-like report for both runners:
 *
 *   Running Solidity tests
 *
 *     contracts/Counter.t.sol:CounterTest
 *       ✔ test_Inc()
 *       1) test_Fails()
 *       ✔ testFuzz_IncBy(uint8) (runs: 256)
 *
 *   Running node:test tests
 *
 *     Counter
 *       ✔ starts at constructor value (12ms)
 *       2) fails on purpose
 *
 *   3 passing (2 solidity, 1 nodejs)
 *   2 failing (1 solidity, 1 nodejs)
 *
 *     1) CounterTest#test_Fails()
 *       Error: intentional failure
 *   ...
 *
 * The raw output is always stored alongside the parsed result.
 */
import type { TestCaseResult } from "../types";

 
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

export interface ParsedTestOutput {
  tests: TestCaseResult[];
  passed: number;
  failed: number;
  skipped: number;
  sawRunner: boolean;
}

export function parseHardhatTestOutput(raw: string): ParsedTestOutput {
  const lines = raw.replace(ANSI, "").replace(/\r/g, "").split("\n");
  const tests: TestCaseResult[] = [];
  const failureIndex = new Map<number, TestCaseResult>();
  let kind: TestCaseResult["kind"] | null = null;
  let suiteStack: { indent: number; name: string }[] = [];
  let sawRunner = false;
  let inFailureDetails = false;
  let currentFailure: { n: number; lines: string[] } | null = null;
  const failureTexts = new Map<number, string>();

  const flushFailure = () => {
    if (currentFailure) failureTexts.set(currentFailure.n, currentFailure.lines.join("\n").trim());
    currentFailure = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Running Solidity tests/.test(trimmed)) {
      kind = "solidity";
      suiteStack = [];
      sawRunner = true;
      inFailureDetails = false;
      continue;
    }
    if (/^Running node:test tests/.test(trimmed) || /^Running Mocha tests/.test(trimmed)) {
      kind = "nodejs";
      suiteStack = [];
      sawRunner = true;
      inFailureDetails = false;
      continue;
    }
    if (/^\d+ (passing|failing|pending|skipped)/.test(trimmed)) {
      if (/failing/.test(trimmed)) inFailureDetails = true;
      continue;
    }

    if (inFailureDetails) {
      if (trimmed === "Test run failed" || trimmed.startsWith("WARNING:")) continue;
      const head = line.match(/^\s{2,4}(\d+)\)\s+(.*)$/);
      if (head) {
        flushFailure();
        currentFailure = { n: Number(head[1]), lines: [head[2]] };
        continue;
      }
      if (currentFailure) currentFailure.lines.push(line.replace(/^\s{0,6}/, ""));
      continue;
    }

    if (!kind || !trimmed) continue;
    const indent = line.length - line.trimStart().length;

    const pass = trimmed.match(/^[✔✓]\s+(.*?)(?:\s+\((\d+)ms\))?$/);
    const fail = trimmed.match(/^(\d+)\)\s+(.*?)(?:\s+\((\d+)ms\))?$/);
    const skip = trimmed.match(/^-\s+(.*)$/);
    if (pass || fail || skip) {
      while (suiteStack.length && suiteStack[suiteStack.length - 1].indent >= indent) suiteStack.pop();
      const suite = suiteStack.map((s) => s.name).join(" › ") || "(root)";
      const name = (pass?.[1] ?? fail?.[2] ?? skip?.[1] ?? "").trim();
      const ms = pass?.[2] ?? fail?.[3];
      const result: TestCaseResult = {
        kind,
        suite,
        name,
        status: pass ? "passed" : fail ? "failed" : "skipped",
        durationMs: ms ? Number(ms) : null,
        error: null,
      };
      tests.push(result);
      if (fail) failureIndex.set(Number(fail[1]), result);
      continue;
    }

    // Anything else inside a runner section at an indentation is a suite heading.
    if (indent >= 2 && !/^(Compiled|Nothing to compile|WARNING|No contracts)/.test(trimmed)) {
      while (suiteStack.length && suiteStack[suiteStack.length - 1].indent >= indent) suiteStack.pop();
      suiteStack.push({ indent, name: trimmed });
    }
  }
  flushFailure();

  for (const [n, text] of failureTexts) {
    const t = failureIndex.get(n);
    if (t) t.error = text.slice(0, 4000);
  }

  return {
    tests,
    passed: tests.filter((t) => t.status === "passed").length,
    failed: tests.filter((t) => t.status === "failed").length,
    skipped: tests.filter((t) => t.status === "skipped").length,
    sawRunner,
  };
}
