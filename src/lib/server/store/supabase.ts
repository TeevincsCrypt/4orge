import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectionName } from "@/lib/types";
import type { DataStore, ListOptions, NewRow, Patch, Row } from "./types";
import { NotFoundError } from "./types";

/**
 * Supabase (Postgres) storage. The client is authenticated as the end user,
 * so Row Level Security policies (supabase/migrations) are the primary
 * guarantee that users only see their own rows. We additionally filter by
 * owner_id in every query as defence in depth.
 */

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function rowToDb(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined) out[toSnake(k)] = v;
  return out;
}

function rowFromDb<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  return out as T;
}

export class SupabaseStore implements DataStore {
  readonly mode = "supabase" as const;
  constructor(
    readonly ownerId: string,
    private client: SupabaseClient,
  ) {}

  private fail(op: string, collection: string, error: { message: string } | null): never {
    throw new Error(`Database ${op} on ${collection} failed: ${error?.message ?? "unknown error"}`);
  }

  async list<K extends CollectionName>(collection: K, opts: ListOptions<K> = {}): Promise<Row<K>[]> {
    const cols = opts.columns ? opts.columns.map(toSnake).join(",") : "*";
    let q = this.client.from(collection).select(cols).eq("owner_id", this.ownerId);
    for (const [k, v] of Object.entries(rowToDb((opts.where ?? {}) as Record<string, unknown>))) {
      q = v === null ? q.is(k, null) : q.eq(k, v as string);
    }
    if (opts.orderBy) q = q.order(toSnake(opts.orderBy), { ascending: !opts.desc });
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) this.fail("select", collection, error);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => rowFromDb<Row<K>>(r));
  }

  async get<K extends CollectionName>(collection: K, id: string): Promise<Row<K> | null> {
    const { data, error } = await this.client
      .from(collection)
      .select("*")
      .eq("id", id)
      .eq("owner_id", this.ownerId)
      .maybeSingle();
    if (error) this.fail("select", collection, error);
    return data ? rowFromDb<Row<K>>(data as Record<string, unknown>) : null;
  }

  async insert<K extends CollectionName>(collection: K, row: NewRow<K>): Promise<Row<K>> {
    const payload = rowToDb({ ...(row as Record<string, unknown>), ownerId: this.ownerId });
    const { data, error } = await this.client.from(collection).insert(payload).select("*").single();
    if (error) this.fail("insert", collection, error);
    return rowFromDb<Row<K>>(data as Record<string, unknown>);
  }

  async insertMany<K extends CollectionName>(collection: K, rows: NewRow<K>[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => rowToDb({ ...(r as Record<string, unknown>), ownerId: this.ownerId }));
      const { error } = await this.client.from(collection).insert(chunk);
      if (error) this.fail("insert", collection, error);
    }
  }

  async update<K extends CollectionName>(collection: K, id: string, patch: Patch<K>): Promise<Row<K>> {
    const payload = rowToDb(patch as Record<string, unknown>);
    delete payload.id;
    delete payload.owner_id;
    delete payload.created_at;
    payload.updated_at = new Date().toISOString();
    const { data, error } = await this.client
      .from(collection)
      .update(payload)
      .eq("id", id)
      .eq("owner_id", this.ownerId)
      .select("*")
      .maybeSingle();
    if (error) this.fail("update", collection, error);
    if (!data) throw new NotFoundError(`${collection} ${id} not found`);
    return rowFromDb<Row<K>>(data as Record<string, unknown>);
  }

  async remove<K extends CollectionName>(collection: K, where: Partial<Row<K>>): Promise<void> {
    let q = this.client.from(collection).delete().eq("owner_id", this.ownerId);
    for (const [k, v] of Object.entries(rowToDb(where as Record<string, unknown>))) q = q.eq(k, v as string);
    const { error } = await q;
    if (error) this.fail("delete", collection, error);
  }

  async count<K extends CollectionName>(collection: K, where?: Partial<Row<K>>): Promise<number> {
    let q = this.client.from(collection).select("id", { count: "exact", head: true }).eq("owner_id", this.ownerId);
    for (const [k, v] of Object.entries(rowToDb((where ?? {}) as Record<string, unknown>))) q = q.eq(k, v as string);
    const { count, error } = await q;
    if (error) this.fail("count", collection, error);
    return count ?? 0;
  }
}
