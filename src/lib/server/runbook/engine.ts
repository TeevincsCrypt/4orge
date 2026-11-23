import "server-only";
import { formatEther, isAddress, isHash } from "viem";
import { parseConstructorArgs, toJsonSafe } from "@/lib/abi-args";
import { explorerAddressUrl, explorerTxUrl, getNetwork, isDeploymentAllowed, type NetworkId } from "@/lib/networks";
import { parsePragmas } from "@/lib/project/detect";
import type { RunbookDefinition, RunbookStep } from "@/lib/runbook/schema";
import { STEP_SPECS, type StepType } from "@/lib/runbook/steps";
import type {
  ExecutionContext,
  ExecutionStatus,
  LogLevel,
  Project,
  Runbook,
  RunbookExecution,
  StepState,
  StepStatus,
} from "@/lib/types";
import { checkDeploymentReceipt, checkNetwork, prepareDeployment, shortError } from "../chain";
import { isDeployableSource } from "../compiler/dependencies";
import { availableCompilerVersions, chooseVersion } from "../compiler/solc-versions";
import { getConfig } from "../config";
import { badRequest, conflict, HttpError, notFound } from "../http";
import { compileAndRecord, getProjectFiles, testAndRecord } from "../services/projects";
import { getUserSettings } from "../services/settings";
import type { DataStore } from "../store/types";
import { verifyDeployment } from "../verify";

const TERMINAL: StepStatus[] = ["succeeded", "warning", "skipped"];
const REQUEST_BUDGET_MS = 45_000;

interface StepResult {
  status: Extract<StepStatus, "succeeded" | "warning" | "failed" | "waiting">;
  summary: string;
  error?: string;
  output?: Record<string, unknown>;
  context?: Partial<ExecutionContext>;
}

interface RunEnv {
  store: DataStore;
  userLabel: string;
  execution: RunbookExecution;
  project: Project;
  step: RunbookStep;
  state: StepState;
  rpcOverride: string | null;
  log: (level: LogLevel, message: string, data?: Record<string, unknown>) => Promise<void>;
}

// Per-execution in-process lock so double clicks cannot run a step twice.
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  while (locks.has(id)) await locks.get(id)!.catch(() => undefined);
  const p = fn();
  locks.set(id, p);
  try {
    return await p;
  } finally {
    locks.delete(id);
  }
}

function emptyContext(): ExecutionContext {
  return {
    deployer: null,
    buildId: null,
    testRunId: null,
    contractName: null,
    constructorArgs: null,
    prepared: null,
    txHash: null,
    deploymentId: null,
    contractAddress: null,
    confirmedBy: null,
    report: null,
  };
}

async function writeLog(store: DataStore, executionId: string, stepId: string | null, level: LogLevel, message: string, data?: Record<string, unknown>) {
  await store.insert("execution_logs", {
    executionId,
    stepId,
    level,
    message,
    data: data ? (toJsonSafe(data) as Record<string, unknown>) : null,
  });
}

export async function getExecution(store: DataStore, id: string): Promise<RunbookExecution> {
  const e = await store.get("runbook_executions", id);
  if (!e) throw notFound("Execution");
  return e;
}

export async function startExecution(
  store: DataStore,
  runbook: Runbook,
  opts: { network?: NetworkId; deployer?: string | null; constructorArgs?: unknown[] },
): Promise<RunbookExecution> {
  const def: RunbookDefinition = structuredClone(runbook.definition);
  if (opts.network) def.network = opts.network;
  if (opts.constructorArgs && def.target) def.target.constructorArgs = opts.constructorArgs;
  if (opts.deployer && !isAddress(opts.deployer)) throw badRequest("deployer must be a 0x address.");

  const execution = await store.insert("runbook_executions", {
    runbookId: runbook.id,
    projectId: runbook.projectId,
    runbookName: runbook.name,
    network: def.network,
    status: "running",
    definition: def,
    steps: def.steps.map((s) => ({
      stepId: s.id,
      uses: s.uses,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      summary: null,
      error: null,
      output: null,
      attempts: 0,
    })),
    context: { ...emptyContext(), deployer: (opts.deployer as `0x${string}`) ?? null },
    finishedAt: null,
  });
  await store.update("runbooks", runbook.id, { lastExecutionId: execution.id });
  await writeLog(store, execution.id, null, "info", `Execution of “${runbook.name}” started on ${getNetwork(def.network).name}.`);
  return execution;
}

