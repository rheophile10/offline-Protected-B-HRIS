import { useMemo, useState } from "react";
import { useLiveQuery } from "../ui";
import {
  recentChanges,
  changesByOperator,
  listSessionLog,
  type ChangeEventRow,
  type SessionLogRow,
} from "../lib/hris";

const when = (ms: number) => new Date(ms).toLocaleString();

export function Audit() {
  const changes = useLiveQuery<ChangeEventRow[]>(() => recentChanges(200), []);
  const sessions = useLiveQuery<SessionLogRow[]>(() => listSessionLog(200), []);
  const byOp = useLiveQuery<{ user_id: string; n: number }[]>(changesByOperator, []);
  const [op, setOp] = useState("");

  const operators = useMemo(
    () => Array.from(new Set([...changes, ...sessions].map((r) => r.user_id).filter(Boolean))).sort(),
    [changes, sessions],
  );
  const filtChanges = op ? changes.filter((c) => c.user_id === op) : changes;
  const filtSessions = op ? sessions.filter((s) => s.user_id === op) : sessions;

  return (
    <div className="screen">
      <header className="screen-head row">
        <div>
          <h1>Audit</h1>
          <p className="muted">Who changed what, and every session/export event — attributed and merge-visible.</p>
        </div>
        <div className="head-actions">
          <select value={op} onChange={(e) => setOp(e.target.value)} style={{ width: "auto" }}>
            <option value="">All operators</option>
            {operators.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </header>

      {byOp.length > 0 && (
        <div className="comp-bar">
          {byOp.map((o) => (
            <div className="comp-chip" key={o.user_id || "(none)"}>
              <strong>{o.user_id || "(unattributed)"}</strong>
              <div className="muted small">{o.n} change(s)</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2">
        <section className="card" style={{ overflow: "hidden" }}>
          <div className="result-head"><span className="muted">Change log ({filtChanges.length})</span></div>
          <div className="table-scroll" style={{ maxHeight: "56vh" }}>
            <table className="tbl">
              <thead><tr><th>When</th><th>Operator</th><th>Entity</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>
                {filtChanges.map((c, i) => (
                  <tr key={i}>
                    <td className="mono">{when(c.at)}</td>
                    <td>{c.user_id}</td>
                    <td>{c.entity_table} <span className="muted mono">{c.entity_id}</span></td>
                    <td>{c.action}</td>
                    <td className="muted">{c.new_val ?? ""}</td>
                  </tr>
                ))}
                {filtChanges.length === 0 && <tr><td colSpan={5} className="empty">No changes recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" style={{ overflow: "hidden" }}>
          <div className="result-head"><span className="muted">Session log ({filtSessions.length})</span></div>
          <div className="table-scroll" style={{ maxHeight: "56vh" }}>
            <table className="tbl">
              <thead><tr><th>When</th><th>Operator</th><th>Event</th><th>Details</th></tr></thead>
              <tbody>
                {filtSessions.map((s, i) => (
                  <tr key={i}>
                    <td className="mono">{when(s.at)}</td>
                    <td>{s.user_id || "—"}</td>
                    <td><span className="pill">{s.event}</span></td>
                    <td className="muted">{s.details ?? ""}</td>
                  </tr>
                ))}
                {filtSessions.length === 0 && <tr><td colSpan={4} className="empty">No session events.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
