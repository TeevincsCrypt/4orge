import { describe, expect, it } from "vitest";
import { createRunbookTemplate, makeStep, parseRunbookText, runbookToYaml, validateRunbook } from "@/lib/runbook/validate";
import { FULL_DEPLOY_SEQUENCE } from "@/lib/runbook/steps";

const base = (steps: unknown[], extra: Record<string, unknown> = {}) => ({
  schema: "4orge.runbook/v1",
  name: "t",
  network: "qie-testnet",
  target: { contract: "Counter", constructorArgs: ["1"] },
  steps,
  ...extra,
});

describe("Runbook validation", () => {
  it("accepts the built-in full deployment template", () => {
    const def = createRunbookTemplate("full-deploy", { name: "Deploy", contract: "Counter", constructorArgs: ["1"] });
    expect(def.steps.map((s) => s.uses)).toEqual(FULL_DEPLOY_SEQUENCE);
    const r = validateRunbook(def);
    expect(r.ok).toBe(true);
  });

  it("defaults to QIE Testnet", () => {
    const def = createRunbookTemplate("checks-only", { name: "c" });
    expect(def.network).toBe("qie-testnet");
  });

  it("rejects step types outside the allowlist (no arbitrary commands)", () => {
    const r = validateRunbook(base([{ id: "x", uses: "shell.exec", with: { cmd: "rm -rf /" } }]));
    expect(r.ok).toBe(false);
  });

  it("rejects unknown keys on steps and the document", () => {
    expect(validateRunbook(base([{ id: "load", uses: "project.load", run: "curl evil" }])).ok).toBe(false);
    expect(validateRunbook({ ...base([{ id: "load", uses: "project.load" }]), script: "x" }).ok).toBe(false);
  });

  it("enforces ordering: deploy.prepare needs network.check and args validation first", () => {
    const r = validateRunbook(base([makeStep("project.load"), makeStep("deploy.prepare")]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.message.includes("network.check"))).toBe(true);
  });

  it("requires every wallet broadcast to be confirmed and recorded", () => {
    const steps = ["project.load", "network.check", "contracts.compile", "deploy.validate-args", "deploy.prepare", "wallet.deploy"].map((t) => makeStep(t as never));
    const r = validateRunbook(base(steps));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.message.includes("tx.confirm"))).toBe(true);
  });

  it("rejects duplicate step ids and duplicate unique steps", () => {
    const r = validateRunbook(base([makeStep("project.load"), { id: "load", uses: "contracts.compile" }]));
    expect(r.ok).toBe(false);
    const r2 = validateRunbook(base([makeStep("project.load"), makeStep("project.load", "load2")]));
    expect(r2.ok).toBe(false);
  });

  it("requires a target when deploying", () => {
    const def = createRunbookTemplate("full-deploy", { name: "Deploy", contract: "Counter" });
    const { target: _t, ...noTarget } = def;
    void _t;
    expect(validateRunbook(noTarget).ok).toBe(false);
  });

  it("warns (not errors) when deploying to mainnet or without tests", () => {
    const def = createRunbookTemplate("full-deploy", { name: "d", contract: "Counter", network: "qie-mainnet" });
    def.steps = def.steps.filter((s) => s.uses !== "contracts.test");
    const r = validateRunbook(def);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings.some((w) => w.message.includes("Mainnet"))).toBe(true);
      expect(r.warnings.some((w) => w.message.includes("without running tests"))).toBe(true);
    }
  });

  it("round-trips through YAML and JSON text", () => {
    const def = createRunbookTemplate("full-deploy", { name: "Y", contract: "Counter", constructorArgs: ["5", true, ["a"]] });
    const yaml = parseRunbookText(runbookToYaml(def));
    expect(yaml.ok && validateRunbook(yaml.value).ok).toBe(true);
    const json = parseRunbookText(JSON.stringify(def));
    expect(json.ok && validateRunbook(json.value).ok).toBe(true);
  });

  it("does not construct objects from YAML tags", () => {
    const r = parseRunbookText("schema: !!js/function 'function(){}'\nname: x");
    if (r.ok) expect(validateRunbook(r.value).ok).toBe(false);
  });

  it("validates step option ranges", () => {
    const def = createRunbookTemplate("full-deploy", { name: "d", contract: "C" });
    const steps = def.steps.map((s) => (s.uses === "tx.confirm" ? { ...s, with: { confirmations: 99 } } : s));
    expect(validateRunbook({ ...def, steps }).ok).toBe(false);
  });
});
