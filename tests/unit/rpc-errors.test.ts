import { describe, expect, it } from "vitest";
import { describeRpcError } from "@/lib/server/chain";

const wrap = (cause: unknown) => Object.assign(new Error("HTTP request failed."), { shortMessage: "HTTP request failed.", cause });

describe("RPC error descriptions", () => {
  it("explains DNS, refused, reset and timeout failures", () => {
    expect(describeRpcError(wrap(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })))).toMatch(/DNS/);
    expect(describeRpcError(wrap(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })))).toMatch(/refused/);
    expect(describeRpcError(wrap(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } })))).toMatch(/reset/);
    expect(describeRpcError(wrap(Object.assign(new Error("The request took too long"), { name: "TimeoutError" })))).toMatch(/timed out/);
  });
  it("explains HTTP status codes", () => {
    expect(describeRpcError(Object.assign(new Error("HTTP request failed."), { status: 403 }))).toMatch(/403/);
    expect(describeRpcError(Object.assign(new Error("HTTP request failed."), { status: 429 }))).toMatch(/rate limited/);
    expect(describeRpcError(Object.assign(new Error("HTTP request failed."), { status: 502 }))).toMatch(/server/);
  });
});
