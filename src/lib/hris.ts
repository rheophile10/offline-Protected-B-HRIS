// Domain layer for the HRIS screens. Async (cr-sqlite). Every mutating op:
//  - uses bound parameters (standards §5),
//  - stamps updated_by / updated_at (crdt-sync-spec §5.3),
//  - appends a change_event audit row (app-development-requirements §5.1).
import { all, run, scalar } from "./db";
import { requireUser } from "./identity";
import { logChange } from "./audit";

export interface Officer {
  badge_number: number;
  name: string;
  rank: string | null;
  start_date: string | null;
  current_salary: number | null;
  status: string;
}
export interface Position {
  position_number: string;
  title: string;
  rank_requirement: string | null;
  term_years: number | null;
  reports_to: string | null;
  detachment: string | null;
  headcount_qty: number;
  pay_min: number | null;
  pay_max: number | null;
  job_description: string | null;
}
export interface Assignment {
  id: string;
  badge_number: number;
  position_number: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
}
export interface AssignmentView extends Assignment {
  officer_name: string;
  position_title: string;
}
export interface StaffingRow {
  position_number: string;
  title: string;
  rank_requirement: string | null;
  detachment: string | null;
  budgeted: number;
  filled: number;
  deficit: number;
}

export const ASSIGNMENT_STATUSES = ["Active", "Completed", "Transferred", "Retired", "Fired"];
export const OFFICER_STATUSES = ["Active", "On Leave", "Suspended", "Retired", "Terminated"];

const now = () => Date.now();
const uuid = () => crypto.randomUUID();

export function ranks(): Promise<string[]> {
  return all<{ rank: string }>("SELECT rank FROM ranks ORDER BY sort_order").then((r) => r.map((x) => x.rank));
}
export function detachments(): Promise<string[]> {
  return all<{ name: string }>("SELECT name FROM detachments ORDER BY name").then((r) => r.map((x) => x.name));
}

// ---------- Officers ----------
export function listOfficers(search = ""): Promise<Officer[]> {
  const q = search.trim();
  if (q) {
    const like = `%${q}%`;
    return all<Officer>(
      `SELECT badge_number,name,rank,start_date,current_salary,status FROM officers
       WHERE name LIKE ? OR rank LIKE ? OR CAST(badge_number AS TEXT) LIKE ? ORDER BY badge_number`,
      [like, like, like],
    );
  }
  return all<Officer>("SELECT badge_number,name,rank,start_date,current_salary,status FROM officers ORDER BY badge_number");
}
export async function upsertOfficer(o: Officer, isNew: boolean): Promise<void> {
  const user = requireUser();
  if (isNew) {
    await run(
      `INSERT INTO officers(badge_number,name,rank,start_date,current_salary,status,created_by,updated_by,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [o.badge_number, o.name, o.rank, o.start_date, o.current_salary, o.status, user, user, now()],
    );
    await logChange("officers", o.badge_number, "insert", null, null, o.name);
  } else {
    await run(
      `UPDATE officers SET name=?, rank=?, start_date=?, current_salary=?, status=?, updated_by=?, updated_at=?
       WHERE badge_number=?`,
      [o.name, o.rank, o.start_date, o.current_salary, o.status, user, now(), o.badge_number],
    );
    await logChange("officers", o.badge_number, "update", null, null, o.name);
  }
}
export async function deleteOfficer(badge: number): Promise<void> {
  requireUser();
  await run("DELETE FROM assignments WHERE badge_number = ?", [badge]);
  await run("DELETE FROM officers WHERE badge_number = ?", [badge]);
  await logChange("officers", badge, "delete");
}
/** Map of badge_number → current active position title (one query). */
export async function currentPostings(): Promise<Record<number, string>> {
  const rows = await all<{ badge_number: number; position_title: string }>(
    "SELECT badge_number, position_title FROM v_current_assignments",
  );
  const m: Record<number, string> = {};
  for (const r of rows) m[r.badge_number] = r.position_title;
  return m;
}

// ---------- Positions ----------
export function listPositions(search = ""): Promise<Position[]> {
  const q = search.trim();
  const cols =
    "position_number,title,rank_requirement,term_years,reports_to,detachment,headcount_qty,pay_min,pay_max,job_description";
  if (q) {
    const like = `%${q}%`;
    return all<Position>(
      `SELECT ${cols} FROM positions WHERE title LIKE ? OR position_number LIKE ? OR detachment LIKE ?
       ORDER BY position_number`,
      [like, like, like],
    );
  }
  return all<Position>(`SELECT ${cols} FROM positions ORDER BY position_number`);
}
export async function upsertPosition(p: Position, isNew: boolean): Promise<void> {
  const user = requireUser();
  if (isNew) {
    await run(
      `INSERT INTO positions(position_number,title,rank_requirement,term_years,reports_to,detachment,headcount_qty,pay_min,pay_max,job_description,created_by,updated_by,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.position_number, p.title, p.rank_requirement, p.term_years, p.reports_to, p.detachment, p.headcount_qty, p.pay_min, p.pay_max, p.job_description, user, user, now()],
    );
    await logChange("positions", p.position_number, "insert", null, null, p.title);
  } else {
    await run(
      `UPDATE positions SET title=?, rank_requirement=?, term_years=?, reports_to=?, detachment=?, headcount_qty=?, pay_min=?, pay_max=?, job_description=?, updated_by=?, updated_at=?
       WHERE position_number=?`,
      [p.title, p.rank_requirement, p.term_years, p.reports_to, p.detachment, p.headcount_qty, p.pay_min, p.pay_max, p.job_description, user, now(), p.position_number],
    );
    await logChange("positions", p.position_number, "update", null, null, p.title);
  }
}
export async function deletePosition(num: string): Promise<void> {
  requireUser();
  await run("DELETE FROM assignments WHERE position_number = ?", [num]);
  await run("DELETE FROM positions WHERE position_number = ?", [num]);
  await logChange("positions", num, "delete");
}

