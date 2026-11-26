/**
 * Domain model shared by the API, storage adapters and UI.
 * Every persisted record carries `ownerId` so ownership can be enforced both
 * in application code and by Postgres Row Level Security (Supabase mode).
 */
import type { NetworkId } from "./networks";
import type { RunbookDefinition } from "./runbook/schema";

export type ISODate = string;

export interface BaseRecord {
  id: string;
  ownerId: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ProjectSource = "blank" | "template" | "github" | "upload";
export type Framework = "hardhat" | "foundry" | "plain" | "unknown";

export interface CompilerSettings {
  /** Exact solc version, e.g. "0.8.28". null = choose from pragmas. */
  version: string | null;
  optimizer: { enabled: boolean; runs: number };
  evmVersion: string | null;
  viaIR: boolean;
}

export interface ProjectDetection {
  framework: Framework;
  configFile: string | null;
  sourceDirs: string[];
  testFiles: { solidity: string[]; nodejs: string[] };
  contracts: DetectedContract[];
  pragmas: string[];
  dependencies: Record<string, string>;
  remappings: string[];
  notes: string[];
}

export interface DetectedContract {
  name: string;
  kind: "contract" | "abstract" | "interface" | "library";
  path: string;
}

export interface Project extends BaseRecord {
  name: string;
  description: string;
  source: ProjectSource;
  compiler: CompilerSettings;
  detection: ProjectDetection;
  lastBuildId: string | null;
  lastTestRunId: string | null;
}

export interface ProjectRepository extends BaseRecord {
  projectId: string;
  provider: "github";
  url: string;
  owner: string;
  repo: string;
  ref: string;
  commitSha: string | null;
  isPrivate: boolean;
  lastSyncedAt: ISODate;
}

export interface ProjectFile extends BaseRecord {
  projectId: string;
  path: string;
  content: string;
  size: number;
  sha256: string;
}

export interface CompilerMessage {
  severity: "error" | "warning" | "info";
  type: string;
  message: string;
  formattedMessage: string;
  sourceLocation?: { file: string; start: number; end: number };
}

export type BuildStatus = "succeeded" | "failed";

export interface Build extends BaseRecord {
  projectId: string;
  status: BuildStatus;
  compilerVersion: string; // long version, e.g. 0.8.28+commit.7893614a
  settings: CompilerSettings;
  errors: CompilerMessage[];
  warnings: CompilerMessage[];
  durationMs: number;
  sourceCount: number;
  contractCount: number;
  /** Standard JSON input actually compiled — needed for explorer verification. */
  input: unknown;
  inputHash: string;
}

export interface ContractArtifact extends BaseRecord {
  projectId: string;
  buildId: string;
  name: string;
  sourcePath: string;
  fullyQualifiedName: string;
  abi: AbiItem[];
  bytecode: `0x${string}`;
  deployedBytecode: `0x${string}`;
  bytecodeSize: number;
  hasUnlinkedLibraries: boolean;
  compilerVersion: string;
}

// Minimal ABI typing that survives JSON storage.
export interface AbiParameter {
  name?: string;
  type: string;
  internalType?: string;
  components?: AbiParameter[];
  indexed?: boolean;
}
export interface AbiItem {
  type: "function" | "constructor" | "event" | "error" | "fallback" | "receive";
  name?: string;
  inputs?: AbiParameter[];
  outputs?: AbiParameter[];
  stateMutability?: string;
  anonymous?: boolean;
}

export type TestStatus = "passed" | "failed" | "skipped";
export interface TestCaseResult {
  kind: "solidity" | "nodejs";
  suite: string;
  name: string;
  status: TestStatus;
  durationMs: number | null;
  error: string | null;
}

export type TestRunStatus = "passed" | "failed" | "error" | "no-tests";
export interface TestRun extends BaseRecord {
  projectId: string;
  status: TestRunStatus;
  scope: "all" | "solidity" | "nodejs";
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  tests: TestCaseResult[];
  output: string;
  errorMessage: string | null;
  compilerVersion: string | null;
}

export interface Runbook extends BaseRecord {
  projectId: string;
  name: string;
  description: string;
  definition: RunbookDefinition;
  lastExecutionId: string | null;
}

export interface RunbookStepRow extends BaseRecord {
  runbookId: string;
  position: number;
  stepKey: string;
  uses: string;
  config: Record<string, unknown>;
}

export type StepStatus =
  | "pending"
  | "running"
  | "waiting"
  | "succeeded"
  | "warning"
  | "failed"
  | "skipped";

export interface StepState {
  stepId: string;
  uses: string;
  status: StepStatus;
  startedAt: ISODate | null;
  finishedAt: ISODate | null;
  summary: string | null;
  error: string | null;
  output: Record<string, unknown> | null;
  attempts: number;
}

export type ExecutionStatus =
  | "running"
  | "awaiting_confirmation"
  | "awaiting_wallet"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface PreparedDeployment {
  chainId: number;
  network: NetworkId;
  from: `0x${string}`;
  data: `0x${string}`;
  gas: string | null;
  gasPrice: string | null;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  estimatedCostWei: string | null;
  balanceWei: string | null;
  contractName: string;
  sourcePath: string;
  constructorArgs: unknown[];
  constructorArgsEncoded: `0x${string}`;
  buildId: string;
  /** QIE IDs used in the constructor arguments and the addresses they were pinned to. */
  qieNames?: Record<string, `0x${string}`> | null;
}

export interface ExecutionContext {
  deployer: `0x${string}` | null;
  buildId: string | null;
  testRunId: string | null;
  contractName: string | null;
  constructorArgs: unknown[] | null;
  /** QIE IDs resolved by deploy.validate-args, pinned for the rest of the execution. */
  qieNames?: Record<string, `0x${string}`> | null;
  prepared: PreparedDeployment | null;
  txHash: `0x${string}` | null;
  deploymentId: string | null;
  contractAddress: `0x${string}` | null;
  confirmedBy: string | null;
  report: string | null;
}

export interface RunbookExecution extends BaseRecord {
  runbookId: string;
  projectId: string;
  runbookName: string;
  network: NetworkId;
  status: ExecutionStatus;
  definition: RunbookDefinition;
  steps: StepState[];
  context: ExecutionContext;
  finishedAt: ISODate | null;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
export interface ExecutionLog extends BaseRecord {
  executionId: string;
  stepId: string | null;
  level: LogLevel;
  message: string;
  data: Record<string, unknown> | null;
}

export type DeploymentStatus = "pending" | "confirmed" | "failed";
export type VerificationStatus = "unverified" | "pending" | "verified" | "failed" | "unsupported";

export interface Deployment extends BaseRecord {
  projectId: string;
  executionId: string | null;
  buildId: string;
  contractName: string;
  sourcePath: string;
  network: NetworkId;
  chainId: number;
  deployerAddress: `0x${string}`;
  contractAddress: `0x${string}` | null;
  txHash: `0x${string}`;
  blockNumber: string | null;
  gasUsed: string | null;
  effectiveGasPrice: string | null;
  status: DeploymentStatus;
  failureReason: string | null;
  verificationStatus: VerificationStatus;
  verificationMessage: string | null;
  compilerVersion: string;
  constructorArgs: unknown[];
  constructorArgsEncoded: `0x${string}`;
  confirmedAt: ISODate | null;
}

export interface UserSettings extends BaseRecord {
  defaultNetwork: NetworkId;
  rpcOverrides: Partial<Record<NetworkId, string>>;
  requireTestsBeforeDeploy: boolean;
}

export interface Collections {
  projects: Project;
  project_repositories: ProjectRepository;
  project_files: ProjectFile;
  builds: Build;
  contracts: ContractArtifact;
  test_runs: TestRun;
  runbooks: Runbook;
  runbook_steps: RunbookStepRow;
  runbook_executions: RunbookExecution;
  execution_logs: ExecutionLog;
  deployments: Deployment;
  user_settings: UserSettings;
}

export type CollectionName = keyof Collections;
