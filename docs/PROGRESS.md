# Development progress log

A plain-language record of what was built, how it was verified, and what is still open.

## Session 1 — 2026-11-19

### Starting point
The repository contained only an empty README. Everything was built from scratch.

### QIE technical verification
- The chain IDs (Testnet **1983**, Mainnet **1990**), RPCs and explorers from the specification match public QIE sources: the hackathon announcement (testnet.qie.digital, faucet), community listings and QIE Oracle documentation (mainnet 1990; it also lists `rpc5mainnet.qie.digital`).
- **Blocked:** the development sandbox's network policy refused connections to `*.qie.digital`, so live `eth_chainId` calls and explorer probing could not be done from here. A dedicated cloud environment named **"4orge"** was created with QIE hosts allowed for future sessions. To compensate, 4ORGE verifies the chain ID live **at runtime**, on every network check, and refuses mismatches.

### Built
- **Foundation:** Next.js 16 + TypeScript + Tailwind 4, dark design system, responsive shell (sidebar, network switcher with live RPC status, wallet menu), all eight sections.
- **Projects:** templates (Counter, dependency-free ERC-20, OpenZeppelin ERC-20, blank), folder upload, GitHub import (public; private via OAuth), static detection of contracts, pragmas, compiler settings, tests, dependencies and remappings, an in-browser file editor, and sync with GitHub.
- **Compilation:** official soljson builds, integrity-checked from npm (SHA-512), pragma-based version selection, safe npm dependency resolution (OpenZeppelin works), a child-process worker with limits, errors and warnings, ABIs and bytecode.
- **Testing:** Hardhat 3 sandbox (generated config, scrubbed environment, timeouts), Solidity and node:test suites, a structured result parser, history, and starter test generation.
- **Runbooks:** `4orge.runbook/v1` schema, 13-step allowlist, ordering and safety validator, visual editor (reorder, options, target, constructor args), JSON/YAML import and export, server-authoritative execution engine with logs, retry, cancel and reports.
- **Deployment:** gas and fee estimation, balance check, human review, EIP-6963 wallet (MetaMask/Rabby) signing with network switching, on-chain receipt validation, a permanent deployment record, explorer links and Blockscout verification.
- **History, Contracts, Network, Settings, Documentation** pages. REST API v1.
- **Storage:** local mode (clearly labelled) and a Supabase adapter. SQL migration with RLS.

### Verified
| Check | Result |
|---|---|
| TypeScript | ✅ clean |
| ESLint | ✅ clean |
| Unit tests (47) | ✅ pass. One real bug was found and fixed: contract names inside string literals were detected as contracts. |
| Integration tests (7): real compilation incl. OpenZeppelin from npm, compiler errors, Hardhat Solidity + TS tests, failing-test detection | ✅ pass |
| End-to-end (Playwright, real browser, real local EVM): create → compile → test → Runbook → review → wallet network switch → sign → receipt validation → record; on-chain `count()` read back = 7 | ✅ pass |
| Security e2e: a forged (non-deployment) tx hash is rejected by receipt validation | ✅ pass |
| Supabase migration on Postgres 16 + RLS isolation between two users | ✅ pass |
| Production build | ✅ pass |

Bugs found and fixed during QA:
- Tailwind v4 scanned generated files and caused dev reload loops (scanning is now restricted to `src/`).
- A React effect returned the Promise that newer browsers' `scrollIntoView()` returns, which crashed the execution page.
- The bundler rewrote the bundled-compiler path (it is now resolved at runtime).

### Needs the project owner
1. **QIE Testnet demo deployment.** Run 4ORGE on your computer (see README), fund a wallet from the faucet, and deploy the Counter template. This is the one step that needs real QIE network access and a funded wallet.
2. **Explorer verification on QIE.** It runs automatically after a Testnet deployment. If QIE's explorer is not Blockscout-compatible, 4ORGE shows *unsupported*.
3. **Optional:** Supabase credentials (multi-user hosting) and a GitHub OAuth App (private repo import). See the deployment guide.
4. **Optional:** start your next Claude session in the **"4orge"** environment, which allows the QIE hosts, so live QIE checks can be run there.

## Session 2 — 2026-11-19 to 2026-11-22

### Built
- Light redesign of the whole app, plus a public landing page at `/` (the dashboard moved to `/dashboard`).
- Official 4F logo as a vector, favicon, app icons, social card, and X profile picture and header.
- RPC fallbacks: QIE Testnet tries rpc1/2/4/5testnet, each verified by chain ID, with plain-language network errors and per-endpoint diagnostics.
- Hosting fixes: tolerant env flags, clear local-mode refusal, sign-in redirects built from the public URL, and explicit database grants. Newer Supabase projects don't grant table access automatically.

### Verified in production (Railway + hosted Supabase)
| Check | Result |
|---|---|
| App deployed on Railway with a persistent volume | ✅ |
| Supabase email sign-in and per-user data (after the permissions step) | ✅ |
| QIE Testnet reachable from the hosted server, after the RPC fallback fix | ✅ reported by owner |

### Next step
**Claim test QIE from the faucet, then run the [QIE Testnet test checklist](next-steps.md).** It covers:
1. The first QIE Testnet deployment with a real wallet. This was blocked only by the faucet being unavailable.
2. Explorer verification on QIE, which runs automatically after that deployment.

Optional: GitHub sign-in (enable the provider in Supabase) and private repository import (separate GitHub OAuth app).
