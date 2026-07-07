-- ============================================================
--  Juárez Police Department (fictional demo) — HRIS schema (CRDT / cr-sqlite)
--  Load this file at the start of every session.
--  Row data lives in the encrypted .hrisdump / .hrischanges, not here.
--
--  cr-sqlite CRR rules enforced below:
--    * every PK is explicitly NOT NULL (incl. INTEGER PKs)
--    * every NOT NULL column has a DEFAULT (merge fwd/back-compat)
--    * no foreign-key constraints, no UNIQUE besides the PK
--  Referential/uniqueness integrity is enforced in the app layer.
-- ============================================================
PRAGMA foreign_keys = OFF;

-- ---- reference data (NOT CRRs: read-only, identical on every replica) ----
CREATE TABLE IF NOT EXISTS ranks (
  rank        TEXT PRIMARY KEY NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS detachments (
  name        TEXT PRIMARY KEY NOT NULL
);

-- Reference data is seeded here (not in a changeset) because it is identical on
-- every replica and never operator-edited. Truth/change files carry CRR data only.
INSERT OR IGNORE INTO ranks(rank,sort_order) VALUES
  ('Chief',1),('Deputy Chief',2),('Inspector',3),('Staff Sergeant',4),('Sergeant',5),('Constable',6);
INSERT OR IGNORE INTO detachments(name) VALUES
  ('Zona Centro Headquarters'),('Anapra District Station'),('Zaragoza District Station'),
  ('Senecú District Station'),('Riberas del Bravo Special Operations');

-- ---- operator-editable tables (CRRs) ----
-- positions: establishment. position_number is centrally governed → stable PK.
CREATE TABLE IF NOT EXISTS positions (
  position_number  TEXT PRIMARY KEY NOT NULL,
  title            TEXT NOT NULL DEFAULT '',
  rank_requirement TEXT,
  term_years       INTEGER,
  reports_to       TEXT,                       -- position_number or external body
  detachment       TEXT,
  headcount_qty    INTEGER NOT NULL DEFAULT 1,
  pay_min          INTEGER,
  pay_max          INTEGER,
  job_description  TEXT,
  created_by       TEXT NOT NULL DEFAULT '',
  updated_by       TEXT NOT NULL DEFAULT '',
  updated_at       INTEGER NOT NULL DEFAULT 0  -- Unix ms
);

-- officers: roster. badge_number is centrally pre-allocated by HR → stable PK.
CREATE TABLE IF NOT EXISTS officers (
  badge_number    INTEGER PRIMARY KEY NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  rank            TEXT,
  start_date      TEXT,                         -- ISO yyyy-mm-dd
  current_salary  INTEGER,
  status          TEXT NOT NULL DEFAULT 'Active',
  created_by      TEXT NOT NULL DEFAULT '',
  updated_by      TEXT NOT NULL DEFAULT '',
  updated_at      INTEGER NOT NULL DEFAULT 0
);

-- assignments: officer ↔ position history. Operators create these offline →
-- client-generated UUID PK to avoid cross-replica collisions.
CREATE TABLE IF NOT EXISTS assignments (
  id               TEXT PRIMARY KEY NOT NULL,
  badge_number     INTEGER NOT NULL DEFAULT 0,
  position_number  TEXT NOT NULL DEFAULT '',
  start_date       TEXT,
  end_date         TEXT,
  status           TEXT NOT NULL DEFAULT 'Active',
  created_by       TEXT NOT NULL DEFAULT '',
  updated_by       TEXT NOT NULL DEFAULT '',
  updated_at       INTEGER NOT NULL DEFAULT 0
);

-- ---- identity & audit (CRRs) ----
CREATE TABLE IF NOT EXISTS app_user (
  id            TEXT PRIMARY KEY NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  pin_hash      TEXT,                           -- optional PBKDF2 hash
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS change_event (
  id            TEXT PRIMARY KEY NOT NULL,
  user_id       TEXT NOT NULL DEFAULT '',
  entity_table  TEXT NOT NULL DEFAULT '',
  entity_id     TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL DEFAULT '',       -- insert | update | delete
  field         TEXT,
  old_val       TEXT,
  new_val       TEXT,
  at            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS session_log (
  id      TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  event   TEXT NOT NULL DEFAULT '',
  at      INTEGER NOT NULL DEFAULT 0,
  day_id  TEXT,
  details TEXT
);

-- ---- local/session metadata (NOT a CRR: excluded from changeset export) ----
CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL DEFAULT ''
);

-- ---- promote editable tables to conflict-free replicated relations ----
SELECT crsql_as_crr('positions');
SELECT crsql_as_crr('officers');
SELECT crsql_as_crr('assignments');
SELECT crsql_as_crr('app_user');
SELECT crsql_as_crr('change_event');
SELECT crsql_as_crr('session_log');

-- ---- reporting views (recompute from base tables after every merge) ----
CREATE VIEW IF NOT EXISTS v_current_assignments AS
SELECT a.badge_number, o.name, o.rank AS officer_rank,
       a.position_number, p.title AS position_title, p.detachment,
       a.start_date, a.status
FROM assignments a
JOIN officers o  ON o.badge_number    = a.badge_number
JOIN positions p ON p.position_number = a.position_number
WHERE a.status = 'Active' AND a.end_date IS NULL;

CREATE VIEW IF NOT EXISTS v_position_staffing AS
SELECT p.position_number, p.title, p.rank_requirement, p.detachment,
       p.headcount_qty AS budgeted,
       COUNT(a.id)     AS filled,
       p.headcount_qty - COUNT(a.id) AS deficit
FROM positions p
LEFT JOIN assignments a
       ON a.position_number = p.position_number
      AND a.status = 'Active' AND a.end_date IS NULL
GROUP BY p.position_number, p.title, p.rank_requirement, p.detachment, p.headcount_qty;

CREATE VIEW IF NOT EXISTS v_rank_headcount AS
SELECT r.rank, r.sort_order,
       COALESCE((SELECT SUM(headcount_qty) FROM positions WHERE rank_requirement = r.rank),0) AS budgeted,
       COALESCE((SELECT COUNT(*) FROM v_current_assignments c
                 JOIN positions p2 ON p2.position_number=c.position_number
                 WHERE p2.rank_requirement = r.rank),0) AS filled
FROM ranks r
ORDER BY r.sort_order;