function deriveStatus(steps: StepState[], def: RunbookDefinition): ExecutionStatus {
  if (steps.some((s) => s.status === "failed")) return "failed";
  const next = steps.find((s) => !TERMINAL.includes(s.status));
  if (!next) return "succeeded";
  if (next.status === "waiting") {
    const cat = STEP_SPECS[next.uses as StepType].category;
    if (cat === "human") return "awaiting_confirmation";
    if (cat === "wallet") return "awaiting_wallet";
  }
  void def;
  return "running";
}

async function save(store: DataStore, execution: RunbookExecution): Promise<RunbookExecution> {
  const status = execution.status === "cancelled" ? "cancelled" : deriveStatus(execution.steps, execution.definition);
  const finished = status === "succeeded" || status === "failed" || status === "cancelled";
  return store.update("runbook_executions", execution.id, {
    steps: execution.steps,
    context: execution.context,
    status,
    finishedAt: finished ? (execution.finishedAt ?? new Date().toISOString()) : null,
  });
}

/** Run server-side steps until one needs the user, needs time, or fails. */
export async function advanceExecution(
  store: DataStore,
  userLabel: string,
  executionId: string,
  opts: { deployer?: string | null } = {},
): Promise<RunbookExecution> {
  return withLock(executionId, async () => {
    let execution = await getExecution(store, executionId);
    if (["succeeded", "failed", "cancelled"].includes(execution.status)) return execution;

    if (opts.deployer) {
      if (!isAddress(opts.deployer)) throw badRequest("deployer must be a 0x address.");
      const prepareDone = execution.steps.some((s) => s.uses === "deploy.prepare" && TERMINAL.includes(s.status));
      if (!prepareDone && execution.context.deployer?.toLowerCase() !== opts.deployer.toLowerCase()) {
        execution.context.deployer = opts.deployer as `0x${string}`;
      }
    }

    const project = execution.projectId ? await store.get("projects", execution.projectId) : null;
    if (!project) throw new HttpError(410, "project_gone", "The project for this execution was deleted.");
    const settings = await getUserSettings(store);
    const rpcOverride = settings.rpcOverrides[execution.network] ?? null;
    const started = Date.now();

    while (Date.now() - started < REQUEST_BUDGET_MS) {
      const index = execution.steps.findIndex((s) => !TERMINAL.includes(s.status));
      if (index === -1) break;
      const state = execution.steps[index];
      const step = execution.definition.steps[index];
      const spec = STEP_SPECS[step.uses];
      if (state.status === "failed") break;

      if (spec.category === "human" || spec.category === "wallet") {
        if (state.status === "pending") {
          state.status = "waiting";
          state.startedAt = new Date().toISOString();
          state.attempts += 1;
          state.summary = spec.category === "human" ? "Waiting for your confirmation." : "Waiting for wallet signature.";
          await writeLog(store, execution.id, step.id, "info", state.summary);
        }
        break;
      }

      if (state.status === "pending") {
        state.status = "running";
        state.startedAt = new Date().toISOString();
        state.attempts += 1;
        execution = await save(store, execution);
        await writeLog(store, execution.id, step.id, "info", `▶ ${spec.title}`);
      }

      const env: RunEnv = {
        store,
        userLabel,
        execution,
        project,
        step,
        state: execution.steps[index],
        rpcOverride,
        log: (level, message, data) => writeLog(store, execution.id, step.id, level, message, data),
      };
      let result: StepResult;
      try {
        result = await EXECUTORS[step.uses](env);
      } catch (e) {
        result = { status: "failed", summary: "Step crashed.", error: e instanceof HttpError ? e.message : shortError(e) };
      }

      const s = execution.steps[index];
      if (result.context) Object.assign(execution.context, result.context);
      s.summary = result.summary;
      s.output = result.output ? (toJsonSafe(result.output) as Record<string, unknown>) : s.output;
      if (result.status === "waiting") {
        s.status = "running";
        execution = await save(store, execution);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      s.status = result.status;
      s.error = result.error ?? null;
      s.finishedAt = new Date().toISOString();
      const level: LogLevel = result.status === "failed" ? "error" : result.status === "warning" ? "warn" : "info";
      await writeLog(store, execution.id, step.id, level, result.error ? `${result.summary} ${result.error}` : result.summary);
      execution = await save(store, execution);
      if (result.status === "failed") break;
    }

    execution = await save(store, execution);
    if (execution.status === "succeeded") {
      await writeLog(store, execution.id, null, "info", "✔ Execution completed.");
    } else if (execution.status === "failed") {
      await writeLog(store, execution.id, null, "error", "✖ Execution stopped at a failed step.");
    }
    return execution;
  });
}

/** Phrase the operator must type to confirm a deployment that spends real funds. */
export const MAINNET_CONFIRM_PHRASE = "MAINNET";

export async function confirmStep(store: DataStore, userLabel: string, executionId: string, stepId: string, typed?: string) {
  await withLock(executionId, async () => {
    const execution = await getExecution(store, executionId);
    const state = execution.steps.find((s) => s.stepId === stepId);
    if (!state || state.uses !== "human.confirm") throw badRequest("That step is not a human confirmation step.");
    if (state.status !== "waiting") throw conflict("This step is not waiting for confirmation.");
    if (getNetwork(execution.network).kind === "mainnet" && (typed ?? "").trim() !== MAINNET_CONFIRM_PHRASE) {
      throw badRequest(`This deployment spends real QIE on Mainnet. Type ${MAINNET_CONFIRM_PHRASE} to confirm.`);
    }
    state.status = "succeeded";
    state.finishedAt = new Date().toISOString();
    state.summary = getNetwork(execution.network).kind === "mainnet" ? `Mainnet deployment confirmed by ${userLabel} (typed confirmation).` : `Confirmed by ${userLabel}.`;
    execution.context.confirmedBy = userLabel;
    await writeLog(store, execution.id, stepId, "info", state.summary);
    await save(store, execution);
  });
  return advanceExecution(store, userLabel, executionId);
}

export async function submitWalletResult(
  store: DataStore,
  userLabel: string,
  executionId: string,
  input: { stepId: string; txHash?: string; from?: string; error?: { code?: number; message: string } },
) {
  await withLock(executionId, async () => {
    const execution = await getExecution(store, executionId);
    const state = execution.steps.find((s) => s.stepId === input.stepId);
    if (!state || state.uses !== "wallet.deploy") throw badRequest("That step is not a wallet step.");
    if (state.status !== "waiting") throw conflict("This step is not waiting for a wallet signature.");
    const prepared = execution.context.prepared;
    if (!prepared) throw conflict("No prepared transaction exists for this execution.");

    if (input.error) {
      const rejected = input.error.code === 4001 || /reject|denied|cancel/i.test(input.error.message);
      state.status = "failed";
      state.finishedAt = new Date().toISOString();
      state.summary = rejected ? "You rejected the transaction in your wallet." : "The wallet could not send the transaction.";
      state.error = input.error.message.slice(0, 500);
      await writeLog(store, execution.id, input.stepId, "error", `${state.summary} ${state.error}`);
      await save(store, execution);
      return;
    }

    if (!input.txHash || !isHash(input.txHash)) throw badRequest("txHash must be a 32-byte 0x hash.");
    if (!input.from || input.from.toLowerCase() !== prepared.from.toLowerCase()) {
      throw badRequest(`The transaction must be sent from the approved deployer ${prepared.from}.`);
    }
    const network = getNetwork(execution.network);
    // Record immediately as "pending" so a broadcast transaction is never lost.
    const deployment = await store.insert("deployments", {
      projectId: execution.projectId!,
      executionId: execution.id,
      buildId: prepared.buildId,
      contractName: prepared.contractName,
      sourcePath: prepared.sourcePath,
      network: network.id,
      chainId: network.chainId,
      deployerAddress: prepared.from,
      contractAddress: null,
      txHash: input.txHash as `0x${string}`,
      blockNumber: null,
      gasUsed: null,
      effectiveGasPrice: null,
      status: "pending",
      failureReason: null,
      verificationStatus: "unverified",
      verificationMessage: null,
      compilerVersion: (await store.get("builds", prepared.buildId))?.compilerVersion ?? "unknown",
      constructorArgs: prepared.constructorArgs,
      constructorArgsEncoded: prepared.constructorArgsEncoded,
      confirmedAt: null,
    });
    execution.context.txHash = input.txHash as `0x${string}`;
    execution.context.deploymentId = deployment.id;
    state.status = "succeeded";
    state.finishedAt = new Date().toISOString();
    state.summary = `Signed by ${prepared.from} and broadcast.`;
    state.output = { txHash: input.txHash, explorer: explorerTxUrl(network, input.txHash) };
    await writeLog(store, execution.id, input.stepId, "info", `Transaction broadcast: ${input.txHash}`);
    await save(store, execution);
  });
  return advanceExecution(store, userLabel, executionId);
}

export async function retryStep(store: DataStore, userLabel: string, executionId: string, stepId: string) {
  await withLock(executionId, async () => {
    const execution = await getExecution(store, executionId);
    const index = execution.steps.findIndex((s) => s.stepId === stepId);
    if (index === -1) throw notFound("Step");
    const state = execution.steps[index];
    if (state.status !== "failed") throw conflict("Only failed steps can be retried.");
    if (!STEP_SPECS[state.uses as StepType].retryable) throw conflict("This step cannot be retried.");
    if (state.uses === "wallet.deploy" && execution.context.txHash) {
      throw conflict("A transaction was already broadcast for this execution; start a new execution instead.");
    }
    for (let i = index; i < execution.steps.length; i++) {
      Object.assign(execution.steps[i], { status: "pending", startedAt: null, finishedAt: null, error: null, summary: null });
    }
    execution.status = "running";
    execution.finishedAt = null;
    await writeLog(store, execution.id, stepId, "info", `↻ Retrying “${STEP_SPECS[state.uses as StepType].title}”.`);
    await save(store, execution);
  });
  return advanceExecution(store, userLabel, executionId);
}

export async function cancelExecution(store: DataStore, executionId: string) {
  return withLock(executionId, async () => {
    const execution = await getExecution(store, executionId);
    if (["succeeded", "failed", "cancelled"].includes(execution.status)) return execution;
    if (execution.context.txHash) {
      throw conflict("A transaction was already broadcast; the execution must finish confirming it.");
    }
    for (const s of execution.steps) if (!TERMINAL.includes(s.status) && s.status !== "failed") s.status = "skipped";
    execution.status = "cancelled";
    await writeLog(store, execution.id, null, "warn", "Execution cancelled by user.");
    return save(store, execution);
  });
}

// ---------------------------------------------------------------------------
// Step executors (server-side only; wallet/human steps never reach here)
// ---------------------------------------------------------------------------

type Executor = (env: RunEnv) => Promise<StepResult>;

const notServer: Executor = async () => ({ status: "failed", summary: "This step runs in the browser.", error: "Invalid engine state." });

const EXECUTORS: Record<StepType, Executor> = {
  "project.load": async ({ store, project }) => {
    const files = await getProjectFiles(store, project.id);
    const sol = files.filter((f) => f.path.endsWith(".sol"));
    return {
      status: "succeeded",
      summary: `Loaded ${files.length} files (${sol.length} Solidity) · framework: ${project.detection.framework}.`,
      output: {
        files: files.length,
        solidity: sol.length,
        framework: project.detection.framework,
        contracts: project.detection.contracts.filter((c) => c.kind === "contract").map((c) => c.name),
      },
    };
  },

  "project.validate": async ({ store, project, execution, log }) => {
    const files = await getProjectFiles(store, project.id);
    const problems: string[] = [];
    const deployable = files.filter((f) => isDeployableSource(f.path));
    if (!deployable.length) problems.push("No deployable Solidity sources (tests and scripts are excluded).");
    const target = execution.definition.target;
    if (target) {
      const candidates = project.detection.contracts.filter(
        (c) => c.name === target.contract && (!target.source || c.path === target.source),
      );
      if (!candidates.length) problems.push(`Target contract “${target.contract}” was not found in the project sources.`);
      else if (candidates.every((c) => c.kind !== "contract")) problems.push(`“${target.contract}” is ${candidates[0].kind === "abstract" ? "abstract" : `a ${candidates[0].kind}`} and cannot be deployed.`);
      else if (candidates.length > 1) problems.push(`Several contracts are named “${target.contract}”; set target.source to choose one.`);
    }
    const pragmas = [...new Set(deployable.flatMap((f) => parsePragmas(f.content)))];
    const { versions, offline } = await availableCompilerVersions();
    const choice = chooseVersion(pragmas, versions, project.compiler.version);
    if (!choice.ok) problems.push(choice.error);
    for (const note of project.detection.notes) await log("warn", note);
    if (problems.length) return { status: "failed", summary: "Configuration is invalid.", error: problems.join(" ") };
    return {
      status: offline ? "warning" : "succeeded",
      summary: `Configuration valid · solc ${choice.ok ? choice.version : "?"}${project.compiler.optimizer.enabled ? ` · optimizer ${project.compiler.optimizer.runs} runs` : ""}${offline ? " · compiler list offline" : ""}.`,
      output: { pragmas, compiler: choice.ok ? choice.version : null },
    };
  },

  "network.check": async ({ execution, rpcOverride }) => {
    const network = getNetwork(execution.network);
    const check = await checkNetwork(execution.network, rpcOverride);
    const deploys = execution.definition.steps.some((s) => s.uses === "wallet.deploy");
    if (!check.ok) return { status: "failed", summary: `${network.name} check failed.`, error: check.error ?? undefined, output: { ...check } };
    if (deploys && !isDeploymentAllowed(network, getConfig().networkFlags)) {
      return {
        status: "failed",
        summary: `Deployments to ${network.name} are locked on this server.`,
        error:
          network.kind === "mainnet"
            ? "Mainnet deployments require the server owner to set FORGE_ENABLE_MAINNET_DEPLOYMENTS=true deliberately."
            : "This network is not enabled for deployments.",
        output: { ...check },
      };
    }
    return {
      status: "succeeded",
      summary: `${network.name} reachable · chain ID ${check.actualChainId} verified · block ${check.blockNumber} · ${check.latencyMs} ms.`,
      output: { ...check },
    };
  },

  "contracts.compile": async ({ store, project, log }) => {
    const fresh = (await store.get("projects", project.id))!;
    const { build, contracts, notes } = await compileAndRecord(store, fresh);
    for (const n of notes) await log("info", n);
    for (const w of build.warnings.slice(0, 20)) await log("warn", w.formattedMessage);
    if (build.status === "failed") {
      for (const e of build.errors.slice(0, 20)) await log("error", e.formattedMessage);
      return {
        status: "failed",
        summary: `Compilation failed with ${build.errors.length} error(s).`,
        error: build.errors[0]?.message,
        output: { buildId: build.id },
      };
    }
    return {
      status: build.warnings.some((w) => w.severity === "warning") ? "warning" : "succeeded",
      summary: `Compiled ${build.sourceCount} sources → ${contracts.length} contracts with solc ${build.compilerVersion} in ${build.durationMs} ms${build.warnings.length ? ` (${build.warnings.length} warnings)` : ""}.`,
      output: { buildId: build.id, contracts: contracts.map((c) => c.name) },
      context: { buildId: build.id },
    };
  },

  "contracts.test": async ({ store, project, step }) => {
    const opts = (step.uses === "contracts.test" ? step.with : undefined) ?? { scope: "all" as const, required: true };
    const scope = opts.scope ?? "all";
    const required = opts.required ?? true;
    const run = await testAndRecord(store, project, scope);
    const counts = `${run.passed} passed, ${run.failed} failed${run.skipped ? `, ${run.skipped} skipped` : ""}`;
    const output = { testRunId: run.id, passed: run.passed, failed: run.failed, status: run.status };
    if (run.status === "passed") {
      return { status: "succeeded", summary: `All tests passed (${counts}) in ${(run.durationMs / 1000).toFixed(1)} s.`, output, context: { testRunId: run.id } };
    }
    if (run.status === "no-tests") {
      return { status: "warning", summary: run.errorMessage ?? "No tests found.", output, context: { testRunId: run.id } };
    }
    const failedNames = run.tests.filter((t) => t.status === "failed").map((t) => t.name).slice(0, 5).join(", ");
    const error = run.errorMessage ?? `Failing: ${failedNames}`;
    if (!required) return { status: "warning", summary: `Tests failed (${counts}) — marked optional, continuing.`, error, output, context: { testRunId: run.id } };
    return { status: "failed", summary: `Tests did not pass (${counts}). Deployment is blocked.`, error, output, context: { testRunId: run.id } };
  },

  "deploy.validate-args": async ({ store, execution, project }) => {
    const target = execution.definition.target!;
    const buildId = execution.context.buildId ?? project.lastBuildId;
    if (!buildId) return { status: "failed", summary: "No successful build to deploy from.", error: "Run a compile step first." };
    const contracts = await store.list("contracts", { where: { buildId } });
    const artifact = contracts.find((c) => c.name === target.contract && (!target.source || c.sourcePath === target.source));
    if (!artifact) return { status: "failed", summary: `“${target.contract}” is not in build ${buildId.slice(0, 8)}.`, error: "Check the target contract name." };
    const parsed = parseConstructorArgs(artifact.abi, target.constructorArgs);
    if (!parsed.ok) {
      return {
        status: "failed",
        summary: "Constructor arguments are invalid.",
        error: parsed.errors.map((e) => `${e.name}: ${e.message}`).join(" · "),
      };
    }
    const shown = parsed.values.map((v) => String(toJsonSafe(v))).join(", ");
    return {
      status: "succeeded",
      summary: `${artifact.name}(${shown}) — ${parsed.values.length} argument(s) type-checked.`,
      output: { contract: artifact.fullyQualifiedName, args: toJsonSafe(parsed.values) as unknown[] },
      context: { contractName: artifact.name, constructorArgs: toJsonSafe(parsed.values) as unknown[], buildId },
    };
  },

  "deploy.prepare": async ({ store, execution, rpcOverride, log }) => {
    const deployer = execution.context.deployer;
    if (!deployer) return { status: "failed", summary: "No deployer wallet connected.", error: "Connect a wallet and retry this step." };
    const target = execution.definition.target!;
    const buildId = execution.context.buildId!;
    const artifact = (await store.list("contracts", { where: { buildId } })).find(
      (c) => c.name === target.contract && (!target.source || c.sourcePath === target.source),
    );
    if (!artifact) return { status: "failed", summary: "Compiled artifact not found.", error: "Re-run compilation." };
    const parsed = parseConstructorArgs(artifact.abi, target.constructorArgs);
    if (!parsed.ok) return { status: "failed", summary: "Constructor arguments are invalid.", error: parsed.errors[0].message };
    const network = getNetwork(execution.network);
    try {
      const { prepared, warnings } = await prepareDeployment({
        networkId: execution.network,
        rpcOverride,
        artifact,
        args: parsed.values,
        argsJson: toJsonSafe(parsed.values) as unknown[],
        deployer,
      });
      for (const w of warnings) await log("warn", w);
      const cost = prepared.estimatedCostWei ? `${formatEther(BigInt(prepared.estimatedCostWei))} ${network.nativeCurrency.symbol}` : "unknown";
      return {
        status: warnings.length ? "warning" : "succeeded",
        summary: `Transaction prepared · gas limit ${prepared.gas} · max cost ≈ ${cost}.`,
        output: { gas: prepared.gas, estimatedCostWei: prepared.estimatedCostWei, balanceWei: prepared.balanceWei, dataBytes: (prepared.data.length - 2) / 2 },
        context: { prepared },
      };
    } catch (e) {
      return { status: "failed", summary: "Could not prepare the deployment.", error: shortError(e) };
    }
  },

  "human.confirm": notServer,
  "wallet.deploy": notServer,

  "tx.confirm": async ({ store, execution, step, state, rpcOverride }) => {
    const opts = (step.uses === "tx.confirm" ? step.with : undefined) ?? { confirmations: 1, timeoutSeconds: 300 };
    const confirmations = opts.confirmations ?? 1;
    const timeoutSeconds = opts.timeoutSeconds ?? 300;
    const { txHash, prepared, deploymentId } = execution.context;
    if (!txHash || !prepared) return { status: "failed", summary: "No broadcast transaction to confirm." };
    const artifact = (await store.list("contracts", { where: { buildId: prepared.buildId } })).find(
      (c) => c.name === prepared.contractName && c.sourcePath === prepared.sourcePath,
    );
    let check;
    try {
      check = await checkDeploymentReceipt({
        networkId: execution.network,
        rpcOverride,
        txHash,
        expectedFrom: prepared.from,
        expectedData: prepared.data,
        expectedRuntimeSize: artifact?.bytecodeSize ?? 0,
        confirmations,
      });
    } catch (e) {
      check = { state: "pending" as const, message: `RPC error: ${shortError(e)}` };
    }
    if (check.state === "pending") {
      const elapsed = (Date.now() - new Date(state.startedAt ?? Date.now()).getTime()) / 1000;
      if (elapsed > timeoutSeconds) {
        return {
          status: "failed",
          summary: `Not confirmed within ${timeoutSeconds} s.`,
          error: `${check.message} The transaction may still be mined — retry this step to keep waiting.`,
        };
      }
      return { status: "waiting", summary: check.message };
    }
    if (check.state === "failed") {
      if (deploymentId) {
        await store.update("deployments", deploymentId, {
          status: "failed",
          failureReason: check.reason,
          blockNumber: check.blockNumber?.toString() ?? null,
          gasUsed: check.gasUsed?.toString() ?? null,
        });
      }
      return { status: "failed", summary: "Deployment failed on-chain.", error: check.reason };
    }
    return {
      status: check.warnings.length ? "warning" : "succeeded",
      summary: `Confirmed in block ${check.blockNumber} → ${check.contractAddress}${check.warnings.length ? ` (${check.warnings.join(" ")})` : ""}.`,
      output: {
        contractAddress: check.contractAddress,
        blockNumber: check.blockNumber.toString(),
        gasUsed: check.gasUsed.toString(),
        effectiveGasPrice: check.effectiveGasPrice?.toString() ?? null,
        confirmations: check.confirmations.toString(),
        checks: check.checks,
      },
      context: { contractAddress: check.contractAddress },
    };
  },

  "deployment.record": async ({ store, execution }) => {
    const confirm = execution.steps.find((s) => s.uses === "tx.confirm");
    const out = confirm?.output as { contractAddress: `0x${string}`; blockNumber: string; gasUsed: string; effectiveGasPrice: string | null } | null;
    if (!execution.context.deploymentId || !out) return { status: "failed", summary: "Nothing to record." };
    const d = await store.update("deployments", execution.context.deploymentId, {
      status: "confirmed",
      contractAddress: out.contractAddress,
      blockNumber: out.blockNumber,
      gasUsed: out.gasUsed,
      effectiveGasPrice: out.effectiveGasPrice,
      confirmedAt: new Date().toISOString(),
    });
    const network = getNetwork(execution.network);
    return {
      status: "succeeded",
      summary: `Saved to deployment history (${d.contractName} @ ${d.contractAddress}).`,
      output: { deploymentId: d.id, explorer: explorerAddressUrl(network, d.contractAddress!) },
    };
  },

  "contract.verify": async ({ store, execution, step }) => {
    const required = (step.uses === "contract.verify" ? step.with?.required : undefined) ?? false;
    const id = execution.context.deploymentId;
    const deployment = id ? await store.get("deployments", id) : null;
    if (!deployment) return { status: "failed", summary: "No deployment to verify." };
    const build = await store.get("builds", deployment.buildId);
    const result = await verifyDeployment(deployment, build);
    await store.update("deployments", deployment.id, { verificationStatus: result.status, verificationMessage: result.message });
    if (result.status === "verified") return { status: "succeeded", summary: result.message };
    if (!required) return { status: "warning", summary: `Not verified: ${result.message}` };
    return { status: "failed", summary: "Verification did not complete.", error: result.message };
  },

  "report.generate": async ({ store, execution, project }) => {
    const fresh = await getExecution(store, execution.id);
    const network = getNetwork(fresh.network);
    const lines = [
      `# 4ORGE execution report`,
      ``,
      `- **Runbook:** ${fresh.runbookName}`,
      `- **Project:** ${project.name}`,
      `- **Network:** ${network.name} (chain ${network.chainId})`,
      `- **Started:** ${fresh.createdAt}`,
      `- **Generated:** ${new Date().toISOString()}`,
      ``,
      `## Steps`,
      ``,
      `| # | Step | Status | Summary |`,
      `|---|------|--------|---------|`,
      ...fresh.steps.map(
        (s, i) =>
          `| ${i + 1} | ${STEP_SPECS[s.uses as StepType].title} | ${s.status === "running" ? "this step" : s.status} | ${(s.summary ?? "").replace(/\|/g, "\\|")}${s.error ? ` — ${s.error.replace(/\|/g, "\\|")}` : ""} |`,
      ),
    ];
    const ctx = fresh.context;
    if (ctx.txHash) {
      lines.push(``, `## Deployment`, ``);
      lines.push(`- **Contract:** ${ctx.prepared?.contractName ?? "?"} (${ctx.prepared?.sourcePath ?? ""})`);
      lines.push(`- **Deployer:** ${ctx.prepared?.from ?? "?"}`);
      lines.push(`- **Transaction:** ${ctx.txHash}${explorerTxUrl(network, ctx.txHash) ? ` — ${explorerTxUrl(network, ctx.txHash)}` : ""}`);
      if (ctx.contractAddress) {
        lines.push(`- **Address:** ${ctx.contractAddress}${explorerAddressUrl(network, ctx.contractAddress) ? ` — ${explorerAddressUrl(network, ctx.contractAddress)}` : ""}`);
      }
      lines.push(`- **Constructor arguments:** \`${JSON.stringify(ctx.prepared?.constructorArgs ?? [])}\``);
    }
    const report = lines.join("\n");
    return { status: "succeeded", summary: "Report generated.", context: { report } };
  },
};
