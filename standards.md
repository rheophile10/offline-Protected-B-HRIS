# Offline HRIS — Engineering & Security Standards

This document is **binding** on all code in this repository. Every change must
comply. When a requirement here conflicts with convenience, the requirement wins.

---

## 1. Product shape

- The application ships as **one self-contained `index.html`** produced by
  `vite build`. It must run by opening the file directly (`file://`) with **no
  server, no network, and no external assets**.
- All third-party code (React, cr-sqlite / wa-sqlite, the SQLite WASM binary) is
  **inlined** at build time. Nothing is fetched at runtime.
- The database engine is **cr-sqlite** (SQLite + CRDT extension, compiled into
  wa-sqlite). The WASM is passed to the engine as an in-memory `wasmBinary`
  (never fetched), which is what lets CSP `connect-src 'none'` hold (§4).

## 2. Data-at-rest — everything is encrypted

> **Rule:** No plaintext data belonging to the organisation is ever written to
> disk, `localStorage`, `sessionStorage`, IndexedDB, cookies, or any file the
> app produces.

- The live database exists **only in volatile memory** (the cr-sqlite instance).
  cr-sqlite shadow/clock tables live in that same memory DB; they are never
  persisted except inside an encrypted changeset.
- The persistence artifacts are all **AES-256-GCM ciphertext**:
  - `*.hrisdump` — a **full truth** snapshot (the complete CRDT changeset).
  - `*.hrischanges` — an operator's **delta changeset** since the morning
    watermark (the normal end-of-day save; see §9).
  - `*.csv.enc` — encrypted query-result exports (never plain `.csv`).
  - Plain `.sqlite` / plain `.csv` export paths are **prohibited** and must not
    exist in the UI or code.
- **Structure is not data.** The schema (`hris_schema.sql`) contains no rows and
  may be handled in plaintext. Row data may not.
- `localStorage`/`sessionStorage` are **banned** for any organisational data. UI
  preferences (theme, last screen) are the only permitted non-sensitive use.

## 3. Cryptography

- **Cipher:** AES-256-GCM (authenticated encryption; detects tampering).
- **KDF:** PBKDF2-HMAC-SHA-256, **≥ 250 000 iterations**, **16-byte random salt
  per file**, **12-byte random IV per file**. Salt and IV are stored in the file
  header (they are not secret); the password is not.
- **Keys are non-extractable.** `crypto.subtle.deriveKey(..., extractable=false)`.
  The raw key bytes never exist in JS and cannot be exported by any script.
- **Password handling:** the passphrase is held in a **module-private variable**
  only while the session is unlocked. It is never placed on `window`, in React
  state, in the DOM, or in storage. `Lock` clears it and drops the database.
- **Fail closed:** a wrong password or a tampered file fails decryption (GCM auth
  tag) and the app must surface the error without loading partial data.
- Only the platform **Web Crypto API** is used. No hand-rolled crypto, no crypto
  libraries.

## 4. Anti-exfiltration (defence against XSS / malicious inline script)

The threat: a script that somehow executes inside the page tries to steal data
or send it out. Controls:

- **Content-Security-Policy (meta tag, shipped in the HTML):**
  - `default-src 'none'` — deny by default.
  - `connect-src 'none'` — **no `fetch`, `XMLHttpRequest`, `WebSocket`,
    `navigator.sendBeacon`, or `EventSource` can leave the machine.** This is the
    primary anti-exfiltration control.
  - `script-src 'unsafe-inline' 'wasm-unsafe-eval'` — only the app's own inlined
    script and the SQLite WASM run; no remote script origins.
  - `style-src 'unsafe-inline'`, `img-src data: blob:`, `font-src data:`,
    `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`,
    `frame-src 'none'`.
- **No network APIs in code.** `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon`
  must not appear in the source. The WASM is passed to the engine as an in-memory
  `wasmBinary` (never fetched), so `connect-src 'none'` holds.
- **Downloads** use `Blob` + `URL.createObjectURL` (blob: scheme), which is not a
  network egress and is unaffected by `connect-src`.

## 5. Anti-XSS

- **React only, auto-escaping.** `dangerouslySetInnerHTML`, `element.innerHTML`,
  `outerHTML`, `document.write`, `eval`, and `new Function` are **prohibited**.
