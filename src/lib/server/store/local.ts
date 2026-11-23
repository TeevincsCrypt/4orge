import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CollectionName } from "@/lib/types";
import type { DataStore, ListOptions, NewRow, Patch, Row } from "./types";
import { NotFoundError } from "./types";

/**
 * Local development storage: one JSON file per collection under
 * `.forge-data/db/`. This is a single-user, single-process store intended for
 * running 4ORGE on your own machine; it is clearly labelled "Local mode" in
 * the UI and is never presented as cloud persistence.
 */

type Table = Record<string, unknown>[];

interface LocalDb {
  dir: string;
  tables: Map<string, Table>;
  writes: Map<string, Promise<void>>;
}

const globalKey = Symbol.for("4orge.localdb");
type GlobalWithDb = typeof globalThis & { [globalKey]?: LocalDb };

function db(dataDir: string): LocalDb {
  const g = globalThis as GlobalWithDb;
  if (!g[globalKey] || g[globalKey]!.dir !== path.join(dataDir, "db")) {
    g[globalKey] = { dir: path.join(dataDir, "db"), tables: new Map(), writes: new Map() };
  }
  return g[globalKey]!;
}

async function load(d: LocalDb, name: string): Promise<Table> {
  const existing = d.tables.get(name);
  if (existing) return existing;
  let rows: Table = [];
  try {
    rows = JSON.parse(await fs.readFile(path.join(d.dir, `${name}.json`), "utf8")) as Table;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  // Another request may have loaded it while we awaited.
  const raced = d.tables.get(name);
  if (raced) return raced;
  d.tables.set(name, rows);
  return rows;
}

function persist(d: LocalDb, name: string): Promise<void> {
  const prev = d.writes.get(name) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(d.dir, { recursive: true });
      const file = path.join(d.dir, `${name}.json`);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(d.tables.get(name) ?? []), "utf8");
      await fs.rename(tmp, file);
    });
  d.writes.set(name, next);
  return next;
}

function matches(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => v === undefined || row[k] === v);
}

const clone = <T>(v: T): T => structuredClone(v);

export class LocalStore implements DataStore {
  readonly mode = "local" as const;
  constructor(
    readonly ownerId: string,
    private dataDir: string,
  ) {}

  private async table(name: CollectionName) {
    return load(db(this.dataDir), name);
  }

  async list<K extends CollectionName>(collection: K, opts: ListOptions<K> = {}): Promise<Row<K>[]> {
    const rows = (await this.table(collection)).filter(
      (r) => r.ownerId === this.ownerId && matches(r, opts.where as Record<string, unknown>),
    );
    if (opts.orderBy) {
      const key = opts.orderBy;
      rows.sort((a, b) => {
        const av = a[key] as string | number;
        const bv = b[key] as string | number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return opts.desc ? -cmp : cmp;
      });
    }
    const limited = opts.limit ? rows.slice(0, opts.limit) : rows;
    return limited.map((r) => {
      if (!opts.columns) return clone(r);
      const picked: Record<string, unknown> = {};
      for (const c of opts.columns) picked[c] = clone(r[c]);
      return picked;
    }) as unknown as Row<K>[];
  }

  async get<K extends CollectionName>(collection: K, id: string): Promise<Row<K> | null> {
    const row = (await this.table(collection)).find((r) => r.id === id && r.ownerId === this.ownerId);
    return row ? (clone(row) as unknown as Row<K>) : null;
  }

  async insert<K extends CollectionName>(collection: K, row: NewRow<K>): Promise<Row<K>> {
    const now = new Date().toISOString();
    const full = { ...row, id: row.id ?? randomUUID(), ownerId: this.ownerId, createdAt: now, updatedAt: now };
    const table = await this.table(collection);
    table.push(clone(full) as Record<string, unknown>);
    await persist(db(this.dataDir), collection);
    return full as unknown as Row<K>;
  }

  async insertMany<K extends CollectionName>(collection: K, rows: NewRow<K>[]): Promise<void> {
    if (!rows.length) return;
    const now = new Date().toISOString();
    const table = await this.table(collection);
    for (const row of rows) {
      table.push(clone({ ...row, id: row.id ?? randomUUID(), ownerId: this.ownerId, createdAt: now, updatedAt: now }));
    }
    await persist(db(this.dataDir), collection);
  }

  async update<K extends CollectionName>(collection: K, id: string, patch: Patch<K>): Promise<Row<K>> {
    const table = await this.table(collection);
    const row = table.find((r) => r.id === id && r.ownerId === this.ownerId);
    if (!row) throw new NotFoundError(`${collection} ${id} not found`);
    const safe = { ...(patch as Record<string, unknown>) };
    delete safe.id;
    delete safe.ownerId;
    delete safe.createdAt;
    Object.assign(row, clone(safe), { updatedAt: new Date().toISOString() });
    await persist(db(this.dataDir), collection);
    return clone(row) as unknown as Row<K>;
  }

  async remove<K extends CollectionName>(collection: K, where: Partial<Row<K>>): Promise<void> {
    const table = await this.table(collection);
    const keep = table.filter((r) => !(r.ownerId === this.ownerId && matches(r, where as Record<string, unknown>)));
    table.length = 0;
    table.push(...keep);
    await persist(db(this.dataDir), collection);
  }

  async count<K extends CollectionName>(collection: K, where?: Partial<Row<K>>): Promise<number> {
    return (await this.table(collection)).filter(
      (r) => r.ownerId === this.ownerId && matches(r, where as Record<string, unknown>),
    ).length;
  }
}
