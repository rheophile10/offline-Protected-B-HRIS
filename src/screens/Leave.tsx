import { useMemo, useState } from "react";
import { useApp, Modal, Field, useConfirm, useLiveQuery } from "../ui";
import {
  leaveTypes,
  listLeave,
  requestLeave,
  setLeaveStatus,
  deleteLeave,
  listOfficers,
  LEAVE_STATUSES,
  type LeaveType,
  type LeaveRow,
  type Officer,
} from "../lib/hris";

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayCount = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);
const statusPill: Record<string, string> = { Approved: "ok", Requested: "warn", Denied: "bad", Cancelled: "muted" };

export function Leave() {
  const { refresh, notify } = useApp();
  const confirm = useConfirm();
  const rows = useLiveQuery<LeaveRow[]>(listLeave, []);
  const types = useLiveQuery<LeaveType[]>(leaveTypes, []);
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const soon = addDays(today, 30);

  const kpi = useMemo(() => {
    const onLeave = rows.filter((r) => r.status === "Approved" && (r.start_date ?? "") <= today && (r.end_date ?? "") >= today);
    const pending = rows.filter((r) => r.status === "Requested").length;
    const upcoming = rows.filter((r) => r.status === "Approved" && (r.start_date ?? "") > today && (r.start_date ?? "") <= soon).length;
    return { onLeave, pending, upcoming };
  }, [rows, today, soon]);

  const act = async (id: string, status: string) => { await setLeaveStatus(id, status); refresh(); notify(`Leave ${status.toLowerCase()}.`, status === "Denied" ? "info" : "ok"); };

  return (
    <div className="screen">
      <header className="screen-head row">
        <div>
          <h1>Leave &amp; Absence</h1>
          <p className="muted">Requests, approvals and current availability.</p>
        </div>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setAdding(true)}>+ Request leave</button>
        </div>
      </header>

      <div className="kpis">
        <div className="kpi"><div className="kpi-value">{kpi.onLeave.length}</div><div className="kpi-label">On leave today</div></div>
        <div className="kpi warn"><div className="kpi-value">{kpi.pending}</div><div className="kpi-label">Pending requests</div></div>
        <div className="kpi"><div className="kpi-value">{kpi.upcoming}</div><div className="kpi-label">Starting in 30 days</div></div>
      </div>

      {kpi.onLeave.length > 0 && (
        <div className="card pad" style={{ marginBottom: 16 }}>
          <h2>Currently on leave</h2>
          <div className="comp-bar" style={{ marginBottom: 0 }}>
            {kpi.onLeave.map((r) => (
              <div className="comp-chip" key={r.id}>
                <strong>{r.officer_name}</strong>
                <div className="muted small">{r.leave_name} · back {r.end_date}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <table className="tbl card">
        <thead>
          <tr>
            <th>Officer</th><th>Type</th><th>Start</th><th>End</th><th className="num">Days</th><th>Paid</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.officer_name}</td>
              <td>{r.leave_name}</td>
              <td className="mono">{r.start_date ?? "—"}</td>
              <td className="mono">{r.end_date ?? "—"}</td>
              <td className="num">{r.days}</td>
              <td className="muted">{r.paid ? "Paid" : "Unpaid"}</td>
              <td><span className={"pill " + (statusPill[r.status] ?? "muted")}>{r.status}</span></td>
              <td className="row-actions">
                {r.status === "Requested" && (
                  <>
                    <button className="btn small good" onClick={() => act(r.id, "Approved")}>Approve</button>
                    <button className="btn small" onClick={() => act(r.id, "Denied")}>Deny</button>
                  </>
                )}
                {(r.status === "Approved" || r.status === "Requested") && (
                  <button className="icon" title="Cancel" onClick={() => act(r.id, "Cancelled")}>⊘</button>
                )}
                <button className="icon danger" title="Delete" onClick={async () => {
                  if (!confirm("Delete this leave record?")) return;
                  await deleteLeave(r.id); refresh(); notify("Deleted.", "info");
                }}>🗑</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="empty">No leave records.</td></tr>}
        </tbody>
      </table>

      {adding && <RequestLeave types={types} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); notify("Leave request added.", "ok"); }} />}
    </div>
  );
}

function RequestLeave({ types, onClose, onDone }: { types: LeaveType[]; onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const officers = useLiveQuery<Officer[]>(() => listOfficers(), []);
  const [badge, setBadge] = useState(0);
  const [code, setCode] = useState("");
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [status, setStatus] = useState("Requested");
  const badgeVal = badge || officers[0]?.badge_number || 0;
  const codeVal = code || types[0]?.code || "";
  const days = end >= start ? dayCount(start, end) : 0;

  const save = async () => {
    if (!badgeVal || !codeVal) return notify("Pick an officer and a type.", "err");
    if (end < start) return notify("End date is before start.", "err");
    await requestLeave(badgeVal, codeVal, start, end, days, status);
    onDone();
  };
  return (
    <Modal title="Request leave" onClose={onClose}>
      <div className="form-grid">
        <Field label="Officer">
          <select value={badgeVal} onChange={(e) => setBadge(Number(e.target.value))}>
            {officers.map((o) => <option key={o.badge_number} value={o.badge_number}>{o.badge_number} — {o.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={codeVal} onChange={(e) => setCode(e.target.value)}>
            {types.map((t) => <option key={t.code} value={t.code}>{t.name}{t.paid ? "" : " (unpaid)"}</option>)}
          </select>
        </Field>
        <Field label="Start"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End" hint={days ? `${days} day(s)` : "check dates"}><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {LEAVE_STATUSES.filter((s) => s !== "Cancelled").map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
