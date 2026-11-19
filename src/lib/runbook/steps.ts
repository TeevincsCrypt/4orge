/**
 * The Runbook step allowlist. A Runbook may only reference the step types
 * declared here — there is no way to express "run this shell command" or
 * "execute this script", so an imported Runbook cannot smuggle code onto the
 * 4ORGE server.
 */

export type StepCategory =
  /** Reads state (files, RPC). Safe to run automatically and to retry. */
  | "read-only"
  /** Compiles or tests code in a sandbox on the 4ORGE server. */
  | "build"
  /** Needs the connected wallet to sign. Never executed by the server. */
  | "wallet"
  /** Needs an explicit click from the human operating 4ORGE. */
  | "human";

export const STEP_TYPES = [
  "project.load",
  "project.validate",
  "network.check",
  "contracts.compile",
  "contracts.test",
  "deploy.validate-args",
  "deploy.prepare",
  "human.confirm",
  "wallet.deploy",
  "tx.confirm",
  "deployment.record",
  "contract.verify",
  "report.generate",
] as const;

export type StepType = (typeof STEP_TYPES)[number];

export interface StepSpec {
  type: StepType;
  title: string;
  description: string;
  category: StepCategory;
  /** Step types that must appear earlier in the Runbook. */
  requires: StepType[];
  /** If this step is present, these must also be present (anywhere after it). */
  implies?: StepType[];
  /** Whether a failed attempt may be retried from the UI. */
  retryable: boolean;
  /** Whether the step may appear at most once. */
  unique: boolean;
}

export const STEP_SPECS: Record<StepType, StepSpec> = {
  "project.load": {
    type: "project.load",
    title: "Load project",
    description: "Snapshot the project's source files and detected structure.",
    category: "read-only",
    requires: [],
    retryable: true,
    unique: true,
  },
  "project.validate": {
    type: "project.validate",
    title: "Validate configuration",
    description:
      "Check that Solidity sources exist, the compiler version is resolvable and the deployment target is defined.",
    category: "read-only",
    requires: ["project.load"],
    retryable: true,
    unique: true,
  },
  "network.check": {
    type: "network.check",
    title: "Check network",
    description:
      "Call eth_chainId on the RPC, confirm it matches the selected QIE network and that deployments are permitted there.",
    category: "read-only",
    requires: [],
    retryable: true,
    unique: true,
  },
  "contracts.compile": {
    type: "contracts.compile",
    title: "Compile contracts",
    description: "Compile every Solidity source with solc using the project's compiler settings.",
    category: "build",
    requires: ["project.load"],
    retryable: true,
    unique: true,
  },
  "contracts.test": {
    type: "contracts.test",
    title: "Run tests",
    description: "Run the project's Hardhat test suites in an isolated sandbox.",
    category: "build",
    requires: ["project.load"],
    retryable: true,
    unique: true,
  },
  "deploy.validate-args": {
    type: "deploy.validate-args",
    title: "Validate constructor parameters",
    description: "Type-check the constructor arguments against the compiled contract ABI.",
    category: "read-only",
    requires: ["contracts.compile"],
    retryable: true,
    unique: true,
  },
  "deploy.prepare": {
    type: "deploy.prepare",
    title: "Prepare deployment transaction",
    description:
      "Encode creation bytecode and arguments, estimate gas and check the deployer balance.",
    category: "read-only",
    requires: ["network.check", "deploy.validate-args"],
    retryable: true,
    unique: true,
  },
  "human.confirm": {
    type: "human.confirm",
    title: "Human confirmation",
    description: "Pause until the operator reviews the deployment summary and confirms.",
    category: "human",
    requires: ["deploy.prepare"],
    retryable: true,
    unique: true,
  },
  "wallet.deploy": {
    type: "wallet.deploy",
    title: "Wallet approval & broadcast",
    description:
      "Ask the connected wallet (MetaMask, Rabby…) to sign and broadcast the deployment. 4ORGE never holds keys.",
    category: "wallet",
    requires: ["deploy.prepare"],
    implies: ["tx.confirm", "deployment.record"],
    retryable: true,
    unique: true,
  },
  "tx.confirm": {
    type: "tx.confirm",
    title: "Wait for confirmation",
    description:
      "Fetch the transaction receipt from the chain and validate status, sender, creation code and deployed bytecode.",
    category: "read-only",
    requires: ["wallet.deploy"],
    retryable: true,
    unique: true,
  },
  "deployment.record": {
    type: "deployment.record",
    title: "Record deployment",
    description: "Persist the confirmed contract address, transaction and gas data to deployment history.",
    category: "read-only",
    requires: ["tx.confirm"],
    retryable: true,
    unique: true,
  },
  "contract.verify": {
    type: "contract.verify",
    title: "Verify source on explorer",
    description:
      "Submit the exact compiler input to the network's explorer (Blockscout API) if the explorer supports verification.",
    category: "read-only",
    requires: ["deployment.record"],
    retryable: true,
    unique: true,
  },
  "report.generate": {
    type: "report.generate",
    title: "Generate report",
    description: "Produce a Markdown report of everything this execution did.",
    category: "read-only",
    requires: [],
    retryable: true,
    unique: true,
  },
};

export const CATEGORY_LABEL: Record<StepCategory, string> = {
  "read-only": "Automated · read-only",
  build: "Local build",
  wallet: "Wallet authorization",
  human: "Human confirmation",
};

export function isStepType(value: unknown): value is StepType {
  return typeof value === "string" && (STEP_TYPES as readonly string[]).includes(value);
}

/** Canonical order used by the built-in "full deployment" template. */
export const FULL_DEPLOY_SEQUENCE: StepType[] = [
  "project.load",
  "project.validate",
  "network.check",
  "contracts.compile",
  "contracts.test",
  "deploy.validate-args",
  "deploy.prepare",
  "human.confirm",
  "wallet.deploy",
  "tx.confirm",
  "deployment.record",
  "contract.verify",
  "report.generate",
];

export const CHECKS_ONLY_SEQUENCE: StepType[] = [
  "project.load",
  "project.validate",
  "network.check",
  "contracts.compile",
  "contracts.test",
  "report.generate",
];
