// Session orchestration for the CRDT model (crdt-sync-spec §7,
// app-development-requirements §6). Truth = full changeset; operator save =
// delta changeset since the morning watermark. Everything persisted is encrypted.
import {
  applyChangesetSQL,
  dbVersion,
  exportChangesetSQL,
  finalize,
  initEngine,
  hasDb,
  resetDb,
  runScript,
} from "./db";
import { decryptText, encryptText, lock, setPassphrase } from "./crypto";
import { clearUser } from "./identity";
import { logSession } from "./audit";
import { download } from "./files";
import schemaSql from "../../sql/hris_schema.sql?raw";
import seedSql from "../../sql/hris_seed.sql?raw";

export const SCHEMA_SQL = schemaSql;
export const SEED_SQL = seedSql;
export const DUMP_EXT = "hrisdump";
export const CHANGES_EXT = "hrischanges";

// Session-scoped, module-private (not persisted, not on window).
let morningWatermark = 0;
let dayId: string | null = null;

export function getDayId(): string | null {
  return dayId;
}
export function getWatermark(): number {
  return morningWatermark;
}

export async function boot(): Promise<void> {
  if (!hasDb()) await initEngine();
}

async function afterLoad(password: string, importDetails: string | null): Promise<void> {
  setPassphrase(password);
  morningWatermark = await dbVersion();
  await logSession("session_open", importDetails, dayId);
  if (importDetails) await logSession("dump_import", importDetails, dayId);
}

/** Fresh empty DB + schema; no operator rows. */
export async function startFromSchema(schema: string, password: string): Promise<void> {
  await resetDb();
  await runScript(schema);
  await afterLoad(password, null);
}

/** Schema + built-in demo data (plaintext seed). Evaluation only. */
export async function startWithDemo(password: string): Promise<void> {
  await resetDb();
  await runScript(SCHEMA_SQL);
  await runScript(SEED_SQL);
  dayId = "demo";
  await afterLoad(password, "demo");
}

/** Schema + decrypted truth changeset. The normal way to open a saved session. */
export async function startFromEncrypted(
  schema: string,
  dumpBytes: Uint8Array,
  password: string,
  filename?: string,
): Promise<void> {
  const changeset = await decryptText(dumpBytes, password); // throws on wrong password
  await resetDb();
  await runScript(schema);
  await applyChangesetSQL(changeset);
  await afterLoad(password, filename ?? "truth");
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** Full truth dump = complete changeset (db_version > -1), encrypted. */
export async function exportTruthDump(): Promise<void> {
  const changeset = await exportChangesetSQL(-1);
  const bytes = await encryptText(changeset);
  download(bytes, `truth-${today()}.${DUMP_EXT}`, "application/octet-stream");
  await logSession("dump_export", `truth-${today()}.${DUMP_EXT}`, dayId);
}

/** Operator delta = changeset since the morning watermark, encrypted. */
export async function exportChanges(operatorLabel: string): Promise<{ empty: boolean }> {
  const changeset = await exportChangesetSQL(morningWatermark);
  const bytes = await encryptText(changeset);
  const safe = (operatorLabel || "operator").replace(/[^\w.-]+/g, "_");
  download(bytes, `${safe}-${today()}.${CHANGES_EXT}`, "application/octet-stream");
  await logSession("changes_export", `${safe}-${today()}.${CHANGES_EXT}`, dayId);
  return { empty: changeset.trim().length === 0 };
}

/** Encrypt arbitrary text (e.g. CSV) and download as *.enc. */
export async function exportEncrypted(text: string, filename: string): Promise<void> {
  const bytes = await encryptText(text);
  download(bytes, filename.endsWith(".enc") ? filename : filename + ".enc", "application/octet-stream");
}

/** Decrypt a *.enc / *.hrisdump / *.hrischanges file back to plaintext (utility). */
export function decryptToText(bytes: Uint8Array, password: string): Promise<string> {
  return decryptText(bytes, password);
}

/** Wipe key material, passphrase, identity, and the database from memory. */
export async function lockSession(): Promise<void> {
  try {
    await logSession("session_lock", null, dayId);
  } catch {
    /* best effort */
  }
  await finalize();
  await resetDb();
  lock();
  clearUser();
  morningWatermark = 0;
  dayId = null;
}
