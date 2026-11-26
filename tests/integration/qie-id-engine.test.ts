import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { LocalStore } from "@/lib/server/store/local";
import { createProject } from "@/lib/server/services/projects";
import { advanceExecution, retryStep } from "@/lib/server/runbook/engine";
import type { RunbookDefinition } from "@/lib/runbook/schema";
import type { StepState } from "@/lib/types";

const dir = mkdtempSync(path.join(os.tmpdir(), "4orge-qieid-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

const ALICE = "0x172083F7f31f82e4B57bA8aCf9822C72BB35b174";
const MALLORY = "0x000000000000000000000000000000000000bEEF";
const MCP = "https://mcp.qie.digital/mcp";

/** Simulates QIE's resolver; `book` can be changed between calls (a name being repointed). */
function fakeResolver(book: Record<string, string | null>, opts: { offline?: boolean } = {}) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== MCP) {
      // Keep the chain unreachable when asked, so the test never depends on QIE RPC.
      if (opts.offline) throw new TypeError("fetch failed (offline in test)");
      return real(input, init);
    }
    const name = JSON.parse(String(init!.body)).params.arguments.name as string;
    calls.push(name);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: { name, address: book[name] ?? null } } }));
  });
  return calls;
}

async function execution(args: unknown[], extra: { prepare?: boolean } = {}) {
  const store = new LocalStore("owner", dir);
  const { project } = await createProject(store, {
    name: "owned",
    source: "blank",
    files: [{ path: "contracts/Owned.sol", content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\ncontract Owned {\n    address public owner;\n    constructor(address owner_) { owner = owner_; }\n}\n" }],
  });
  const definition: RunbookDefinition = {
    schema: "4orge.runbook/v1",
    name: "Deploy Owned",
    network: "qie-mainnet",
    target: { contract: "Owned", source: "contracts/Owned.sol", constructorArgs: args },
    steps: [
      { id: "load", uses: "project.load" },
      { id: "compile", uses: "contracts.compile" },
      { id: "args", uses: "deploy.validate-args" },
      ...(extra.prepare ? [{ id: "prepare", uses: "deploy.prepare" }] : []),
    ],
  } as RunbookDefinition;
  const runbook = await store.insert("runbooks", { projectId: project.id, name: "d", description: "", definition, lastExecutionId: null });
  const steps: StepState[] = definition.steps.map((s) => ({ stepId: s.id, uses: s.uses, status: "pending", startedAt: null, finishedAt: null, summary: null, error: null, output: null, attempts: 0 }));
  const exec = await store.insert("runbook_executions", {
    runbookId: runbook.id, projectId: project.id, runbookName: "d", network: "qie-mainnet", status: "running", definition, steps,
    context: { deployer: extra.prepare ? ALICE : null, buildId: null, testRunId: null, contractName: null, constructorArgs: null, qieNames: null, prepared: null, txHash: null, deploymentId: null, contractAddress: null, confirmedBy: null, report: null },
    finishedAt: null,
  });
  return { store, id: exec.id };
}

describe("QIE IDs in a deployment Runbook", () => {
  it("resolves the name once, pins the address and shows both", async () => {
    const calls = fakeResolver({ "alice.qie": ALICE.toLowerCase() });
    const { store, id } = await execution(["Alice.qie"]);
    const done = await advanceExecution(store, "me", id);
    const step = done.steps.find((s) => s.stepId === "args")!;
    expect(step.status).toBe("succeeded");
    expect(step.summary).toContain(`alice.qie → ${ALICE}`);
    expect(done.context.qieNames).toEqual({ "alice.qie": ALICE });
    expect(done.context.constructorArgs).toEqual([ALICE]);
    expect(calls).toEqual(["alice.qie"]);
  });

  it("fails clearly when the name is not registered", async () => {
    fakeResolver({});
    const { store, id } = await execution(["ghost.qie"]);
    const done = await advanceExecution(store, "me", id);
    const step = done.steps.find((s) => s.stepId === "args")!;
    expect(step.status).toBe("failed");
    expect(step.summary).toBe("ghost.qie is not registered on QIE Mainnet.");
    expect(done.context.qieNames ?? null).toBeNull();
  });

  it("looks the name up again on retry, so a repointed name is noticed before signing", async () => {
    const book: Record<string, string | null> = { "shop.qie": null };
    fakeResolver(book);
    const { store, id } = await execution(["shop.qie"]);
    const failed = await advanceExecution(store, "me", id);
    expect(failed.steps.find((s) => s.stepId === "args")!.status).toBe("failed");
    book["shop.qie"] = MALLORY;
    await retryStep(store, "me", id, "args");
    const done = await advanceExecution(store, "me", id);
    expect(done.context.qieNames).toEqual({ "shop.qie": MALLORY });
    expect(done.steps.find((s) => s.stepId === "args")!.summary).toContain(MALLORY);
  });

  it("prepares from the pinned address and never looks the name up again", async () => {
    const calls = fakeResolver({ "alice.qie": ALICE }, { offline: true });
    const { store, id } = await execution(["alice.qie"], { prepare: true });
    const spy = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    const done = await advanceExecution(store, "me", id);
    expect(done.steps.find((s) => s.stepId === "args")!.status).toBe("succeeded");
    const prepare = done.steps.find((s) => s.stepId === "prepare")!;
    // The chain is offline here, so Prepare stops at the RPC, not at argument parsing.
    expect(prepare.status).toBe("failed");
    expect(prepare.error ?? "").not.toContain("resolved");
    // Exactly one lookup, in Validate; Prepare used the pinned address.
    expect(calls).toEqual(["alice.qie"]);
    expect(spy.mock.calls.filter(([u]) => String(u) === MCP)).toHaveLength(1);
  });
});

