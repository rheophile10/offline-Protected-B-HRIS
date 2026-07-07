#!/usr/bin/env node
// Out-of-band merge tool (crdt-sync-spec §8). Runs OUTSIDE the operator browser
// build. Converges a morning truth with N operator changesets into a new truth,
// and prints an audit report.
//
//   node scripts/merge-hris.mjs \
//     --truth truth.hrisdump \
//     --changes alice.hrischanges bob.hrischanges \
//     --password <org-passphrase> \
//     --out truth-merged.hrisdump
import { readFileSync, writeFileSync } from "node:fs";
import { openDb, readSchema, decryptText, encryptText } from "./merge-lib.mjs";

function parseArgs(argv) {
  const a = { changes: [] };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--truth") a.truth = argv[++i];
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--password") a.password = argv[++i];
    else if (k === "--changes") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) a.changes.push(argv[++i]);
    }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.truth || !args.password || !args.out) {
    console.error("Usage: merge-hris.mjs --truth <f.hrisdump> --changes <a.hrischanges ...> --password <pw> --out <f.hrisdump>");
    process.exit(2);
  }
  const db = await openDb();
  await db.exec(readSchema());

  const truthSql = await decryptText(new Uint8Array(readFileSync(args.truth)), args.password);
  await db.exec(truthSql);
  console.log(`Loaded truth: ${args.truth}`);

  for (const f of args.changes) {
    const sql = await decryptText(new Uint8Array(readFileSync(f)), args.password);
    if (sql.trim()) await db.exec(sql);
    console.log(`Applied changes: ${f} (${sql.split("\n").filter(Boolean).length} rows)`);
  }

  // ---- merge report ----
  const officers = (await db.all("SELECT COUNT(*) AS n FROM officers"))[0].n;
  const assignments = (await db.all("SELECT COUNT(*) AS n FROM assignments"))[0].n;
  const byUser = await db.all(
    "SELECT user_id, COUNT(*) AS n FROM change_event GROUP BY user_id ORDER BY n DESC",
  );
  const sessions = await db.all(
    "SELECT user_id, event, COUNT(*) AS n FROM session_log GROUP BY user_id, event ORDER BY user_id",
  );

  console.log("\n──────── MERGE REPORT ────────");
  console.log(`officers: ${officers}   assignments: ${assignments}`);
  console.log("changes by operator:");
  for (const r of byUser) console.log(`  ${r.user_id || "(unattributed)"}: ${r.n}`);
  console.log("session events:");
  for (const r of sessions) console.log(`  ${r.user_id || "(none)"} ${r.event}: ${r.n}`);
  console.log("──────────────────────────────\n");

  const merged = await db.exportChangeset(-1);
  await db.finalize();
  writeFileSync(args.out, await encryptText(merged, args.password));
  console.log(`Wrote new truth: ${args.out}`);
}

main().catch((e) => {
  console.error("Merge failed:", e.message);
  process.exit(1);
});
