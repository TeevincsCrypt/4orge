# Deployment guide

How to run 4ORGE somewhere other than your own laptop.

## Requirements

- **A Node.js 22.12+ server process** (a VPS, Railway, Render, Fly.io or a container). 4ORGE starts child processes for the compiler and Hardhat and writes a cache to disk, so purely serverless platforms with read-only filesystems and short time limits are not a good fit for the build and test features.
- Outbound HTTPS to `registry.npmjs.org` (compilers and Solidity packages), `binaries.soliditylang.org` (fallback), the QIE RPC and explorer hosts, and `api.github.com` / `github.com` for imports.

## 1. Supabase (required for multi-user hosting)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase/migrations/20261119000000_init.sql` and run it. (With the Supabase CLI, run `supabase db push` instead.)
3. **Authentication → URL configuration**: set *Site URL* to your 4ORGE URL and add `https://<your-domain>/auth/callback` to the redirect URLs.
4. Optional: **Authentication → Providers → GitHub** to allow "Continue with GitHub".
5. Copy the **Project URL** and **anon public key** from *Project Settings → API*.

## 2. Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_APP_URL=https://forge.example.com
FORGE_SESSION_SECRET=<64 random hex characters>
GITHUB_CLIENT_ID=...            # optional, for private repo import
GITHUB_CLIENT_SECRET=...
FORGE_TEST_RUNNER=solidity      # keep JS tests off unless the runner is container-isolated
FORGE_ENABLE_MAINNET_DEPLOYMENTS=false
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. GitHub OAuth App (optional)

GitHub → Settings → Developer settings → OAuth Apps → *New OAuth App*:

- Homepage URL: `https://forge.example.com`
- Authorization callback URL: `https://forge.example.com/api/github/oauth/callback`

Copy the client ID and generate a client secret.

## 4. Build and run

```bash
npm ci
npm run build
npm start
```

`npm ci` also installs the Hardhat toolchain in `runner/`. Persist the `.forge-cache` directory between deploys to avoid re-downloading compilers.

## 5. Isolation for shared hosting

When several people use one 4ORGE server, treat their projects as untrusted:

- Keep `FORGE_TEST_RUNNER=solidity` (Solidity tests run inside the EVM, not on the host). Only enable `all` if the worker runs in a sandbox: for example a separate container with no network access, a read-only root filesystem, CPU/memory limits and a non-root user. `src/lib/server/sandbox.ts` (`runNode`) is the integration point.
- Run 4ORGE itself as a non-root user, with no cloud credentials in its environment.
- Set `FORGE_MAX_JOBS` to match your CPU count.

## 6. Going to Mainnet

Mainnet deployments are locked by design. Before setting `FORGE_ENABLE_MAINNET_DEPLOYMENTS=true`:

1. Rehearse the exact Runbook on QIE Testnet, and on the local chain with `npm run chain`.
2. Keep `human.confirm` in the Runbook and `contracts.test` set to required.
3. Use a hardware wallet for the deployer account.
4. Double-check constructor arguments (owners, supplies) in the review step. Deployments cannot be undone.
