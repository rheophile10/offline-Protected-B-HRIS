# Offline HRIS (Protected B)

> ⚠️ **Proof of concept.** This is an exploratory prototype, not a
> production-authorized system. It has **not** undergone a Privacy Impact
> Assessment, threat/risk assessment, or security authorization, and must not be
> used with real personnel data. See [standards.md](./standards.md) §10 and the
> governance checklist before any operational use.
>
> 🔌 **Designed to run offline.** The app is a single self-contained
> `index.html` meant to be **downloaded and opened locally** (`file://`) — no
> server, no network. It even forbids network access at runtime
> (CSP `connect-src 'none'`). Any hosted demo is for convenience only; the
> intended deployment is fully offline on a controlled machine.
>
> 🧪 **All data is fictional.** The bundled dataset (a "Juárez Police Department"
> with sample officers, badges, salaries, positions, and neighbourhoods) is
> **entirely synthetic and invented for demonstration**. Names, badge numbers,
> and pay figures do **not** represent real people or units; any resemblance is
> coincidental.

A fully offline HR information system for a (fictional) municipal police
department, built as a **single self-contained `index.html`**. It runs
**cr-sqlite** (SQLite + CRDT) in the browser via WebAssembly, stores nothing in
plaintext, cannot talk to the network, and lets multiple planners work offline
and **merge without conflicts**.

Binding rules: **[standards.md](./standards.md)**. Detailed sync design and
compliance: **[docs/](./docs)** (crdt-sync-spec, app-development-requirements,
governance-procedure-requirements — untracked, local only).

## What it does

- **Dashboard** — headcount, budget, vacancy deficit, payroll, rank distribution.
- **Officers / Positions / Assignments** — full CRUD; staffing gaps compute live;
  every change is attributed and audited.
- **SQL Console** — arbitrary SQL with engine-based lint; results export as
  **encrypted** `.csv.enc` only.
- **Data & Security** — export encrypted delta (`.hrischanges`) or full truth
  (`.hrisdump`), decrypt a file, view the audit log, lock the session.

## Security model (summary)

- **Everything at rest is encrypted** — AES-256-GCM, PBKDF2-SHA-256 (250k iters),
  non-extractable keys, per-file salt+IV. The live DB is memory-only. No plaintext
  `.sqlite`/`.csv` export exists.
- **No exfiltration** — strict CSP (`connect-src 'none'`) blocks every network API;
  the WASM is inlined and never fetched, so that CSP holds.
- **No XSS sinks** — React auto-escaping; parameterised SQL; serialized DB access.
- **Protected B** personnel data; user gate + `change_event`/`session_log` audit.

## CRDT multi-operator sync

1. **Morning** — coordinator distributes an encrypted `truth-YYYYMMDD.hrisdump`
   + the day's passphrase.
2. **Operators** — open the truth, pick their identity, work offline. At end of
   day: **Export my changes** → encrypted `lastname-YYYYMMDD.hrischanges`.
3. **Evening** — coordinator merges everyone's deltas into a new truth:

   ```bash
   node scripts/merge-hris.mjs \
     --truth   truth-YYYYMMDD.hrisdump \
     --changes alice.hrischanges bob.hrischanges \
     --password <org-passphrase> \
     --out     truth-YYYYMMDD-merged.hrisdump
   ```

   cr-sqlite converges divergent edits deterministically (order-independent) and
   the tool prints a per-operator audit report.

## Usage

Open `dist/index.html` in a modern browser (double-click; no server).

- **Demo data** — pick a passphrase and explore with the built-in roster + demo
  operators (not for production data).
- **Open truth** — schema `.sql` (optional) + encrypted `.hrisdump` + passphrase.
- **New blank** — schema only + passphrase.

Save with **Export my changes** before locking or closing — unsaved work is lost
by design (no plaintext at rest).

## Build & test

```bash
npm install
npm run build       # → dist/index.html (single file, fully inlined)
npm run dev         # dev server with HMR
npm run test:merge  # end-to-end CRDT merge convergence test (Node)
```

`scripts/gen-wasm.mjs` inlines the cr-sqlite WASM as base64 at build time so the
engine loads from memory (no fetch → CSP-safe).

## Layout

```
sql/hris_schema.sql   CRR schema + reference data (loaded each session)
sql/hris_seed.sql     demo/bootstrap rows (operators, roster, assignments)
src/lib/crypto.ts     AES-GCM / PBKDF2, non-extractable keys
src/lib/db.ts         cr-sqlite wrapper (serialized), changeset export/apply, lint
src/lib/session.ts    load truth / export changes / lock orchestration
src/lib/identity.ts   operator identity (attribution)
src/lib/audit.ts      change_event + session_log writers
src/lib/hris.ts       domain queries + audited mutations
src/screens/*.tsx     SessionGate, UserGate, Dashboard, Officers, Positions,
                      Assignments, SqlConsole, Security
scripts/merge-hris.mjs   out-of-band coordinator merge tool (Node)
scripts/test-merge.mjs   convergence test
standards.md          binding engineering & security standards
docs/                 sync spec, app requirements, governance (local, untracked)
```

## Data model

Built from `docs/source-spreadsheet.xlsx` (Positions / Officers / Assignments).
CRR tables (`positions`, `officers`, `assignments`, `app_user`, `change_event`,
`session_log`) sync via changesets; `ranks`/`detachments` are read-only reference
data seeded in the schema. Proposed extensions:
[docs/roadmap-tables-and-screens.md](./docs/roadmap-tables-and-screens.md).
