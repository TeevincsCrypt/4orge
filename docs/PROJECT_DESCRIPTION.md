# 4ORGE — Project Description

**Category:** Developer Infrastructure · **Blockchain:** QIE · **Built for:** QIE Blockchain Hackathon 3.0

## One-liner
4ORGE is a web workspace for compiling, testing and deploying smart contracts to QIE through reusable, validated Runbooks. Your wallet signs every deployment, and every receipt is checked on-chain.

## Short description
4ORGE (pronounced *Forge*) brings the whole smart-contract release process onto one screen. You bring in a Solidity project from a template, a folder or GitHub. 4ORGE compiles it with the official Solidity compiler and runs its Hardhat tests in a sandbox. It then deploys it to QIE through a reusable workflow called a Runbook: automated checks run first, you review a clear summary, and your own wallet (MetaMask or Rabby) signs. 4ORGE then confirms the deployment directly from the QIE blockchain before recording it in a permanent, searchable history.

---

## The problem
Shipping a contract to an EVM chain today means juggling many disconnected tools:
- installing the right compiler version and dependencies;
- running tests in a terminal;
- finding the correct RPC endpoint and chain ID;
- writing or copying a deployment script and trusting it targets the right network;
- watching a transaction hash scroll past;
- pasting the contract address into a spreadsheet.

Every step is manual and error-prone, and the whole process has to be repeated whenever a contract changes. For developers new to the ecosystem, this setup is the biggest barrier to shipping anything on QIE. Experienced teams pay for it in time and in risky mistakes, such as deploying to the wrong network, with the wrong arguments, or without running tests.

## The solution
4ORGE turns that scattered process into one guided, repeatable workflow:

1. **Bring a project.** Start from a template, upload a Hardhat or Foundry folder, or import a GitHub repository. 4ORGE detects contracts, compiler settings, tests and dependencies by *reading* configuration files; it never runs them.
2. **Compile.** It uses the official Solidity compiler builds, picks the version from your config or `pragma`, and checks every download against its published checksum. npm imports such as OpenZeppelin are resolved safely, with no package install scripts ever run. Errors, warnings, ABIs and bytecode are shown in the app.
3. **Test.** Your Hardhat 3 suites run in an isolated sandbox with a 4ORGE-generated configuration: Solidity `*.t.sol` tests, plus TypeScript tests where the operator allows them. Each test is listed with its result, failure message and duration. Failing tests can block a deployment.
4. **Deploy with a Runbook.** A Runbook is a saved, versioned workflow:

   validate → check network → compile → test → type-check constructor arguments → prepare the transaction and estimate gas → **human review** → **wallet signature** → **on-chain confirmation** → record → verify → report.

   4ORGE runs the automated steps itself and stops for the two things only you can do: review and sign.
5. **Keep the record.** Every deployment is stored permanently with its network, chain ID, deployer, contract address, transaction, block, gas used, compiler version, constructor arguments, verification status and explorer links. All of it is searchable and filterable.

## What makes 4ORGE different

**Runbooks: deployments as reviewable, reusable workflows**
- Runbooks use a strict, versioned format (`4orge.runbook/v1`) that can be edited visually, exported or imported as JSON or YAML, and run again with one click.
- Every step comes from a fixed allowlist of 13 step types. There is **no "run a command" step**, so a shared or imported Runbook can never execute arbitrary code on the server.
- Each step is clearly labelled by what it is allowed to do: *automated & read-only*, *local build*, *human confirmation* or *wallet authorization*.
- An ordering validator enforces safe sequences. For example, a wallet broadcast must always be followed by on-chain confirmation and recording, so a sent transaction can never be forgotten.
- Failed steps can be retried safely: 4ORGE never sends a second transaction.

**Receipts, not promises**

A wallet's transaction hash is only a pointer. Before 4ORGE marks a deployment successful, the server fetches the transaction and receipt from QIE itself and checks that:
- the transaction is a contract creation;
- it was sent by the approved deployer;
- its data is byte-for-byte the compiled bytecode plus the reviewed constructor arguments;
- it targets the right chain and succeeded;
- contract code now exists at the new address.

The automated test suite includes a forged-hash attack, and 4ORGE rejects it.

**Built for QIE, not just "EVM-compatible"**
- QIE Testnet (chain 1983) is the default network. QIE Mainnet (chain 1990) is visible but **locked for deployments** unless the operator deliberately enables it.
- The chain ID is verified live via `eth_chainId` before anything is prepared. Mismatching endpoints are refused.
- Multiple QIE RPC endpoints are tried automatically, and each must prove the correct chain ID. The Network page shows the health and latency of every endpoint.
- One-click "add / switch wallet to QIE Testnet" (EIP-3085 / EIP-3326), with detection of wallet/network mismatches.
- Source verification is submitted to QIE's explorer if it supports the Blockscout verification API. If it doesn't, 4ORGE says *unsupported* rather than ever claiming a verification the explorer didn't confirm.

