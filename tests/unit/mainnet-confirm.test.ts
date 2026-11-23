import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalStore } from "@/lib/server/store/local";
import { confirmStep } from "@/lib/server/runbook/engine";
import { createRunbookTemplate } from "@/lib/runbook/validate";
import type { StepState } from "@/lib/types";

const dir = mkdtempSync(path.join(os.tmpdir(), "4orge-mainnet-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function executionAtReview(network: "qie-mainnet" | "qie-testnet") {
  const store = new LocalStore("owner", dir);
  const project = await store.insert("projects", {
    name: "p", description: "", source: "blank",
    compiler: { version: null, optimizer: { enabled: false, runs: 200 }, evmVersion: null, viaIR: false },
    detection: { framework: "plain", configFile: null, sourceDirs: [], testFiles: { solidity: [], nodejs: [] }, contracts: [], pragmas: [], dependencies: {}, remappings: [], notes: [] },
    lastBuildId: null, lastTestRunId: null,
  });
  const definition = createRunbookTemplate("full-deploy", { name: "d", contract: "Counter", network });
  const runbook = await store.insert("runbooks", { projectId: project.id, name: "d", description: "", definition, lastExecutionId: null });
  // Every step before the review has succeeded; the review step is waiting.
  const steps: StepState[] = definition.steps.map((s) => {
    const before = definition.steps.findIndex((x) => x.uses === "human.confirm") > definition.steps.indexOf(s);
    return { stepId: s.id, uses: s.uses, status: s.uses === "human.confirm" ? "waiting" : before ? "succeeded" : "pending", startedAt: null, finishedAt: null, summary: null, error: null, output: null, attempts: 1 };
  });
  const execution = await store.insert("runbook_executions", {
    runbookId: runbook.id, projectId: project.id, runbookName: "d", network, status: "awaiting_confirmation", definition, steps,
    context: { deployer: null, buildId: null, testRunId: null, contractName: null, constructorArgs: null, prepared: null, txHash: null, deploymentId: null, contractAddress: null, confirmedBy: null, report: null },
    finishedAt: null,
  });
  return { store, execution };
}

describe("typed confirmation for Mainnet", () => {
  it("refuses to confirm a Mainnet deployment without typing MAINNET", async () => {
    const { store, execution } = await executionAtReview("qie-mainnet");
    await expect(confirmStep(store, "me", execution.id, "confirm")).rejects.toThrow(/Type MAINNET/);
    await expect(confirmStep(store, "me", execution.id, "confirm", "mainnet")).rejects.toThrow(/Type MAINNET/);
    const after = await store.get("runbook_executions", execution.id);
    expect(after?.steps.find((s) => s.stepId === "confirm")?.status).toBe("waiting");
  });
  it("accepts the exact phrase and moves on to the wallet step", async () => {
    const { store, execution } = await executionAtReview("qie-mainnet");
    const next = await confirmStep(store, "me", execution.id, "confirm", "MAINNET");
    expect(next.steps.find((s) => s.stepId === "confirm")?.status).toBe("succeeded");
    expect(next.status).toBe("awaiting_wallet");
  });
  it("needs no phrase on Testnet", async () => {
    const { store, execution } = await executionAtReview("qie-testnet");
    const next = await confirmStep(store, "me", execution.id, "confirm");
    expect(next.status).toBe("awaiting_wallet");
  });
});