- **All SQL that includes user input uses bound parameters** (prepared statement
  + `bind`). String-concatenating user input into SQL is prohibited outside the
  explicit SQL-console screen (where the operator is deliberately writing SQL).
- Rendered cell values are treated as text, never as markup.
- **All DB access is serialized.** cr-sqlite exposes one connection whose async
  API does not serialize concurrent calls; every query/mutation goes through a
  single-lane queue (`src/lib/db.ts`). Concurrent access is a correctness bug.

## 6. Session lifecycle

1. **Load** — operator supplies the schema `.sql`, optionally an encrypted
   `.hrisdump` (truth), and the passphrase. Schema builds the tables + CRRs;
   the decrypted truth changeset populates them. The passphrase unlocks the
   session. The **morning watermark** (`crsql_db_version()`) is captured.
2. **User gate** — operator selects their identity from `app_user`. This is
   attribution, not authentication; `current_user_id` is module-private.
3. **Work** — all reads/writes hit the in-memory DB. Every mutation stamps
   `updated_by`/`updated_at` and appends a `change_event`. Nothing touches disk.
4. **Save** — operator exports an encrypted **delta** (`.hrischanges`) since the
   watermark (primary), or a full truth (`.hrisdump`) for coordinator backup.
5. **Lock / close** — `crsql_finalize()`, then key material, passphrase,
   identity, and database are cleared from memory. Closing the tab loses unsaved
   work by design (no plaintext at rest).

## 7. Residual risk (stated honestly)

Within a single browser realm, JavaScript cannot fully hide memory from other
JavaScript in the same realm. If an attacker achieves script execution **and**
the session is unlocked, they could read decrypted rows from memory while they
are displayed. We reduce this risk to the maximum practical degree by:

- making keys **non-extractable** (raw keys can never be exported),
- blocking **all network egress** via CSP (`connect-src 'none'`), so stolen data
  has nowhere to go,
- keeping **no plaintext at rest**, so an attacker with only file access gets
  ciphertext,
- eliminating XSS sinks and using a framework that escapes by default.

Perfect in-realm memory isolation is not achievable in a browser; the
compensating control is that exfiltration is blocked and persistence is
encrypted.

## 8. Build & verification

- `npm run build` produces `dist/index.html` (single file).
- A change is not "done" until the built file has been opened in a browser and
  the affected flow exercised end-to-end: engine boot under CSP, load truth,
  user gate, a CRUD action, `change_event` recorded, an encrypted changeset
  export, and a decrypt round-trip.
- **Sync changes** additionally require `node scripts/test-merge.mjs` to pass —
  truth + two operator deltas → merge → both edits converge, with a correct
  audit report.

## 9. Multi-operator sync (CRDT)

Full detail: [docs/crdt-sync-spec.md](./docs/crdt-sync-spec.md). Binding points:

- **One org/day passphrase** encrypts the truth and every operator's changes.
  Per-operator file passwords are prohibited (operators could not share one
  truth). Human identity lives *inside* the encrypted data (`app_user`,
  `change_event`), not in the encryption.
- **Merge changesets, not competing full dumps.** Operators export deltas; the
  coordinator merges them onto the truth. cr-sqlite guarantees convergence
  regardless of order.
- **No merge in the operator build.** Merging happens out of band in
  `scripts/merge-hris.mjs` (Node), never in the browser field build.
- **Client-generated UUID keys** for any row an operator can create offline
  (`assignments.id`). Centrally-allocated keys (`badge_number`,
  `position_number`) may stay, treated as immutable identity.
- **CRR schema rules:** every PK explicitly `NOT NULL`; every `NOT NULL` column
  has a `DEFAULT`; no enforced foreign keys, no `UNIQUE` besides the PK.
  Referential/uniqueness integrity is enforced in the app layer.

## 10. Protected B production requirements (v1.0)

Sections 1–9 apply to **every** change. Additional requirements for operational
use with real personnel data (Protected B) are in:

- **[docs/app-development-requirements.md](docs/app-development-requirements.md)** —
  in-app features: user gate, `change_event`, `session_log`, CRDT sync, changeset
  export. Binding before v1.0 production.
- **[docs/governance-procedure-requirements.md](docs/governance-procedure-requirements.md)** —
  organizational procedure and compliance (PIA, screening, coordinator SOP,
  breach playbook). To be completed **after** the app reaches v1.0.

Technical sync architecture: [docs/crdt-sync-spec.md](docs/crdt-sync-spec.md).