**Security by design**
- **No keys, ever:** 4ORGE never asks for, stores or sees a seed phrase or private key. Wallets are discovered with EIP-6963, so MetaMask and Rabby can coexist.
- **Imported code is untrusted:** file paths are validated against directory traversal, config files are parsed as text, and dependencies are integrity-checked with only Solidity files extracted.
- **Sandboxed builds:** separate processes with timeouts, memory caps, a scrubbed environment (no server secrets) and a server-wide concurrency limit.
- **Private data:** in multi-user mode every table is protected by Postgres Row Level Security, tested against a real database. Deployment records cannot be deleted (an audit trail).
- **Web hardening:** cross-origin request blocking, security headers, and an encrypted httpOnly cookie for GitHub access.

## Features at a glance
- **Dashboard:** pastel KPI tiles, weekly activity chart, projects, and a Runbook-runs tracker with progress rings.
- **Projects:** templates (Counter, dependency-free ERC-20, OpenZeppelin ERC-20, blank), folder upload, GitHub import and sync, an in-browser file editor, and compiler settings.
- **Build:** real compilation with errors and warnings, plus ABI and bytecode viewers.
- **Tests:** per-test results, failure messages, durations, history, and starter-test generation.
- **Runbooks:** visual editor, validation, JSON/YAML import and export, a live execution console with logs, retry and cancel, and downloadable Markdown reports.
- **Deploy wizard:** pick a contract, enter constructor arguments with live ABI type checking, and choose a network. 4ORGE saves it as a Runbook and runs it.
- **Deployments & Contracts:** permanent history with search, filters and explorer links, plus every compiled contract and where it is deployed.
- **Network & Settings:** live RPC checks, custom RPC, wallet network switching and workspace preferences.
- **REST API (`/api/v1`):** projects, builds, tests, Runbooks, executions and deployments. The 4ORGE interface itself is built on it, so scripts and CI can use the same API.
- **Public landing page** and in-app documentation.

## Architecture & technology
- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Lucide icons; a light, responsive design system.
- **Blockchain:** viem for RPC, transaction encoding and wallet interaction; EIP-1193 / EIP-6963 wallets (MetaMask, Rabby).
- **Compilation & testing:** official `soljson` Solidity compilers (integrity-checked), Hardhat 3 (EDR) with the viem toolbox, and a safe npm Solidity dependency resolver.
- **Backend:** Next.js route handlers forming a versioned REST API, and a server-authoritative Runbook execution engine.
- **Data & auth:** Supabase (Postgres with Row Level Security, email and GitHub sign-in), or a self-contained local mode for single-user use.
- **Hosting:** any Node.js server with a persistent disk. Currently deployed on Railway.

## Quality & testing
- **59 unit tests:** Runbook validation, path safety, ABI argument parsing, project detection, test-output parsing, network configuration, compiler version selection, RPC error handling, and storage isolation.
- **7 integration tests:** real compilation (including OpenZeppelin from npm), real compiler errors, and real Hardhat Solidity and TypeScript test runs, including failure detection.
- **1 end-to-end test** in a real browser against a real local EVM:
  - the full flow: create → compile → test → Runbook → review → wallet network switch → sign → on-chain validation → record;
  - the deployed contract is read back from the chain;
  - the forged-hash attack is rejected.
- **Database security tests:** the Supabase migration is applied to a real Postgres, and user isolation, ownership forgery, traversal and audit-trail rules are verified.
- TypeScript, ESLint and the production build all pass cleanly. CI runs on every push.

## Current status
- ✅ Live on Railway with Supabase sign-in and private per-user workspaces.
- ✅ The hosted server reaches QIE Testnet (chain 1983 verified live).
- ✅ The complete deployment flow is proven end-to-end against a real EVM.
- ⏳ **First real QIE Testnet deployment:** pending test QIE, because the QIE faucet was temporarily unavailable. Everything up to the wallet signature works on Testnet today.
- ⏳ **Explorer verification on QIE:** runs automatically after that first deployment.

## Who it's for
- **Developers new to QIE** who want to ship a contract without assembling a toolchain.
- **Teams** that want deployments to be reviewed, repeatable and recorded instead of improvised from a terminal.
- **Hackathon builders and auditors** who need a trustworthy record of what was deployed, by whom, with which code and arguments.

## Roadmap
- First QIE Testnet demo deployment and explorer verification.
- Mainnet deployments behind an explicit, per-deployment owner authorization.
- Container-isolated test runners for large multi-tenant hosting.
- A contract interaction console (read/write calls from the ABI).
- Multi-contract Runbooks (deploy and wire several contracts, proxies, post-deploy calls).
- Running Runbooks from CI (GitHub Actions) through the API with personal access tokens.
- Full Foundry compatibility (`foundry.toml` profiles, `lib/` submodules beyond forge-std) and library linking.

## Links
- **Live app:** *(your Railway URL)*
- **Source code:** https://github.com/TeevincsCrypt/4orge (branch `claude/keen-mccarthy-i36ir2`)
- **Docs:** README, plus in-app **Documentation** (Getting started, Runbooks, QIE networks, Architecture & security, API, Deployment guide)
- **License:** MIT
