# User stories

Each story maps 1:1 to a Playwright test in [`tests/hris.spec.ts`](tests/hris.spec.ts)
and to a screen recording in the [how-to guide](https://rheophile10.github.io/offline-Protected-B-HRIS/how-to.html).
Run them with `npm run test:e2e`.

---

### US-1 — Start a session
**As** an HR planner, **I want** to open the app and load today's dataset behind a
passphrase, **so that** I can work with the roster without any server or network.

*Acceptance:* opening the file shows a locked gate; entering a passphrase and
picking my operator identity lands me on a dashboard showing the roster
(27 officers in the demo) and the largest staffing gaps.

### US-2 — Add an officer
**As** a planner, **I want** to add a new officer to the roster, **so that** the
establishment reflects a new hire.

*Acceptance:* the new officer appears in the Officers table and the dashboard
headcount increases by one. The change is attributed to me and audited.

### US-3 — Assign an officer to a position
**As** a planner, **I want** to assign an officer to a position, **so that**
staffing levels and vacancy deficits stay current.

*Acceptance:* the assignment appears in the Assignments table; staffing views
recompute automatically.

### US-4 — Query data and export an encrypted CSV
**As** an analyst, **I want** to run ad-hoc SQL and export the result, **so that**
I can share a figure — **without** ever writing plaintext to disk.

*Acceptance:* the SQL console returns rows; the only export option produces an
**encrypted** `.csv.enc` file (never a plain `.csv`).

### US-5 — Export daily changes and merge them (no Node)
**As** a coordinator, **I want** to merge several operators' offline edits into one
truth **inside the app**, **so that** no one needs Node, admin rights, or a server.

*Acceptance:* an operator exports an encrypted `.hrischanges` delta; opening a
fresh truth and loading that file on the Data & Security screen applies it and
the headcount reflects the merged edit. Divergent edits converge (CRDT).

### US-7 — Recruit an applicant and hire them
**As** a recruiter, **I want** to run a hiring pipeline and turn a successful
applicant into an officer, **so that** recruitment and the roster stay in one
system.

*Acceptance:* I can open a competition on a vacant position, add applicants, move
them through stages (Applied → … → Offer → Hired), and **convert** a hire into an
officer — which creates the officer record and an active assignment, and bumps the
headcount. All of it syncs and merges like the rest of the data.

### US-8 — Review compliance and renew a certification
**As** a training coordinator, **I want** to see which certifications are expired or
expiring and renew them, **so that** officers stay qualified (e.g. firearms-current).

*Acceptance:* the compliance dashboard shows Expired / Expiring-≤90-days / Valid
counts and a firearms-current ratio; clicking a KPI filters the list; renewing an
expired certification records a new dated entry and the expired count drops.

### US-6 — Lock the session
**As** a planner, **I want** to lock the session when I step away, **so that** the
decrypted data is wiped from memory.

*Acceptance:* locking returns to the gate and clears the in-memory database, key,
and identity. Unsaved work is lost by design (no plaintext at rest).
