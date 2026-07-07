// Audit writers (app-development-requirements §5). Both tables are CRRs, so
// audit rows travel with the operator's changeset and appear in the merge report.
import { run, type SqlValue } from "./db";
import { currentUser } from "./identity";

const uuid = () => crypto.randomUUID();

export type ChangeAction = "insert" | "update" | "delete";

/** Record a human-attributed data change (change_event). */
export async function logChange(
  entityTable: string,
  entityId: string | number,
  action: ChangeAction,
  field: string | null = null,
  oldVal: SqlValue = null,
  newVal: SqlValue = null,
): Promise<void> {
  await run(
    `INSERT INTO change_event(id,user_id,entity_table,entity_id,action,field,old_val,new_val,at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [uuid(), currentUser() ?? "", entityTable, String(entityId), action, field, oldVal, newVal, Date.now()],
  );
}

export type SessionEvent =
  | "session_open"
  | "user_select"
  | "session_lock"
  | "dump_import"
  | "dump_export"
  | "changes_export";

/** Record an access/export event (session_log). */
export async function logSession(
  event: SessionEvent,
  details: string | null = null,
  dayId: string | null = null,
): Promise<void> {
  await run(
    `INSERT INTO session_log(id,user_id,event,at,day_id,details) VALUES(?,?,?,?,?,?)`,
    [uuid(), currentUser() ?? "", event, Date.now(), dayId, details],
  );
}
