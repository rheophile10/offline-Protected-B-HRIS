import { useState } from "react";
import { useApp, Modal, Field, useConfirm, useLiveQuery } from "../ui";
import {
  listAssignments,
  createAssignment,
  endAssignment,
  deleteAssignment,
  listOfficers,
  listPositions,
  ASSIGNMENT_STATUSES,
  type AssignmentView,
  type Officer,
  type Position,
} from "../lib/hris";

export function Assignments() {
  const { refresh, notify } = useApp();
  const confirm = useConfirm();
  const [activeOnly, setActiveOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [ending, setEnding] = useState<AssignmentView | null>(null);

  const rows = useLiveQuery<AssignmentView[]>(() => listAssignments(activeOnly), [], [activeOnly]);

  return (
    <div className="screen">
      <header className="screen-head row">
        <div>
          <h1>Assignments</h1>
          <p className="muted">{rows.length} shown</p>
        </div>
        <div className="head-actions">
          <label className="check">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <button className="btn primary" onClick={() => setAdding(true)}>+ Assign officer</button>
        </div>
      </header>

      <table className="tbl card">
        <thead>
          <tr>
            <th>Officer</th>
            <th>Position</th>
            <th>Start</th>
            <th>End</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{a.officer_name}</td>
              <td>
                {a.position_title} <span className="muted mono">({a.position_number})</span>
              </td>
              <td className="mono">{a.start_date ?? "—"}</td>
              <td className="mono">{a.end_date ?? "—"}</td>
              <td>
                <span className={"pill " + (a.status === "Active" ? "ok" : "muted")}>{a.status}</span>
              </td>
              <td className="row-actions">
                {a.status === "Active" && !a.end_date && (
                  <button className="icon" title="End assignment" onClick={() => setEnding(a)}>⏹</button>
                )}
                <button
                  className="icon danger"
                  title="Delete"
                  onClick={async () => {
                    if (!confirm("Delete this assignment record?")) return;
                    await deleteAssignment(a.id);
                    refresh();
                    notify("Assignment deleted.", "info");
                  }}
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">No assignments.</td>
            </tr>
          )}
        </tbody>
      </table>

      {adding && (
        <AddAssignment
          onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); refresh(); notify("Officer assigned.", "ok"); }}
        />
      )}
      {ending && (
        <EndAssignment
          a={ending}
          onClose={() => setEnding(null)}
          onDone={() => { setEnding(null); refresh(); notify("Assignment ended.", "ok"); }}
        />
      )}
    </div>
  );
}

function AddAssignment({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const officers = useLiveQuery<Officer[]>(() => listOfficers(), []);
  const positions = useLiveQuery<Position[]>(() => listPositions(), []);
  const [badge, setBadge] = useState<number>(0);
  const [pos, setPos] = useState<string>("");
  const [start, setStart] = useState<string>(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Active");

  const badgeVal = badge || officers[0]?.badge_number || 0;
  const posVal = pos || positions[0]?.position_number || "";

  const save = async () => {
    if (!badgeVal || !posVal) return notify("Pick an officer and a position.", "err");
    await createAssignment({ badge_number: badgeVal, position_number: posVal, start_date: start, end_date: null, status });
    onDone();
  };

  return (
    <Modal title="Assign officer to position" onClose={onClose}>
      <div className="form-grid">
        <Field label="Officer">
          <select value={badgeVal} onChange={(e) => setBadge(Number(e.target.value))}>
            {officers.map((o) => (
              <option key={o.badge_number} value={o.badge_number}>
                {o.badge_number} — {o.name} ({o.rank})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Position">
          <select value={posVal} onChange={(e) => setPos(e.target.value)}>
            {positions.map((p) => (
              <option key={p.position_number} value={p.position_number}>
                {p.position_number} — {p.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {ASSIGNMENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Assign</button>
      </div>
    </Modal>
  );
}

function EndAssignment({ a, onClose, onDone }: { a: AssignmentView; onClose: () => void; onDone: () => void }) {
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Completed");
  return (
    <Modal title={`End: ${a.officer_name} — ${a.position_title}`} onClose={onClose}>
      <div className="form-grid">
        <Field label="End date">
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Outcome">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {ASSIGNMENT_STATUSES.filter((s) => s !== "Active").map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => { await endAssignment(a.id, end, status); onDone(); }}>
          End assignment
        </button>
      </div>
    </Modal>
  );
}
