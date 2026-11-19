/**
 * 4ORGE Runbook format, version 1.
 *
 * {
 *   "schema": "4orge.runbook/v1",
 *   "name": "Deploy Counter to QIE Testnet",
 *   "network": "qie-testnet",
 *   "target": { "contract": "Counter", "source": "contracts/Counter.sol", "constructorArgs": ["1"] },
 *   "steps": [
 *     { "id": "load", "uses": "project.load" },
 *     { "id": "compile", "uses": "contracts.compile" },
 *     { "id": "test", "uses": "contracts.test", "with": { "scope": "all", "required": true } },
 *     ...
 *   ]
 * }
 *
 * The schema is strict: unknown keys and unknown step types are rejected.
 */
import { z } from "zod";
import { STEP_TYPES } from "./steps";

export const RUNBOOK_SCHEMA_ID = "4orge.runbook/v1" as const;

const stepId = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z][a-z0-9-]*$/, "Step ids use lowercase letters, digits and dashes, starting with a letter.");

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string().max(4096), z.number(), z.boolean(), z.array(jsonValue).max(256)]),
);

const testOptions = z
  .object({
    scope: z.enum(["all", "solidity", "nodejs"]).default("all"),
    required: z.boolean().default(true),
  })
  .strict();

const verifyOptions = z.object({ required: z.boolean().default(false) }).strict();
const confirmOptions = z.object({ message: z.string().max(500).optional() }).strict();
const txConfirmOptions = z
  .object({
    confirmations: z.number().int().min(1).max(12).default(1),
    timeoutSeconds: z.number().int().min(30).max(900).default(300),
  })
  .strict();
const empty = z.object({}).strict();

const base = { id: stepId, name: z.string().max(80).optional() };

export const runbookStepSchema = z.discriminatedUnion("uses", [
  z.object({ ...base, uses: z.literal("project.load"), with: empty.optional() }).strict(),
  z.object({ ...base, uses: z.literal("project.validate"), with: empty.optional() }).strict(),
  z.object({ ...base, uses: z.literal("network.check"), with: empty.optional() }).strict(),
  z.object({ ...base, uses: z.literal("contracts.compile"), with: empty.optional() }).strict(),
  z.object({ ...base, uses: z.literal("contracts.test"), with: testOptions.optional() }).strict(),
  z.object({ ...base, uses: z.literal("deploy.validate-args"), with: empty.optional() }).strict(),
  z.object({ ...base, uses: z.literal("deploy.prepare"), with: empty.optional() }).strict(),
  z.object({ ...base, uses: z.literal("human.confirm"), with: confirmOptions.optional() }).strict(),
  z.object({ ...base, uses: z.literal("wallet.deploy"), with: empty.optional() }).strict(),
  z.object({ ...base, uses: z.literal("tx.confirm"), with: txConfirmOptions.optional() }).strict(),
  z.object({ ...base, uses: z.literal("deployment.record"), with: empty.optional() }).strict(),
  z.object({ ...base, uses: z.literal("contract.verify"), with: verifyOptions.optional() }).strict(),
  z.object({ ...base, uses: z.literal("report.generate"), with: empty.optional() }).strict(),
]);

export const runbookTargetSchema = z
  .object({
    contract: z.string().min(1).max(128).regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "Invalid contract name."),
    source: z.string().max(512).optional(),
    constructorArgs: z.array(jsonValue).max(64).default([]),
  })
  .strict();

export const runbookDefinitionSchema = z
  .object({
    schema: z.literal(RUNBOOK_SCHEMA_ID),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).default(""),
    network: z.enum(["qie-testnet", "qie-mainnet", "local-hardhat"]).default("qie-testnet"),
    target: runbookTargetSchema.optional(),
    steps: z.array(runbookStepSchema).min(1).max(STEP_TYPES.length),
  })
  .strict();

export type RunbookStep = z.infer<typeof runbookStepSchema>;
export type RunbookTarget = z.infer<typeof runbookTargetSchema>;
export type RunbookDefinition = z.infer<typeof runbookDefinitionSchema>;
export type RunbookDefinitionInput = z.input<typeof runbookDefinitionSchema>;
