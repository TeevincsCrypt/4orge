import YAML from "yaml";
import { runbookDefinitionSchema, RUNBOOK_SCHEMA_ID, type RunbookDefinition, type RunbookStep } from "./schema";
import { FULL_DEPLOY_SEQUENCE, CHECKS_ONLY_SEQUENCE, STEP_SPECS, type StepType } from "./steps";
import type { NetworkId } from "../networks";

export interface RunbookIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; definition: RunbookDefinition; warnings: RunbookIssue[] }
  | { ok: false; errors: RunbookIssue[] };

/**
 * Validate an untrusted Runbook document: structural schema first, then the
 * ordering and safety rules that a schema cannot express.
 */
export function validateRunbook(input: unknown): ValidationResult {
  const parsed = runbookDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({
        path: i.path.join(".") || "(root)",
        message: i.message,
      })),
    };
  }
  const def = parsed.data;
  const errors: RunbookIssue[] = [];
  const warnings: RunbookIssue[] = [];

  const seenIds = new Set<string>();
  const seenTypes = new Map<StepType, number>();
  def.steps.forEach((step, index) => {
    const path = `steps.${index}`;
    if (seenIds.has(step.id)) errors.push({ path: `${path}.id`, message: `Duplicate step id "${step.id}".` });
    seenIds.add(step.id);

    const spec = STEP_SPECS[step.uses];
    if (spec.unique && seenTypes.has(step.uses)) {
      errors.push({ path, message: `"${step.uses}" may only appear once.` });
    }
    for (const req of spec.requires) {
      if (!seenTypes.has(req)) {
        errors.push({
          path,
          message: `"${step.uses}" must come after a "${req}" step.`,
        });
      }
    }
    seenTypes.set(step.uses, index);
  });

  def.steps.forEach((step, index) => {
    for (const implied of STEP_SPECS[step.uses].implies ?? []) {
      const at = seenTypes.get(implied);
      if (at === undefined || at < index) {
        errors.push({
          path: `steps.${index}`,
          message: `"${step.uses}" requires a later "${implied}" step so a broadcast transaction is always confirmed and recorded.`,
        });
      }
    }
  });

  const has = (t: StepType) => seenTypes.has(t);
  if (has("deploy.validate-args") && !def.target) {
    errors.push({ path: "target", message: "Deployment steps need a `target` with the contract to deploy." });
  }
  if (has("wallet.deploy") && !has("contracts.test")) {
    warnings.push({ path: "steps", message: "This Runbook deploys without running tests." });
  }
  if (has("wallet.deploy") && !has("human.confirm")) {
    warnings.push({
      path: "steps",
      message: "No human.confirm step: the deployment summary is still shown in the wallet step before signing.",
    });
  }
  if (def.network === "qie-mainnet" && has("wallet.deploy")) {
    warnings.push({
      path: "network",
      message: "Mainnet deployments are locked unless the server owner explicitly enables them.",
    });
  }
  if (has("report.generate") && seenTypes.get("report.generate") !== def.steps.length - 1) {
    warnings.push({ path: "steps", message: "report.generate is most useful as the final step." });
  }

  return errors.length ? { ok: false, errors } : { ok: true, definition: def, warnings };
}

export type RunbookTemplateId = "full-deploy" | "checks-only";

export function createRunbookTemplate(
  template: RunbookTemplateId,
  opts: { name: string; network?: NetworkId; contract?: string; source?: string; constructorArgs?: unknown[] },
): RunbookDefinition {
  const sequence = template === "full-deploy" ? FULL_DEPLOY_SEQUENCE : CHECKS_ONLY_SEQUENCE;
  const steps = sequence.map((uses) => makeStep(uses)) as RunbookStep[];
  const def = {
    schema: RUNBOOK_SCHEMA_ID,
    name: opts.name,
    description:
      template === "full-deploy"
        ? "Validate, compile, test and deploy with wallet approval, then confirm, record and verify."
        : "Validate, compile and test without deploying.",
    network: opts.network ?? "qie-testnet",
    target:
      template === "full-deploy" && opts.contract
        ? { contract: opts.contract, source: opts.source, constructorArgs: opts.constructorArgs ?? [] }
        : undefined,
    steps,
  };
  const result = runbookDefinitionSchema.parse(def);
  return result;
}

const STEP_ID_DEFAULTS: Record<StepType, string> = {
  "project.load": "load",
  "project.validate": "validate",
  "network.check": "network",
  "contracts.compile": "compile",
  "contracts.test": "test",
  "deploy.validate-args": "args",
  "deploy.prepare": "prepare",
  "human.confirm": "confirm",
  "wallet.deploy": "sign",
  "tx.confirm": "receipt",
  "deployment.record": "record",
  "contract.verify": "verify",
  "report.generate": "report",
};

export function makeStep(uses: StepType, id?: string): RunbookStep {
  return { id: id ?? STEP_ID_DEFAULTS[uses], uses } as RunbookStep;
}

export function defaultStepId(uses: StepType): string {
  return STEP_ID_DEFAULTS[uses];
}

/** Parse a Runbook from JSON or YAML text. Never evaluates anything. */
export function parseRunbookText(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "The document is empty." };
  if (trimmed.length > 200_000) return { ok: false, error: "Runbook documents are limited to 200 KB." };
  try {
    if (trimmed.startsWith("{")) return { ok: true, value: JSON.parse(trimmed) };
    // `yaml` in its default (core) schema has no custom tags, so it cannot construct objects or run code.
    return { ok: true, value: YAML.parse(trimmed, { maxAliasCount: 50 }) };
  } catch (e) {
    return { ok: false, error: `Could not parse document: ${(e as Error).message}` };
  }
}

export function runbookToYaml(def: RunbookDefinition): string {
  return YAML.stringify(def);
}
