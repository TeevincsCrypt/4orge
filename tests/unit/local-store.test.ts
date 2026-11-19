import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalStore } from "@/lib/server/store/local";

const dir = mkdtempSync(path.join(os.tmpdir(), "4orge-store-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const settings = { defaultNetwork: "qie-testnet" as const, rpcOverrides: {}, requireTestsBeforeDeploy: true };

describe("local store ownership isolation", () => {
  const alice = new LocalStore("alice", dir);
  const bob = new LocalStore("bob", dir);
  it("never returns or modifies another owner's rows", async () => {
    const row = await alice.insert("user_settings", settings);
    expect(await bob.get("user_settings", row.id)).toBeNull();
    expect(await bob.list("user_settings")).toEqual([]);
    await expect(bob.update("user_settings", row.id, { defaultNetwork: "qie-mainnet" })).rejects.toThrow();
    await bob.remove("user_settings", { id: row.id });
    expect((await alice.get("user_settings", row.id))?.defaultNetwork).toBe("qie-testnet");
  });
  it("ignores attempts to overwrite ownership fields", async () => {
    const row = await alice.insert("user_settings", settings);
    const updated = await alice.update("user_settings", row.id, { ownerId: "bob" } as never);
    expect(updated.ownerId).toBe("alice");
  });
  it("persists to disk", async () => {
    const fresh = new LocalStore("alice", dir);
    expect((await fresh.list("user_settings")).length).toBeGreaterThan(0);
  });
});