// ---------- Assignments ----------
export function listAssignments(activeOnly = false): Promise<AssignmentView[]> {
  const where = activeOnly ? "WHERE a.status='Active' AND a.end_date IS NULL" : "";
  return all<AssignmentView>(
    `SELECT a.id,a.badge_number,a.position_number,a.start_date,a.end_date,a.status,
            o.name AS officer_name, p.title AS position_title
     FROM assignments a
     JOIN officers o ON o.badge_number=a.badge_number
     JOIN positions p ON p.position_number=a.position_number
     ${where}
     ORDER BY a.status='Active' DESC, a.start_date DESC`,
  );
}
export async function createAssignment(a: Omit<Assignment, "id">): Promise<void> {
  const user = requireUser();
  const id = uuid();
  await run(
    `INSERT INTO assignments(id,badge_number,position_number,start_date,end_date,status,created_by,updated_by,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [id, a.badge_number, a.position_number, a.start_date, a.end_date, a.status, user, user, now()],
  );
  await logChange("assignments", id, "insert", null, null, a.position_number);
}
export async function endAssignment(id: string, endDate: string, status: string): Promise<void> {
  const user = requireUser();
  await run("UPDATE assignments SET end_date=?, status=?, updated_by=?, updated_at=? WHERE id=?", [
    endDate,
    status,
    user,
    now(),
    id,
  ]);
  await logChange("assignments", id, "update", "status", null, status);
}
export async function deleteAssignment(id: string): Promise<void> {
  requireUser();
  await run("DELETE FROM assignments WHERE id = ?", [id]);
  await logChange("assignments", id, "delete");
}

// ---------- Dashboard ----------
export interface Kpis {
  officers: number;
  budgeted: number;
  filled: number;
  deficit: number;
  payroll: number;
}
export async function kpis(): Promise<Kpis> {
  const officers = Number((await scalar("SELECT COUNT(*) FROM officers")) ?? 0);
  const budgeted = Number((await scalar("SELECT COALESCE(SUM(headcount_qty),0) FROM positions")) ?? 0);
  const filled = Number((await scalar("SELECT COUNT(*) FROM v_current_assignments")) ?? 0);
  const payroll = Number(
    (await scalar("SELECT COALESCE(SUM(current_salary),0) FROM officers WHERE status='Active'")) ?? 0,
  );
  return { officers, budgeted, filled, deficit: budgeted - filled, payroll };
}
export function staffing(): Promise<StaffingRow[]> {
  return all<StaffingRow>("SELECT position_number,title,rank_requirement,detachment,budgeted,filled,deficit FROM v_position_staffing ORDER BY deficit DESC, position_number");
}
export function rankHeadcount(): Promise<{ rank: string; budgeted: number; filled: number }[]> {
  return all("SELECT rank, budgeted, filled FROM v_rank_headcount");
}

// ---------- Recruitment / applicant tracking ----------
export const PIPELINE_STAGES = ["Applied", "Screening", "Interview", "Background", "Offer", "Hired", "Rejected"];

export interface Competition {
  id: string;
  position_number: string;
  opened: string | null;
  closes: string | null;
  status: string;
  position_title: string | null;
  applicant_count: number;
}
export interface PipelineRow {
  id: string;
  stage: string;
  applied_date: string | null;
  notes: string | null;
  applicant_id: string;
  applicant_name: string;
  email: string | null;
  source: string | null;
  competition_id: string;
  position_number: string;
  position_title: string | null;
}

export function listCompetitions(): Promise<Competition[]> {
  return all<Competition>(
    `SELECT c.id, c.position_number, c.opened, c.closes, c.status,
            p.title AS position_title,
            (SELECT COUNT(*) FROM applications a WHERE a.competition_id = c.id) AS applicant_count
     FROM competitions c
     LEFT JOIN positions p ON p.position_number = c.position_number
     ORDER BY c.status='Open' DESC, c.opened DESC`,
  );
}
export async function createCompetition(positionNumber: string, opened: string, closes: string): Promise<void> {
  const user = requireUser();
  const id = uuid();
  await run(
    `INSERT INTO competitions(id,position_number,opened,closes,status,created_by,updated_by,updated_at)
     VALUES(?,?,?,?,'Open',?,?,?)`,
    [id, positionNumber, opened || null, closes || null, user, user, now()],
  );
  await logChange("competitions", id, "insert", null, null, positionNumber);
}
export async function setCompetitionStatus(id: string, status: string): Promise<void> {
  const user = requireUser();
  await run("UPDATE competitions SET status=?, updated_by=?, updated_at=? WHERE id=?", [status, user, now(), id]);
  await logChange("competitions", id, "update", "status", null, status);
}

export function listPipeline(): Promise<PipelineRow[]> {
  return all<PipelineRow>(
    "SELECT id,stage,applied_date,notes,applicant_id,applicant_name,email,source,competition_id,position_number,position_title FROM v_pipeline ORDER BY applied_date DESC, applicant_name",
  );
}

export interface NewApplicant {
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  competition_id: string;
}
export async function addApplicant(a: NewApplicant): Promise<void> {
  const user = requireUser();
  const applicantId = uuid();
  await run(
    `INSERT INTO applicants(id,name,email,phone,source,created_by,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
    [applicantId, a.name, a.email, a.phone, a.source, user, user, now()],
  );
  const appId = uuid();
  await run(
    `INSERT INTO applications(id,competition_id,applicant_id,stage,applied_date,notes,created_by,updated_by,updated_at)
     VALUES(?,?,?,'Applied',?,?,?,?,?)`,
    [appId, a.competition_id, applicantId, new Date().toISOString().slice(0, 10), null, user, user, now()],
  );
  await logChange("applications", appId, "insert", null, null, a.name);
}
export async function setApplicationStage(id: string, stage: string): Promise<void> {
  const user = requireUser();
  await run("UPDATE applications SET stage=?, updated_by=?, updated_at=? WHERE id=?", [stage, user, now(), id]);
  await logChange("applications", id, "update", "stage", null, stage);
}
export async function deleteApplication(id: string): Promise<void> {
  requireUser();
  await run("DELETE FROM applications WHERE id=?", [id]);
  await logChange("applications", id, "delete");
}

/** Convert a hired applicant into an officer + an active assignment to the posting. */
export async function convertToOfficer(
  row: PipelineRow,
  badge: number,
  rank: string | null,
  salary: number | null,
  startDate: string,
): Promise<void> {
  const user = requireUser();
  await run(
    `INSERT INTO officers(badge_number,name,rank,start_date,current_salary,status,created_by,updated_by,updated_at)
     VALUES(?,?,?,?,?,'Active',?,?,?)`,
    [badge, row.applicant_name, rank, startDate, salary, user, user, now()],
  );
  await logChange("officers", badge, "insert", null, null, row.applicant_name);
  if (row.position_number) {
    const aid = uuid();
    await run(
      `INSERT INTO assignments(id,badge_number,position_number,start_date,end_date,status,created_by,updated_by,updated_at)
       VALUES(?,?,?,?,NULL,'Active',?,?,?)`,
      [aid, badge, row.position_number, startDate, user, user, now()],
    );
    await logChange("assignments", aid, "insert", null, null, row.position_number);
  }
  await setApplicationStage(row.id, "Hired");
}

// ---------- Training & compliance ----------
export interface CertType {
  code: string;
  name: string;
  category: string | null;
  validity_months: number | null;
}
export interface CertRow {
  id: string;
  badge_number: number;
  officer_name: string;
  rank: string | null;
  cert_code: string;
  cert_name: string;
  category: string | null;
  validity_months: number | null;
  issued_date: string | null;
  expiry_date: string | null;
  status: string;
}
export function certCatalog(): Promise<CertType[]> {
  return all<CertType>("SELECT code,name,category,validity_months FROM certifications ORDER BY category, name");
}
export function listCertifications(): Promise<CertRow[]> {
  return all<CertRow>(
    "SELECT id,badge_number,officer_name,rank,cert_code,cert_name,category,validity_months,issued_date,expiry_date,status FROM v_certifications",
  );
}
export async function recordCertification(
  badge: number,
  code: string,
  issued: string | null,
  expiry: string | null,
): Promise<void> {
  const user = requireUser();
  const id = uuid();
  await run(
    `INSERT INTO officer_certifications(id,badge_number,cert_code,issued_date,expiry_date,status,created_by,updated_by,updated_at)
     VALUES(?,?,?,?,?,'Active',?,?,?)`,
    [id, badge, code, issued, expiry, user, user, now()],
  );
  await logChange("officer_certifications", id, "insert", null, null, code);
}
export async function revokeCertification(id: string): Promise<void> {
  const user = requireUser();
  await run("UPDATE officer_certifications SET status='Revoked', updated_by=?, updated_at=? WHERE id=?", [user, now(), id]);
  await logChange("officer_certifications", id, "update", "status", null, "Revoked");
}
export async function deleteCertification(id: string): Promise<void> {
  requireUser();
  await run("DELETE FROM officer_certifications WHERE id=?", [id]);
  await logChange("officer_certifications", id, "delete");
}

// ---------- Leave / absence ----------
export const LEAVE_STATUSES = ["Requested", "Approved", "Denied", "Cancelled"];
export interface LeaveType {
  code: string;
  name: string;
  paid: number;
}
export interface LeaveRow {
  id: string;
  badge_number: number;
  officer_name: string;
  rank: string | null;
  leave_code: string;
  leave_name: string;
  paid: number;
  start_date: string | null;
  end_date: string | null;
  days: number;
  status: string;
  notes: string | null;
}
export function leaveTypes(): Promise<LeaveType[]> {
  return all<LeaveType>("SELECT code,name,paid FROM leave_types ORDER BY name");
}
export function listLeave(): Promise<LeaveRow[]> {
  return all<LeaveRow>(
    "SELECT id,badge_number,officer_name,rank,leave_code,leave_name,paid,start_date,end_date,days,status,notes FROM v_leave ORDER BY start_date DESC",
  );
}
export async function requestLeave(
  badge: number,
  code: string,
  start: string,
  end: string,
  days: number,
  status = "Requested",
): Promise<void> {
  const user = requireUser();
  const id = uuid();
  await run(
    `INSERT INTO leave_records(id,badge_number,leave_code,start_date,end_date,days,status,notes,created_by,updated_by,updated_at)
     VALUES(?,?,?,?,?,?,?,NULL,?,?,?)`,
    [id, badge, code, start, end, days, status, user, user, now()],
  );
  await logChange("leave_records", id, "insert", null, null, code);
}
export async function setLeaveStatus(id: string, status: string): Promise<void> {
  const user = requireUser();
  await run("UPDATE leave_records SET status=?, updated_by=?, updated_at=? WHERE id=?", [status, user, now(), id]);
  await logChange("leave_records", id, "update", "status", null, status);
}
export async function deleteLeave(id: string): Promise<void> {
  requireUser();
  await run("DELETE FROM leave_records WHERE id=?", [id]);
  await logChange("leave_records", id, "delete");
}

// ---------- Audit views ----------
export interface SessionLogRow {
  at: number;
  user_id: string;
  event: string;
  day_id: string | null;
  details: string | null;
}
export function listSessionLog(limit = 100): Promise<SessionLogRow[]> {
  return all<SessionLogRow>(
    "SELECT at,user_id,event,day_id,details FROM session_log ORDER BY at DESC LIMIT ?",
    [limit],
  );
}

export interface ChangeEventRow {
  at: number;
  user_id: string;
  entity_table: string;
  entity_id: string;
  action: string;
  new_val: string | null;
}
export function recentChanges(limit = 100): Promise<ChangeEventRow[]> {
  return all<ChangeEventRow>(
    "SELECT at,user_id,entity_table,entity_id,action,new_val FROM change_event ORDER BY at DESC LIMIT ?",
    [limit],
  );
}
export function changesByOperator(): Promise<{ user_id: string; n: number }[]> {
  return all<{ user_id: string; n: number }>(
    "SELECT user_id, COUNT(*) AS n FROM change_event GROUP BY user_id ORDER BY n DESC",
  );
}
