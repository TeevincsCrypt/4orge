/**
 * End-to-end test of the complete 4ORGE workflow through the real UI:
 *
 *   create project → compile → test → start deployment → Runbook checks →
 *   human confirmation → wallet network switch → wallet signature →
 *   on-chain receipt validation → deployment record
 *
 * It runs against a REAL local EVM (Hardhat node, chain 31337). The browser
 * wallet is a minimal EIP-6963/EIP-1193 test provider that forwards requests
 * to the node's unlocked dev account — standing in for MetaMask/Rabby, which
 * cannot be automated headlessly. Nothing is mocked on the 4ORGE side.
 *
 * It also proves the server never trusts a wallet-reported hash: submitting
 * the hash of an unrelated transaction makes the execution fail.
 *
 * Usage: npm run test:e2e   (set BASE_URL to reuse a running server that has
 *        FORGE_ENABLE_LOCAL_CHAIN=true; otherwise one is started)
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { chromium } = require("playwright");
const { createPublicClient, http, parseAbi } = await import("viem");

const RPC = "http://127.0.0.1:8545";
const DEV_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat dev account #0 (public test key)
const SHOTS = path.join(root, "docs", "screenshots");
const children = [];
const log = (...a) => console.log("[e2e]", ...a);

function start(cmd, args, env = {}) {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  children.push(child);
  return { child, output: () => out };
}

async function waitFor(fn, label, timeoutMs = 120_000) {
  const t0 = Date.now();
  for (;;) {
    try {
      if (await fn()) return;
    } catch {
      /* keep waiting */
    }
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function rpc(method, params = []) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await res.json();
  if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
  return j.result;
}

