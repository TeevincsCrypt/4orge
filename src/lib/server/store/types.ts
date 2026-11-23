import type { CollectionName, Collections } from "@/lib/types";

export type Row<K extends CollectionName> = Collections[K];
export type NewRow<K extends CollectionName> = Omit<Row<K>, "id" | "ownerId" | "createdAt" | "updatedAt"> & {
  id?: string;
};
export type Patch<K extends CollectionName> = Partial<Omit<Row<K>, "id" | "ownerId" | "createdAt">>;

export interface ListOptions<K extends CollectionName> {
  where?: Partial<Row<K>>;
  orderBy?: keyof Row<K> & string;
  desc?: boolean;
  limit?: number;
  /** Restrict returned fields (large columns such as file contents can be skipped). */
  columns?: (keyof Row<K> & string)[];
}

/**
 * Owner-scoped data access. Every implementation MUST restrict reads and
 * writes to records owned by the store's `ownerId`.
 */
export interface DataStore {
  readonly mode: "local" | "supabase";
  readonly ownerId: string;
  list<K extends CollectionName>(collection: K, opts?: ListOptions<K>): Promise<Row<K>[]>;
  get<K extends CollectionName>(collection: K, id: string): Promise<Row<K> | null>;
  insert<K extends CollectionName>(collection: K, row: NewRow<K>): Promise<Row<K>>;
  insertMany<K extends CollectionName>(collection: K, rows: NewRow<K>[]): Promise<void>;
  update<K extends CollectionName>(collection: K, id: string, patch: Patch<K>): Promise<Row<K>>;
  remove<K extends CollectionName>(collection: K, where: Partial<Row<K>>): Promise<void>;
  count<K extends CollectionName>(collection: K, where?: Partial<Row<K>>): Promise<number>;
}

export class NotFoundError extends Error {
  status = 404;
}
