import { describe, expect, it } from "vitest";
import { SupabaseStore } from "@/lib/server/store/supabase";

/** Minimal chainable fake of the supabase-js query builder that records calls. */
function fakeClient(result: unknown = []) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const client = {
    from(table: string) {
      const entry = { table, ops: [] as [string, unknown[]][] };
      calls.push(entry);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "delete", "eq", "is", "order", "limit", "single", "maybeSingle"]) {
        builder[op] = (...args: unknown[]) => {
          entry.ops.push([op, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => void) => {
        const single = entry.ops.some(([o]) => o === "single" || o === "maybeSingle");
        resolve({ data: single ? (Array.isArray(result) ? result[0] ?? null : result) : result, error: null, count: 0 });
      };
      return builder;
    },
  };
  return { client: client as never, calls };
}

describe("SupabaseStore", () => {
  it("maps camelCase fields to snake_case columns and always scopes by owner", async () => {
    const { client, calls } = fakeClient([{ id: "d1", owner_id: "u1", contract_address: "0xabc", tx_hash: "0x1", constructor_args_encoded: "0x", created_at: "t" }]);
    const store = new SupabaseStore("u1", client);
    const rows = await store.list("deployments", { where: { projectId: "p1", contractAddress: null }, orderBy: "createdAt", desc: true, limit: 5 });
    expect(calls[0].table).toBe("deployments");
    expect(calls[0].ops).toEqual([
      ["select", ["*"]],
      ["eq", ["owner_id", "u1"]],
      ["eq", ["project_id", "p1"]],
      ["is", ["contract_address", null]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [5]],
    ]);
    expect(rows[0]).toMatchObject({ id: "d1", ownerId: "u1", contractAddress: "0xabc", constructorArgsEncoded: "0x", createdAt: "t" });
  });

  it("inserts with owner_id and snake_case keys, leaving timestamps to the database", async () => {
    const { client, calls } = fakeClient({ id: "f1", owner_id: "u1", project_id: "p1", path: "a.sol", sha256: "h" });
    const store = new SupabaseStore("u1", client);
    await store.insert("project_files", { projectId: "p1", path: "a.sol", content: "x", size: 1, sha256: "h" });
    const [, args] = calls[0].ops.find(([o]) => o === "insert")!;
    expect(args[0]).toEqual({ project_id: "p1", path: "a.sol", content: "x", size: 1, sha256: "h", owner_id: "u1" });
  });

  it("never lets an update change ownership or identity", async () => {
    const { client, calls } = fakeClient({ id: "s1", owner_id: "u1" });
    const store = new SupabaseStore("u1", client);
    await store.update("user_settings", "s1", { defaultNetwork: "qie-mainnet", ownerId: "u2", id: "x" } as never);
    const [, args] = calls[0].ops.find(([o]) => o === "update")!;
    const payload = args[0] as Record<string, unknown>;
    expect(payload.default_network).toBe("qie-mainnet");
    expect(payload).not.toHaveProperty("owner_id");
    expect(payload).not.toHaveProperty("id");
    expect(calls[0].ops).toContainEqual(["eq", ["owner_id", "u1"]]);
  });

  it("selects requested columns in snake_case", async () => {
    const { client, calls } = fakeClient([]);
    await new SupabaseStore("u1", client).list("builds", { columns: ["id", "compilerVersion", "inputHash"] });
    expect(calls[0].ops[0]).toEqual(["select", ["id,compiler_version,input_hash"]]);
  });
});

describe("SupabaseStore permission errors", () => {
  it("turns 'permission denied' into a clear, actionable error", async () => {
    const client = {
      from: () => {
        const b: Record<string, unknown> = {};
        for (const op of ["select", "eq", "order", "limit"]) b[op] = () => b;
        b.then = (resolve: (v: unknown) => void) =>
          resolve({ data: null, error: { code: "42501", message: "permission denied for table projects" } });
        return b;
      },
    };
    const store = new SupabaseStore("u1", client as never);
    await expect(store.list("projects")).rejects.toMatchObject({ code: "database_permissions_missing", status: 503 });
  });
});