function cleanup() {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      /* gone */
    }
  }
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  // 1. Local chain
  const chain = start(process.execPath, ["runner/node_modules/hardhat/dist/src/cli.js", "node", "--config", "runner/chain/hardhat.config.ts"]);
  await waitFor(async () => (await rpc("eth_chainId")) === "0x7a69", "local Hardhat node", 60_000).catch((e) => {
    console.error(chain.output());
    throw e;
  });
  log("local chain ready (31337)");

  // 2. 4ORGE server
  let base = process.env.BASE_URL;
  if (!base) {
    rmSync(path.join(root, ".forge-e2e-data"), { recursive: true, force: true });
    const port = process.env.E2E_PORT ?? "3100";
    const server = start(process.execPath, ["node_modules/next/dist/bin/next", process.env.E2E_PROD ? "start" : "dev", "-p", port], {
      FORGE_ENABLE_LOCAL_CHAIN: "true",
      FORGE_DATA_DIR: ".forge-e2e-data",
      NEXT_TELEMETRY_DISABLED: "1",
    });
    base = `http://localhost:${port}`;
    await waitFor(async () => (await fetch(`${base}/api/v1/config`)).ok, "4ORGE server", 120_000).catch((e) => {
      console.error(server.output());
      throw e;
    });
  }
  log("4ORGE server ready at", base);

  // 3. Browser with an injected EIP-6963 test wallet
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.exposeBinding("__e2eRpc", async (_src, method, params) => {
    try {
      return { result: await rpc(method, params) };
    } catch (e) {
      return { error: { code: e.code ?? -32603, message: e.message } };
    }
  });
  await context.addInitScript(({ account }) => {
    let chainId = "0x7bf"; // starts on QIE Testnet (1983) to exercise the network-switch flow
    const listeners = {};
    const emit = (ev, v) => (listeners[ev] || []).forEach((f) => f(v));
    const provider = {
      isE2E: true,
      on: (ev, f) => ((listeners[ev] ||= []).push(f), provider),
      removeListener: (ev, f) => ((listeners[ev] = (listeners[ev] || []).filter((x) => x !== f)), provider),
      async request({ method, params }) {
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return [account];
          case "eth_chainId":
            return chainId;
          case "wallet_switchEthereumChain":
            if (params[0].chainId.toLowerCase() === "0x7a69") {
              chainId = "0x7a69";
              emit("chainChanged", chainId);
              return null;
            }
            throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
          case "wallet_addEthereumChain":
          case "wallet_revokePermissions":
            return null;
          default: {
            if (method === "eth_sendTransaction" && chainId !== "0x7a69") throw Object.assign(new Error("wrong chain"), { code: -32000 });
            const r = await window.__e2eRpc(method, params ?? []);
            if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
            return r.result;
          }
        }
      },
    };
    const info = { uuid: "e2e-wallet", name: "E2E Test Wallet", icon: "", rdns: "dev.4orge.e2e" };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  }, { account: DEV_ACCOUNT });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.setDefaultTimeout(60_000);

  // 4. Create a project from the Counter template
  await page.goto(`${base}/projects/new`);
  await page.getByLabel("Project name").fill("E2E Counter");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  const projectId = page.url().match(/projects\/([0-9a-f-]{36})/)[1];
  log("project created", projectId);

  // 5. Compile
  await page.getByRole("tab", { name: /Build/ }).click();
  await page.getByRole("button", { name: "Compile", exact: true }).click();
  await page.getByText("Compiled without errors or warnings.").waitFor({ timeout: 180_000 });
  await page.screenshot({ path: path.join(SHOTS, "build.png") });
  log("compiled");

  // 6. Test
  await page.getByRole("tab", { name: /Tests/ }).click();
  await page.getByRole("button", { name: "Run tests" }).click();
  await page.getByText(/6 passed · 0 failed/).waitFor({ timeout: 240_000 });
  await page.screenshot({ path: path.join(SHOTS, "tests.png") });
  log("tests passed (6)");

  // 7. Connect the wallet and start a deployment to the local chain
  await page.goto(`${base}/deploy?projectId=${projectId}`);
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: "E2E Test Wallet" }).click();
  await page.locator("#arg-0").fill("7");
  await page.getByRole("button", { name: /Local Hardhat/ }).click();
  await page.screenshot({ path: path.join(SHOTS, "deploy-wizard.png") });
  await page.getByRole("button", { name: "Create Runbook & start" }).click();
  await page.waitForURL(/\/executions\//);
  const execUrl = page.url();
  log("execution started", execUrl);

  // 8. Automated checks run, then the human-confirmation gate
  await page.getByText("Review before signing").waitFor({ timeout: 300_000 });
  await page.screenshot({ path: path.join(SHOTS, "execution-review.png"), fullPage: true });
  await page.getByRole("button", { name: /I have reviewed this/ }).click();

  // 9. Wallet step: wrong network → switch → sign
  await page.getByText("Wallet approval required").waitFor();
  await page.getByText("Wrong network in wallet").waitFor();
  await page.getByRole("button", { name: "Switch wallet to Local Hardhat" }).first().click();
  await page.getByRole("button", { name: "Sign & deploy with wallet" }).click();
  await page.getByText(/deployed and confirmed on Local Hardhat/).waitFor({ timeout: 180_000 });
  await page.screenshot({ path: path.join(SHOTS, "execution-success.png"), fullPage: true });

  // 10. Independently verify on-chain
  const execId = execUrl.split("/").pop();
  const exec = await (await fetch(`${base}/api/v1/executions/${execId}`)).json();
  const address = exec.execution.context.contractAddress;
  if (exec.execution.status !== "succeeded") throw new Error(`execution status ${exec.execution.status}`);
  const client = createPublicClient({ transport: http(RPC) });
  const code = await client.getCode({ address });
  const count = await client.readContract({ address, abi: parseAbi(["function count() view returns (uint256)"]), functionName: "count" });
  if (!code || code === "0x") throw new Error("no code at deployed address");
  if (count !== 7n) throw new Error(`count() returned ${count}, expected 7`);
  log(`deployed Counter at ${address}; on-chain count() = ${count}`);

  const dep = await (await fetch(`${base}/api/v1/deployments/${exec.execution.context.deploymentId}`)).json();
  if (dep.deployment.status !== "confirmed" || dep.deployment.contractAddress !== address) throw new Error("deployment record mismatch");
  await page.goto(`${base}/deployments/${dep.deployment.id}`);
  await page.getByText("On-chain record").waitFor();
  await page.screenshot({ path: path.join(SHOTS, "deployment-record.png"), fullPage: true });
  log("deployment record confirmed");

  // 11. Security: a forged/unrelated tx hash must be rejected by on-chain validation.
  const runbookId = exec.execution.runbookId;
  const post = (p, body) => fetch(`${base}/api/v1${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  let e2 = (await post(`/runbooks/${runbookId}/executions`, { deployer: DEV_ACCOUNT })).execution;
  for (let i = 0; i < 10 && e2.status === "running"; i++) e2 = (await post(`/executions/${e2.id}/advance`, { deployer: DEV_ACCOUNT })).execution;
  if (e2.status !== "awaiting_confirmation") throw new Error(`expected awaiting_confirmation, got ${e2.status}`);
  e2 = (await post(`/executions/${e2.id}/confirm`, { stepId: "confirm" })).execution;
  const transferHash = await rpc("eth_sendTransaction", [{ from: DEV_ACCOUNT, to: "0x000000000000000000000000000000000000dEaD", value: "0x1" }]);
  e2 = (await post(`/executions/${e2.id}/wallet`, { stepId: "sign", txHash: transferHash, from: DEV_ACCOUNT })).execution;
  for (let i = 0; i < 10 && e2.status === "running"; i++) e2 = (await post(`/executions/${e2.id}/advance`, {})).execution;
  const receiptStep = e2.steps.find((s) => s.uses === "tx.confirm");
  if (e2.status !== "failed" || !/not a contract creation/.test(receiptStep.error ?? "")) {
    throw new Error(`forged hash was not rejected: ${e2.status} ${receiptStep.error}`);
  }
  log("forged transaction hash correctly rejected:", receiptStep.error);

  // 12. Visit main pages for runtime errors
  for (const p of ["/", "/dashboard", "/projects", "/runbooks", "/deployments", "/contracts", "/network", "/settings", "/docs", "/docs/runbooks"]) {
    await page.goto(`${base}${p}`);
    await page.waitForTimeout(1200);
  }
  await page.goto(`${base}/dashboard`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, "dashboard.png") });
  await page.goto(`${base}/`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS, "landing.png") });
  if (errors.length) throw new Error(`Page errors:\n${errors.join("\n")}`);

  await browser.close();
  log("✔ end-to-end deployment flow passed");
}

main()
  .then(() => {
    cleanup();
    process.exit(0);
  })
  .catch((e) => {
    console.error("[e2e] ✖", e.message);
    cleanup();
    process.exit(1);
  });
