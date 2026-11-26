import { afterEach, describe, expect, it, vi } from "vitest";
import { collectQieNames, normalizeQieName, parseConstructorArgs } from "@/lib/abi-args";
import { resolveQieName, resolverUrl } from "@/lib/server/qie-id";
import type { AbiItem } from "@/lib/types";

const ABI: AbiItem[] = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "admins", type: "address[]" },
      { name: "cap", type: "uint256" },
    ],
  },
];
const ALICE = "0x172083F7f31f82e4B57bA8aCf9822C72BB35b174";
const BOB = "0xF1cB000000000000000000000000000000000c17A".slice(0, 42);

describe("QIE IDs in constructor arguments", () => {
  it("normalizes names and rejects malformed ones", () => {
    expect(normalizeQieName("  Alice.QIE ")).toBe("alice.qie");
    expect(normalizeQieName("a b.qie")).toBeNull();
    expect(normalizeQieName(".qie")).toBeNull();
    expect(normalizeQieName("alice.eth")).toBeNull();
  });

  it("collects the names used in address positions only", () => {
    expect(collectQieNames(ABI, ["Alice.qie", ["bob.qie", ALICE, "alice.qie"], "1"]).sort()).toEqual(["alice.qie", "bob.qie"]);
    // A string argument that happens to end in .qie is not a name lookup.
    const strAbi: AbiItem[] = [{ type: "constructor", stateMutability: "nonpayable", inputs: [{ name: "label", type: "string" }] }];
    expect(collectQieNames(strAbi, ["shop.qie"])).toEqual([]);
  });

  it("accepts unresolved names in the form, but never encodes one without its pinned address", () => {
    expect(parseConstructorArgs(ABI, ["alice.qie", [], "1"], { allowUnresolvedNames: true }).ok).toBe(true);
    const strict = parseConstructorArgs(ABI, ["alice.qie", [], "1"]);
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.errors[0].message).toContain("has not been resolved");
  });

  it("substitutes the pinned addresses, mixed freely with 0x addresses", () => {
    const r = parseConstructorArgs(ABI, ["ALICE.qie", ["bob.qie", ALICE], "7"], { names: { "alice.qie": ALICE.toLowerCase(), "bob.qie": BOB } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values).toEqual([ALICE, [expect.stringMatching(/^0x[0-9a-fA-F]{40}$/), ALICE], 7n]);
  });

  it("explains what an address field accepts", () => {
    const r = parseConstructorArgs(ABI, ["nope", [], "1"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toContain("QIE ID (name.qie)");
  });
});

describe("QIE ID resolver (QIE Wallet MCP)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FORGE_QIE_ID_RESOLVER_URL;
  });

  const reply = (structuredContent: unknown, sse = false) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent } });
    return new Response(sse ? `event: message\ndata: ${body}\n\n` : body, { status: 200 });
  };

  it("calls qie_resolve_name on the right network and checksums the answer", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ address: ALICE.toLowerCase() }));
    await expect(resolveQieName("Alice.qie", "qie-mainnet")).resolves.toBe(ALICE);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("https://mcp.qie.digital/mcp");
    expect(JSON.parse(String(init!.body))).toMatchObject({ method: "tools/call", params: { name: "qie_resolve_name", arguments: { name: "alice.qie", network: "mainnet" } } });
  });

  it("reads server-sent event answers and uses the testnet registry on testnet", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ address: ALICE }, true));
    await expect(resolveQieName("alice.qie", "qie-testnet")).resolves.toBe(ALICE);
    expect(JSON.parse(String(spy.mock.calls[0][1]!.body)).params.arguments.network).toBe("testnet");
  });

  it("treats an empty or zero address as not registered", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(reply({ address: null })).mockResolvedValueOnce(reply({ address: "0x0000000000000000000000000000000000000000" }));
    await expect(resolveQieName("ghost.qie", "qie-mainnet")).resolves.toBeNull();
    await expect(resolveQieName("ghost.qie", "qie-mainnet")).resolves.toBeNull();
  });

  it("never mistakes an outage or a bad answer for a result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("busy", { status: 503 })).mockResolvedValueOnce(reply({ address: "not-an-address" })).mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(resolveQieName("alice.qie", "qie-mainnet")).rejects.toThrow("HTTP 503");
    await expect(resolveQieName("alice.qie", "qie-mainnet")).rejects.toThrow("invalid address");
    await expect(resolveQieName("alice.qie", "qie-mainnet")).rejects.toThrow("could not be reached");
  });

  it("refuses the local chain and malformed names without calling out", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(resolveQieName("alice.qie", "local-hardhat")).rejects.toThrow("only exist on QIE Mainnet and QIE Testnet");
    await expect(resolveQieName("a b.qie", "qie-mainnet")).rejects.toThrow("not a valid QIE ID");
    expect(spy).not.toHaveBeenCalled();
  });

  it("only accepts an https override (or http on localhost)", () => {
    process.env.FORGE_QIE_ID_RESOLVER_URL = "http://evil.example/mcp";
    expect(resolverUrl()).toBe("https://mcp.qie.digital/mcp");
    process.env.FORGE_QIE_ID_RESOLVER_URL = "http://127.0.0.1:4555/mcp";
    expect(resolverUrl()).toBe("http://127.0.0.1:4555/mcp");
  });
});
