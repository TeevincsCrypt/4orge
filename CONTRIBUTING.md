# Contributing to 4ORGE

Thanks for helping build developer infrastructure for QIE!

## Development setup

1. Install Node.js 22.12+.
2. `npm install` (this also installs the Hardhat toolchain in `runner/`).
3. `npm run dev` and open http://localhost:3000.

Optional: `npm run chain` plus `FORGE_ENABLE_LOCAL_CHAIN=true npm run dev` to rehearse deployments on a local EVM.

## Project layout

```
src/app/(app)/        UI pages (Overview, Projects, Runbooks, Deployments, Contracts, Network, Docs, Settings)
src/app/api/v1/       Versioned REST API (the UI is a client of it)
src/components/       UI components, wallet provider, app context
src/lib/              Shared pure logic: networks, Runbook schema/validation, ABI args, detection, parsers
src/lib/server/       Server-only: storage adapters, compiler, test runner, chain access, engine, GitHub, verification
scripts/              Compiler worker (runs in a child process)
runner/               Pinned Hardhat 3 toolchain used for sandboxed test runs and `npm run chain`
supabase/migrations/  Postgres schema + Row Level Security
tests/                unit, integration, e2e (Playwright) and SQL (RLS) tests
docs/                 Documentation (also rendered in-app)
```

## Before opening a pull request

```bash
npm run test:all
```

```bash
npm run build
```

If you touched the deployment flow, also run `npm run test:e2e`. If you changed the schema, run `tests/sql/run.sh`.

## Guidelines

- **Never fake results.** Every status shown to users must reflect a real operation (compiler output, test output, chain data). If something isn't possible, say so in the UI.
- **Security first.** Treat imported projects and Runbooks as untrusted. Never execute user-supplied config or commands on the server. Never handle private keys.
- **New Runbook steps** must be added to the allowlist (`src/lib/runbook/steps.ts`), the schema (`schema.ts`), the engine executors and the SQL check constraint, with tests.
- Keep dependencies minimal and maintained; prefer the platform and viem over new libraries.
- Write clear, plain-language UI copy. Many users are new to blockchain tooling.
