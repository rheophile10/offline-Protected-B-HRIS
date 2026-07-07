// Shared library for the out-of-band merge tool (crdt-sync-spec §8).
// Node-side port of the OHRIS1 crypto envelope + a cr-sqlite helper. Kept in
// lockstep with src/lib/crypto.ts and src/lib/db.ts.
import SQLiteFactory from "@vlcn.io/wa-sqlite/dist/crsqlite.mjs";
import * as SQLite from "@vlcn.io/wa-sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAGIC = "OHRIS1";
const HEADER = 36;
const ITER = 250_000;

// ---- OHRIS1 crypto (mirror of src/lib/crypto.ts) ----
async function deriveKey(pw, salt) {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  const out = new Uint8Array(HEADER + ct.length);
  out.set(new TextEncoder().encode(MAGIC), 0);
  out[6] = 1;
  out.set(salt, 8);
  out.set(iv, 24);
  out.set(ct, HEADER);
  return out;
}
export async function decryptText(bytes, password) {
  if (bytes.length < HEADER) throw new Error("File too small.");
  if (new TextDecoder().decode(bytes.slice(0, 6)) !== MAGIC) throw new Error("Not an OHRIS1 file.");
  const salt = bytes.slice(8, 24), iv = bytes.slice(24, 36), ct = bytes.slice(36);
  const key = await deriveKey(password, salt);
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
  } catch {
    throw new Error("Decryption failed — wrong passphrase or modified file.");
  }
}

// ---- cr-sqlite helper (mirror of the changeset primitives in src/lib/db.ts) ----
const CHANGE_COLS = `"table","pk","cid","val","col_version","db_version","site_id","cl","seq"`;

export async function openDb() {
  const wasmBinary = readFileSync(join(ROOT, "node_modules/@vlcn.io/wa-sqlite/dist/crsqlite.wasm"));
  const mod = await SQLiteFactory({ wasmBinary });
  const s3 = SQLite.Factory(mod);
  const db = await s3.open_v2(":memory:");
  const api = {
    exec: (sql) => s3.exec(db, sql),
    all: async (sql) => {
      const rows = [];
      for await (const stmt of s3.statements(db, sql)) {
        const cols = s3.column_names(stmt);
        while ((await s3.step(stmt)) === SQLite.SQLITE_ROW) {
          const v = s3.row(stmt);
          rows.push(Object.fromEntries(cols.map((c, i) => [c, v[i]])));
        }
      }
      return rows;
    },
    exportChangeset: async (since = -1) => {
      const sql =
        `SELECT 'INSERT INTO crsql_changes(${CHANGE_COLS}) VALUES('||` +
        `quote("table")||','||quote("pk")||','||quote("cid")||','||quote("val")||','||` +
        `quote("col_version")||','||quote("db_version")||','||quote("site_id")||','||` +
        `quote("cl")||','||quote("seq")||');' AS line FROM crsql_changes WHERE db_version > ${since} ORDER BY db_version, seq;`;
      return (await api.all(sql)).map((r) => r.line).join("\n");
    },
    dbVersion: async () => Number((await api.all("SELECT crsql_db_version() AS v"))[0].v),
    finalize: () => s3.exec(db, "SELECT crsql_finalize();"),
  };
  return api;
}

export function readSchema() {
  return readFileSync(join(ROOT, "sql/hris_schema.sql"), "utf8");
}
