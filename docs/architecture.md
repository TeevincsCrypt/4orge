# Architecture & security

## Layers

```
Browser (Next.js client components)
 ├─ UI pages ─────────────────────────────┐   all data via /api/v1 (the public API)
 ├─ Wallet layer (EIP-6963 + viem) ───────┤   signs deployments; keys never leave the wallet
 │                                        ▼
Next.js server (route handlers, Node.js runtime)
 ├─ API layer          src/app/api/v1      auth → same-origin check → zod validation → service
 ├─ Services           src/lib/server/services   projects, runbooks, settings
 ├─ Runbook engine     src/lib/server/runbook    server-authoritative state machine
 ├─ Compilation        src/lib/server/compiler   dependency resolver + soljson worker process
 ├─ Testing            src/lib/server/testing    Hardhat 3 sandbox runner
 ├─ Chain access       src/lib/server/chain.ts   viem public client: network check, gas, receipt validation
 ├─ Verification       src/lib/server/verify.ts  Blockscout API adapter
 ├─ GitHub             src/lib/server/github.ts  OAuth + tarball import
 └─ Storage            src/lib/server/store      DataStore interface → LocalStore | SupabaseStore (RLS)
```

Pure, shared logic (`src/lib/*`: networks, Runbook schema and validation, ABI argument parsing, project detection, output parsers) has no server dependencies and is unit tested.

## Storage modes

- **Local mode** (default, no configuration): a single-user workspace. JSON files per collection live in `.forge-data/db/`, with atomic writes. API requests are only accepted from loopback hosts (`FORGE_ALLOW_REMOTE_LOCAL_MODE` overrides this, but that's not recommended). The UI labels this mode clearly.
- **Supabase mode** (`NEXT_PUBLIC_SUPABASE_URL` + anon key): Supabase Auth (magic link or GitHub). Every query runs with the **user's JWT**, so Postgres Row Level Security enforces ownership. The adapter also filters by `owner_id` as a second layer. No service-role key is used.

Both implement the same `DataStore` interface, so the rest of the app doesn't know which mode it runs in.

### Schema

`supabase/migrations/20261119000000_init.sql` creates `users`, `networks`, `user_settings`, `projects`, `project_repositories`, `project_files`, `builds`, `contracts`, `test_runs`, `runbooks`, `runbook_steps`, `runbook_executions`, `execution_logs` and `deployments`. It includes foreign keys, indexes, `updated_at` triggers, check constraints (hash and address formats, path traversal) and RLS policies:

- Owner-only access on every table (`owner_id = auth.uid()`).
- Child rows can only reference parents the user owns (`owns_project`, `owns_build`, …), so nobody can attach data to someone else's project.
- Deployments can't be deleted (an audit trail). They survive project deletion (`on delete set null`).
- `networks` is read-only reference data.

`tests/sql/run.sh` applies the migration to a throw-away Postgres with a stubbed `auth` schema and checks isolation between two users.

## Compilation

1. **Resolve sources.** Starting from deployable `.sol` files (tests and scripts excluded), imports are followed: relative paths, remappings (`remappings.txt`, `foundry.toml`), project paths, then **npm packages**. Packages are fetched from the npm registry, their **SHA-512 integrity** is verified, and only `.sol` and `package.json` files are extracted. Install scripts never run. Versions come from `package.json`, or `latest` with a warning.
2. **Choose the compiler.** It's the configured version if it satisfies every pragma, otherwise the newest release satisfying all of them. Official `soljson` (WebAssembly) builds come from the npm `solc` package (integrity-checked), with binaries.soliditylang.org as a SHA-256-checked fallback, and are cached in `.forge-cache/solc`.
3. **Compile** in a separate Node process (`scripts/solc-worker.cjs`) with a timeout, a memory cap and a scrubbed environment. The compiler gets all sources up front, so it never touches the filesystem.
4. Store errors and warnings, ABIs, bytecode, and the **exact Standard JSON input**, which is reused for explorer verification so the bytecode matches.

## Testing

`runProjectTests` builds a throw-away sandbox in `.forge-data/sandboxes/`:

- Only `.sol`, `test/**` and `remappings.txt` files are written, with paths validated again.
- **4ORGE writes its own `hardhat.config.ts`.** The project's config file is never executed. The compiler path points to the same cached soljson used for builds.
- `node_modules` links to the pinned `runner/` toolchain (Hardhat 3 + toolbox-viem) and the integrity-checked Solidity packages.
- Hardhat runs with a timeout (5 min), a heap cap, an output cap, a private `HOME` and a scrubbed environment (no server secrets). The sandbox is deleted afterwards.
- Results are parsed from Hardhat's report into per-test records. The raw output is stored too.

**Solidity tests** execute inside the EVM (EDR) and can't touch the host. **TypeScript/JavaScript tests** are real code: they're enabled by default only in local mode (where it is the owner's own code) and disabled on Supabase deployments unless the operator sets `FORGE_TEST_RUNNER=all`. For multi-tenant hosting, run the worker in a container/VM sandbox (gVisor, Firecracker, a locked-down Docker container without network access). The `runNode` boundary in `src/lib/server/sandbox.ts` is the single place to swap in such an isolation layer.

## Runbook engine

See [Runbooks](runbooks.md). Key properties:

- Definitions are validated against a strict schema and an allowlist. There is no "run command" step.
- The server owns the state: clients can only ask it to `advance`, `confirm`, `retry`, `cancel`, or report a wallet result. The server checks that the step is actually waiting for that input.
- A per-execution lock prevents double execution.
- Wallet steps run only in the browser. The server never signs.
- Receipt validation compares on-chain data with what was prepared:
  - `to == null` (contract creation)
  - `from` = the approved deployer
  - `input` = the exact prepared creation data
  - `chainId` matches
  - receipt `status` is success
  - code exists at `contractAddress`, and its size is compared with the compiled runtime

  The end-to-end test proves that a forged hash is rejected.

## Wallets

`src/components/wallet/wallet-provider.tsx` discovers wallets with **EIP-6963** (MetaMask and Rabby can be installed side by side), falling back to `window.ethereum`. It tracks `accountsChanged`/`chainChanged`, switches and adds networks, and sends the deployment with viem's wallet client bound to the target chain. Errors are translated into plain language (rejection, insufficient funds, wrong network, pending request). The transaction hash is persisted in `localStorage` before it's reported, so a closed tab or network blip can't lose a broadcast transaction.

## Web security

- **Cross-origin state-changing requests are rejected** (an `Origin` check in `apiRoute`), plus security headers (`X-Frame-Options: DENY`, `nosniff`, referrer policy, permissions policy).
- Request bodies are validated with zod and size-limited. 500 errors return a generic message; details are only logged on the server.
- The GitHub OAuth flow uses a random `state` (constant-time compare), a server-side code exchange, and an **AES-256-GCM encrypted httpOnly cookie** for the token. The token is never sent to the browser or stored in the database.
- Markdown rendering escapes raw HTML and only allows safe link schemes.
- Secrets are read from environment variables only. `.env*` is git-ignored, except `.env.example`.

## Known limitations

- Process-level isolation is appropriate for single-user/local use. Shared hosting needs container isolation for JavaScript tests (see above).
- The local store is single-process. Use Supabase for multi-instance deployments.
- The in-process execution lock is per server instance. With several instances, two simultaneous `advance` calls for the same execution could race (the UI only issues one at a time). A row-level lock in Postgres is on the roadmap.
