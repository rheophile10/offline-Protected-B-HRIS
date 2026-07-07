// In-memory cr-sqlite (wa-sqlite with cr-sqlite baked in). The database lives
// ONLY here, in volatile memory. WASM is passed as an in-memory binary (no
// fetch) so CSP connect-src 'none' holds. See standards.md §1–§2 and
// docs/crdt-sync-spec.md §4.
//
// wa-sqlite exposes ONE connection whose async API does NOT serialize concurrent
// calls — two in-flight queries would clobber each other's statement state. All
// access therefore goes through a single-lane promise queue (`lock`).
import SQLiteFactory from "@vlcn.io/wa-sqlite/dist/crsqlite.mjs";
import * as SQLite from "@vlcn.io/wa-sqlite";
import { sqlWasmBinary } from "./sqlWasm";

type Sqlite3 = any;
type Stmt = number;

let sqlite3: Sqlite3 = null;
let db: number | null = null;

export type SqlValue = string | number | bigint | Uint8Array | null;

// ---- serialization: every DB touch runs one-at-a-time in submission order ----
let tail: Promise<unknown> = Promise.resolve();
function lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function need(): number {
  if (db === null) throw new Error("Database not initialised.");
  return db;
}

export async function initEngine(): Promise<void> {
  const mod = await SQLiteFactory({ wasmBinary: sqlWasmBinary() as unknown as ArrayBuffer });
  sqlite3 = SQLite.Factory(mod);
  db = await sqlite3.open_v2(":memory:");
}

export function hasDb(): boolean {
  return db !== null;
}

/** cr-sqlite requires crsql_finalize() before closing a connection. */
export function finalize(): Promise<void> {
  return lock(async () => {
    if (db !== null) {
      try {
        await sqlite3.exec(db, "SELECT crsql_finalize();");
      } catch {
        /* ignore */
      }
    }
  });
}

/** Replace the current database with a fresh empty one (finalize first). */
export function resetDb(): Promise<void> {
  return lock(async () => {
    if (sqlite3 === null) throw new Error("Engine not initialised.");
    if (db !== null) {
      try {
        await sqlite3.exec(db, "SELECT crsql_finalize();");
      } catch {
        /* ignore */
      }
      await sqlite3.close(db);
    }
    db = await sqlite3.open_v2(":memory:");
  });
}

// ---- internal (unlocked) primitives — never call these while holding `lock` re-entrantly ----
async function _run(sql: string, params?: SqlValue[]): Promise<void> {
  for await (const stmt of sqlite3.statements(need(), sql) as AsyncIterable<Stmt>) {
    if (params) sqlite3.bind_collection(stmt, params);
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      /* drain */
    }
  }
}
async function _all<T>(sql: string, params?: SqlValue[]): Promise<T[]> {
  const rows: T[] = [];
  for await (const stmt of sqlite3.statements(need(), sql) as AsyncIterable<Stmt>) {
    if (params) sqlite3.bind_collection(stmt, params);
    const cols: string[] = sqlite3.column_names(stmt);
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      const values: SqlValue[] = sqlite3.row(stmt);
      const obj: Record<string, SqlValue> = {};
      cols.forEach((c, i) => (obj[c] = values[i]));
      rows.push(obj as unknown as T);
    }
  }
  return rows;
}

// ---- public (locked) API ----
export function runScript(sql: string): Promise<void> {
  return lock(() => sqlite3.exec(need(), sql));
}
export function run(sql: string, params?: SqlValue[]): Promise<void> {
  return lock(() => _run(sql, params));
}
export function all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]> {
  return lock(() => _all<T>(sql, params));
}
export function scalar<T extends SqlValue = SqlValue>(sql: string, params?: SqlValue[]): Promise<T | null> {
  return lock(async () => {
    const rows = await _all<Record<string, SqlValue>>(sql, params);
    if (!rows.length) return null;
    const first = rows[0];
    return (first[Object.keys(first)[0]] as T) ?? null;
  });
}

export interface QueryResult {
  columns: string[];
  values: SqlValue[][];
}

/** Raw multi-result exec for the SQL console. */
export function exec(sql: string): Promise<QueryResult[]> {
  return lock(async () => {
    const results: QueryResult[] = [];
    for await (const stmt of sqlite3.statements(need(), sql) as AsyncIterable<Stmt>) {
      const columns: string[] = sqlite3.column_names(stmt);
      const values: SqlValue[][] = [];
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) values.push(sqlite3.row(stmt));
      if (columns.length) results.push({ columns, values });
    }
    return results;
  });
}

function splitStatements(text: string): string[] {
  const out: string[] = [];
  let start = 0,
    i = 0,
    st = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i],
      c2 = text[i + 1];
    if (st === 0) {
      if (c === "'") st = 1;
      else if (c === '"') st = 2;
      else if (c === "`") st = 3;
      else if (c === "-" && c2 === "-") { st = 4; i++; }
      else if (c === "/" && c2 === "*") { st = 5; i++; }
      else if (c === ";") { out.push(text.slice(start, i)); start = i + 1; }
    } else if (st === 1 && c === "'") st = 0;
    else if (st === 2 && c === '"') st = 0;
    else if (st === 3 && c === "`") st = 0;
    else if (st === 4 && c === "\n") st = 0;
    else if (st === 5 && c === "*" && c2 === "/") { st = 0; i++; }
    i++;
  }
  if (start < n) out.push(text.slice(start));
  return out;
}

/** Lint by preparing each statement (compile only, never executed). */
export function lintScript(sql: string): Promise<string[]> {
  return lock(async () => {
    const errors: string[] = [];
    for (const stmt of splitStatements(sql)) {
      const bare = stmt.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (!bare) continue;
      try {
        for await (const _ of sqlite3.statements(need(), stmt) as AsyncIterable<Stmt>) {
          void _; // prepared (compiled) but never stepped → no execution
        }
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    return errors;
  });
}

// ---------------- CRDT: changesets & watermark (crdt-sync-spec §3, §7) ----------------

const CHANGE_COLS = `"table","pk","cid","val","col_version","db_version","site_id","cl","seq"`;

/** Current local logical clock — the sync watermark. */
export async function dbVersion(): Promise<number> {
  return Number((await scalar<SqlValue>("SELECT crsql_db_version();")) ?? 0);
}

/** This replica's site id (hex), for debugging/attribution. */
export async function siteId(): Promise<string> {
  const q = await scalar<string>("SELECT quote(crsql_site_id());");
  return (q ?? "").replace(/^X'|'$/g, "");
}

/**
 * Export crsql_changes rows with db_version > since as runnable INSERT SQL.
 * SQLite quote() serializes blobs/ints safely as text. since = -1 → full truth;
 * since = watermark → daily delta.
 */
export async function exportChangesetSQL(since: number): Promise<string> {
  const sql =
    `SELECT 'INSERT INTO crsql_changes(${CHANGE_COLS}) VALUES('||` +
    `quote("table")||','||quote("pk")||','||quote("cid")||','||quote("val")||','||` +
    `quote("col_version")||','||quote("db_version")||','||quote("site_id")||','||` +
    `quote("cl")||','||quote("seq")||');' AS line ` +
    `FROM crsql_changes WHERE db_version > ${Number(since)} ORDER BY db_version, seq;`;
  const rows = await all<{ line: string }>(sql);
  return rows.map((r) => r.line).join("\n");
}

/** Apply a changeset produced by exportChangesetSQL. */
export function applyChangesetSQL(sql: string): Promise<void> {
  return sql.trim() ? runScript(sql) : Promise.resolve();
}
