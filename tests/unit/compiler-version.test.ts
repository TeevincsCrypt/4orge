import { describe, expect, it } from "vitest";
import { chooseVersion } from "@/lib/server/compiler/solc-versions";

const available = ["0.8.28", "0.8.24", "0.8.20", "0.7.6", "0.6.12"];

describe("compiler version selection", () => {
  it("picks the newest version satisfying all pragmas", () => {
    expect(chooseVersion(["^0.8.20", ">=0.8.0 <0.9.0"], available, null)).toEqual({ ok: true, version: "0.8.28" });
    expect(chooseVersion(["^0.7.0"], available, null)).toEqual({ ok: true, version: "0.7.6" });
  });
  it("honours a configured version but enforces pragmas", () => {
    expect(chooseVersion(["^0.8.20"], available, "0.8.24")).toEqual({ ok: true, version: "0.8.24" });
    expect(chooseVersion(["^0.8.25"], available, "0.8.24").ok).toBe(false);
  });
  it("reports unsatisfiable pragmas", () => {
    expect(chooseVersion(["^0.8.20", "^0.7.0"], available, null).ok).toBe(false);
  });
});
