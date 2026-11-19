# API reference (v1)

All endpoints live under `/api/v1`, take and return JSON, and use this error shape:

```json
{ "error": { "code": "validation_error", "message": "Request body is invalid.", "details": [ … ] } }
```

**Authentication.** In local mode, requests must come from the same machine. In Supabase mode, send the Supabase session cookie (browser) or `Authorization: Bearer <supabase access token>` (scripts/CI). All data is scoped to the authenticated user. Browser requests from another origin are rejected.

Responses never include secrets, GitHub tokens or wallet keys (4ORGE has none).

## Configuration

| Method | Path | Description |
|---|---|---|
| GET | `/config` | Storage mode, feature flags, current user. No authentication needed. |
| GET | `/networks` | Networks with `deploymentsAllowed` and your custom RPC. |
| GET | `/networks/:id/status` | Live server-side RPC check (`eth_chainId`, block, latency) and explorer probe. |
| GET / PUT | `/settings` | `defaultNetwork`, `rpcOverrides`, `requireTestsBeforeDeploy`. |
| GET | `/compilers` | Available solc versions. |
| GET | `/overview` | Dashboard statistics and activity (computed from real records). |

## Projects

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | List projects. |
| POST | `/projects` | Create. Body: `{ name, description?, template? ("counter" \| "token" \| "oz-token" \| "blank"), files?: [{ path, content }] }`. |
| POST | `/projects/import` | Import from GitHub: `{ repository: "owner/repo" or URL, ref?, name? }`. |
| GET / PATCH / DELETE | `/projects/:id` | Details (files, contracts, last build/test, deployments, Runbooks); update name, description or compiler settings; delete (deployments are kept). |
| GET / PUT / DELETE | `/projects/:id/files` | `GET ?path=` returns one file. `PUT { files, replace? }` upserts files (validated paths and types). `DELETE ?path=` removes one. |
| POST | `/projects/:id/compile` | Compile now. Returns build (errors, warnings, compiler version) and contracts. |
| POST | `/projects/:id/test` | Run tests: `{ scope: "all" \| "solidity" \| "nodejs" }`. |
| GET | `/projects/:id/builds`, `/projects/:id/test-runs` | History. |
| POST | `/projects/:id/generate-test` | `{ contractId }` creates a starter Solidity test. |
| POST | `/projects/:id/sync` | Pull the latest commit of the linked GitHub branch. |
| GET | `/builds/:id[?input=1]` | Build details and contracts (optionally the Standard JSON input). |
| GET | `/test-runs/:id` | Test run with per-test results and raw output. |
| GET | `/contracts`, `/contracts/:id` | Compiled contracts (ABI, bytecode) and where they are deployed. |

## Runbooks & executions

| Method | Path | Description |
|---|---|---|
| GET | `/runbooks[?projectId=]` | List. |
| POST | `/runbooks` | Create from `{ projectId, definition }` or `{ projectId, template: "full-deploy" \| "checks-only", name, network?, contract?, source?, constructorArgs? }`. Returns `{ runbook, warnings }`. Invalid definitions return 422 with `details`. |
| POST | `/runbooks/validate` | `{ definition }` or `{ text }` (JSON/YAML). Returns `{ ok, errors \| warnings }`. Nothing is saved. |
| GET / PUT / DELETE | `/runbooks/:id` | Read (with recent executions), replace `{ projectId, definition }`, delete. |
| GET / POST | `/runbooks/:id/executions` | List, or start: `{ network?, deployer?, constructorArgs? }`. |
| GET | `/executions[?limit=]` | Recent executions. |
| GET | `/executions/:id` | Execution (steps, context, report) and logs. |
| POST | `/executions/:id/advance` | Run server-side steps until input is needed. `{ deployer? }` supplies the wallet address for `deploy.prepare`. |
| POST | `/executions/:id/confirm` | `{ stepId }` completes a `human.confirm` step. |
| POST | `/executions/:id/wallet` | `{ stepId, txHash, from }` after the wallet broadcast, or `{ stepId, error: { code?, message } }`. |
| POST | `/executions/:id/retry` | `{ stepId }` retries a failed, retryable step. |
| POST | `/executions/:id/cancel` | Cancel (not possible after a broadcast). |

Execution status: `running`, `awaiting_confirmation`, `awaiting_wallet`, `succeeded`, `failed` or `cancelled`. Step status: `pending`, `running`, `waiting`, `succeeded`, `warning`, `failed` or `skipped`.

## Deployments

| Method | Path | Description |
|---|---|---|
| GET | `/deployments?network=&status=&projectId=&q=` | Search by contract name, address, tx hash or deployer. |
| GET | `/deployments/:id` | Record, project, compiled artifact, source execution. |
| POST | `/deployments/:id/verify` | `{ mode: "submit" \| "check" }` explorer verification. |

## Example: run a Runbook from a script

```bash
BASE=http://localhost:3000/api/v1
EXEC=$(curl -s -X POST $BASE/runbooks/$RUNBOOK_ID/executions -H 'content-type: application/json' -d '{}' | jq -r .execution.id)
curl -s -X POST $BASE/executions/$EXEC/advance -H 'content-type: application/json' -d '{}' | jq '.execution.status, .execution.steps[] | {stepId, status, summary}'
```

A checks-only Runbook (validate, compile, test) runs to completion this way, which makes it usable as a CI gate. Deployment Runbooks stop at the wallet step by design: a person must sign.

## GitHub (non-versioned OAuth endpoints)

`GET /api/github/oauth/start` → GitHub → `GET /api/github/oauth/callback`. The status endpoints are `GET /api/v1/github/status`, `GET /api/v1/github/repos` and `POST /api/v1/github/disconnect`.
