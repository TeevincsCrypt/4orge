# Security Policy

4ORGE handles smart-contract source code and prepares blockchain transactions. Security is a core design goal.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private vulnerability reporting ("Security" tab → "Report a vulnerability") on this repository. Include steps to reproduce and the impact. We aim to respond within 72 hours.

## Security model (summary)

See [docs/architecture.md](docs/architecture.md) for details.

- **No keys, ever.** 4ORGE never requests, receives, stores or logs seed phrases or private keys. Every deployment is signed in the user's own wallet after explicit approval there.
- **No blind trust in the client.** A transaction hash reported by the browser is only a pointer. Before a deployment is recorded as successful, the server fetches the transaction and receipt from the chain itself and checks the sender, that it's a contract creation, that the creation data is identical to the prepared bytecode and arguments, the receipt status and the presence of code.
- **Runbooks cannot run code.** Runbooks are validated against a strict schema and an explicit allowlist of step types. Unknown keys and step types are rejected. There is no shell or script step. YAML is parsed with the core schema (no custom tags).
- **Imported code is untrusted.** Config files (`hardhat.config.*`, `foundry.toml`, `package.json`) are read as text and never executed. Dependencies are fetched from integrity-checked npm tarballs with only `.sol`/`package.json` extracted, so install scripts never run. File paths are normalised and traversal is rejected (also by database constraints).
- **Sandboxed builds.** Compilation and tests run in separate processes with timeouts, memory caps, a scrubbed environment (no server secrets), output limits and a server-wide concurrency cap. Tests use a 4ORGE-generated Hardhat config. JavaScript test execution is disabled by default on shared (Supabase) deployments. For multi-tenant hosting, run the worker inside a container/VM sandbox.
- **Data isolation.** In Supabase mode every table has Row Level Security (verified by `tests/sql/run.sh`). Local mode is single-user and refuses non-loopback requests.
- **Web hardening.** Cross-origin state-changing requests are rejected; security headers are set; the GitHub token is AES-256-GCM encrypted in an httpOnly cookie; server errors never leak internals.
- **Mainnet is locked** unless the operator sets `FORGE_ENABLE_MAINNET_DEPLOYMENTS=true`.

## Supported versions

Only the latest `main` branch receives security fixes during the hackathon period.
