# Runbooks

A **Runbook** is a reusable, declarative description of how to prepare, check and deploy a contract. Runbooks are the core of 4ORGE: every deployment, including the one-click *Start deployment* wizard, runs as a Runbook. That way each deployment can be inspected, repeated and audited.

## Format (`4orge.runbook/v1`)

Runbooks are JSON documents (YAML import/export is supported):

```yaml
schema: 4orge.runbook/v1
name: Deploy Counter to QIE Testnet
description: Validate, compile, test and deploy with wallet approval.
network: qie-testnet            # qie-testnet (default) | qie-mainnet | local-hardhat
target:
  contract: Counter
  source: contracts/Counter.sol # optional; disambiguates duplicate names
  constructorArgs: ["10"]       # strings/numbers/booleans/arrays, checked against the ABI
steps:
  - { id: load,     uses: project.load }
  - { id: validate, uses: project.validate }
  - { id: network,  uses: network.check }
  - { id: compile,  uses: contracts.compile }
  - { id: test,     uses: contracts.test, with: { scope: all, required: true } }
  - { id: args,     uses: deploy.validate-args }
  - { id: prepare,  uses: deploy.prepare }
  - { id: confirm,  uses: human.confirm, with: { message: "Double-check the owner address" } }
  - { id: sign,     uses: wallet.deploy }
  - { id: receipt,  uses: tx.confirm, with: { confirmations: 2, timeoutSeconds: 300 } }
  - { id: record,   uses: deployment.record }
  - { id: verify,   uses: contract.verify, with: { required: false } }
  - { id: report,   uses: report.generate }
```

The schema is **strict**: unknown keys, unknown step types and out-of-range options are rejected. There is deliberately **no step that runs a command or script**. An imported Runbook can only use the operations below.

## Step allowlist

| Step | Category | What it does |
|---|---|---|
| `project.load` | Automated, read-only | Snapshots the project's files and detected structure. |
| `project.validate` | Automated, read-only | Checks that deployable sources exist, the compiler version is resolvable and the target contract exists and is deployable. |
| `network.check` | Automated, read-only | Calls `eth_chainId` and fails if it differs from the configured chain ID. Also fails if deployments to that network are locked (Mainnet). |
| `contracts.compile` | Local build | Compiles with solc and records the build (including its Standard JSON input). |
| `contracts.test` | Local build | Runs Hardhat 3 tests in a sandbox. `scope`: `all`, `solidity` or `nodejs`. With `required: true` (the default), failing tests stop the Runbook. |
| `deploy.validate-args` | Automated, read-only | Type-checks `constructorArgs` against the compiled ABI. |
| `deploy.prepare` | Automated, read-only | Encodes creation data, estimates gas and fees, and checks the deployer balance. |
| `human.confirm` | Human confirmation | Pauses until the operator reviews the summary and confirms. |
| `wallet.deploy` | Wallet authorization | The browser asks the connected wallet to sign and broadcast. **Never executed by the server.** |
| `tx.confirm` | Automated, read-only | Fetches the transaction and receipt from the RPC and validates them (see below). Waits for `confirmations`. |
| `deployment.record` | Automated, read-only | Marks the deployment record as confirmed with address, block and gas data. |
| `contract.verify` | Automated, read-only | Submits source verification to a Blockscout-compatible explorer. `required: false` (the default) means failures only produce a warning. |
| `report.generate` | Automated, read-only | Writes a Markdown report of the execution. |

## Ordering rules

The validator checks rules that a schema can't express:

- Each step type may appear once, and step ids must be unique (`[a-z][a-z0-9-]*`).
- Dependencies must come **earlier**: `deploy.validate-args` needs `contracts.compile`; `deploy.prepare` needs `network.check` and `deploy.validate-args`; `human.confirm` and `wallet.deploy` need `deploy.prepare`; `tx.confirm` needs `wallet.deploy`; `deployment.record` needs `tx.confirm`; `contract.verify` needs `deployment.record`.
- A `wallet.deploy` step **must be followed** by `tx.confirm` and `deployment.record`, so a broadcast transaction is always confirmed and recorded.
- Deployment steps need a `target`.

Warnings (not errors) are shown for: deploying without tests, deploying without `human.confirm`, Mainnet targets, and `report.generate` not being last.

Independent steps can be reordered freely in the editor, for example running tests before or after the network check.

## Execution model

Executions are **server-authoritative state machines**:

1. `POST /api/v1/runbooks/:id/executions` creates an execution with all steps `pending`.
2. `POST /api/v1/executions/:id/advance` runs read-only and build steps on the server until one needs a person, needs time (waiting for a receipt) or fails.
3. Human steps wait for `POST /executions/:id/confirm`.
4. Wallet steps wait for the browser to sign, then for `POST /executions/:id/wallet` with the transaction hash (or the wallet's error, such as a rejection). The deployment is recorded as **pending immediately**, so a broadcast transaction is never lost.
5. `tx.confirm` then verifies, **from the chain**, that the transaction is a contract creation from the approved deployer, carries exactly the prepared bytecode and arguments, succeeded, and left code at the new address. A transaction hash alone is never treated as success.

Every action is written to the execution log. Failed steps can be **retried** if safe: a wallet step can't be retried after a transaction was broadcast. An execution can be cancelled until a transaction has been broadcast.

## Importing and exporting

In the Runbook editor, the **JSON** and **YAML** tabs show the current document, let you download it, and let you paste a document to import. Imported documents are fully validated before they replace the editor contents. `POST /api/v1/runbooks/validate` validates a document (JSON object or JSON/YAML text) without saving it.
