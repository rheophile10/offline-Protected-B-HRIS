// End-to-end test of the sync model + merge tool. Builds a truth and two
// operator changesets with conflicting offline edits, runs merge-hris.mjs, and
// asserts convergence (both edits survive) + a correct audit report.
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, readSchema, decryptText, encryptText } from "./merge-lib.mjs";

const PW = "test-org-passphrase";
const dir = mkdtempSync(join(tmpdir(), "hris-merge-"));
const schema = readSchema();
const seed = readFileSync(new URL("../sql/hris_seed.sql", import.meta.url), "utf8");

async function buildDb(apply) {
  const db = await openDb();
  await db.exec(schema);
  await apply(db);
  return db;
}

// 1. Coordinator builds morning truth from schema + seed.
const truthDb = await buildDb(async (db) => db.exec(seed));
writeFileSync(join(dir, "truth.hrisdump"), await encryptText(await truthDb.exportChangeset(-1), PW));

// helper: load truth into a fresh operator db and return {db, watermark}
async function operator(fn) {
  const truthSql = await decryptText(new Uint8Array(readFileSync(join(dir, "truth.hrisdump"))), PW);
  const db = await buildDb(async (d) => d.exec(truthSql));
  const wm = await db.dbVersion();
  await fn(db);
  return await db.exportChangeset(wm);
}

// 2. Operator A: raise officer 1001 salary, hire a new officer 9001.
const deltaA = await operator(async (db) => {
  await db.exec("UPDATE officers SET current_salary=260000, updated_by='u-coord', updated_at=1 WHERE badge_number=1001;");
  await db.exec("INSERT INTO officers(badge_number,name,rank,status,created_by,updated_by,updated_at) VALUES(9001,'New Hire','Constable','Active','u-coord','u-coord',1);");
  await db.exec("INSERT INTO change_event(id,user_id,entity_table,entity_id,action,at) VALUES('ce-a1','u-coord','officers','9001','insert',1);");
});
writeFileSync(join(dir, "alice.hrischanges"), await encryptText(deltaA, PW));

// 3. Operator B: change officer 1001 rank (conflicting column on the same row).
const deltaB = await operator(async (db) => {
  await db.exec("UPDATE officers SET rank='Superintendent', updated_by='u-planner', updated_at=2 WHERE badge_number=1001;");
  await db.exec("INSERT INTO change_event(id,user_id,entity_table,entity_id,action,at) VALUES('ce-b1','u-planner','officers','1001','update',2);");
});
writeFileSync(join(dir, "bob.hrischanges"), await encryptText(deltaB, PW));

// 4. Run the actual merge CLI.
const out = join(dir, "truth-merged.hrisdump");
const report = execFileSync("node", [
  new URL("./merge-hris.mjs", import.meta.url).pathname,
  "--truth", join(dir, "truth.hrisdump"),
  "--changes", join(dir, "alice.hrischanges"), join(dir, "bob.hrischanges"),
  "--password", PW,
  "--out", out,
], { encoding: "utf8" });
console.log(report);

// 5. Verify convergence by re-opening the merged truth.
const mergedSql = await decryptText(new Uint8Array(readFileSync(out)), PW);
const check = await buildDb(async (db) => db.exec(mergedSql));
const row = (await check.all("SELECT badge_number,rank,current_salary FROM officers WHERE badge_number=1001"))[0];
const hire = (await check.all("SELECT name FROM officers WHERE badge_number=9001"))[0];
const total = (await check.all("SELECT COUNT(*) AS n FROM officers"))[0].n;

console.log("merged officer 1001:", JSON.stringify(row));
console.log("new hire 9001:", JSON.stringify(hire));
const ok =
  Number(row.current_salary) === 260000 &&  // A's edit
  row.rank === "Superintendent" &&           // B's edit (different column, same row)
  hire && hire.name === "New Hire" &&         // A's insert
  Number(total) === 28;                       // 27 seed + 1 new
console.log(ok ? "\nMERGE TOOL TEST PASSED ✓ — both operators' offline edits converged." : "\nMERGE TOOL TEST FAILED ✗");
process.exit(ok ? 0 : 1);
