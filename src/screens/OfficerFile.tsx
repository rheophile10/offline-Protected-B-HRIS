import { useState } from "react";
import { useApp, Modal, Field, useConfirm, useLiveQuery } from "../ui";
import {
  listOfficers,
  currentPostings,
  listReviews,
  addReview,
  deleteReview,
  listConduct,
  addConduct,
  updateConduct,
  deleteConduct,
  listContacts,
  addContact,
  deleteContact,
  CONDUCT_TYPES,
  CONDUCT_STATUSES,
  DISPOSITIONS,
  type Officer,
  type Review,
  type ConductRecord,
  type EmergencyContact,
} from "../lib/hris";

const todayISO = () => new Date().toISOString().slice(0, 10);
const conductPill: Record<string, string> = { Open: "warn", "Under Review": "warn", Closed: "muted" };

export function OfficerFile() {
  const { refresh, notify } = useApp();
  const confirm = useConfirm();
  const officers = useLiveQuery<Officer[]>(() => listOfficers(), []);
  const postings = useLiveQuery<Record<number, string>>(currentPostings, {});
  const [badge, setBadge] = useState(0);
  const badgeVal = badge || officers[0]?.badge_number || 0;
  const officer = officers.find((o) => o.badge_number === badgeVal);

  const reviews = useLiveQuery<Review[]>(() => (badgeVal ? listReviews(badgeVal) : Promise.resolve([])), [], [badgeVal]);
  const conduct = useLiveQuery<ConductRecord[]>(() => (badgeVal ? listConduct(badgeVal) : Promise.resolve([])), [], [badgeVal]);
  const contacts = useLiveQuery<EmergencyContact[]>(() => (badgeVal ? listContacts(badgeVal) : Promise.resolve([])), [], [badgeVal]);

  const [modal, setModal] = useState<null | "contact" | "review" | "conduct">(null);
  const [editConduct, setEditConduct] = useState<ConductRecord | null>(null);

  return (
    <div className="screen">
      <header className="screen-head row">
        <div>
          <h1>Officer File</h1>
          <p className="muted">Emergency contacts, performance, and conduct — per officer.</p>
        </div>
        <div className="head-actions">
          <select value={badgeVal} onChange={(e) => setBadge(Number(e.target.value))} style={{ width: 280 }}>
            {officers.map((o) => <option key={o.badge_number} value={o.badge_number}>{o.badge_number} — {o.name} ({o.rank})</option>)}
          </select>
        </div>
      </header>

      {officer && (
        <div className="card pad" style={{ marginBottom: 16 }}>
          <div className="filecard">
            <div className="file-avatar">{officer.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("")}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{officer.name}</div>
              <div className="muted small">Badge {officer.badge_number} · {officer.rank} · {postings[badgeVal] ?? "unassigned"} · {officer.status}</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <section className="card pad">
          <h2 className="rowhead">Emergency contacts <button className="btn small" onClick={() => setModal("contact")}>+ Add</button></h2>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th></th></tr></thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td><td className="muted">{c.relationship}</td><td className="mono">{c.phone}</td>
                  <td className="row-actions"><button className="icon danger" onClick={async () => { if (!confirm("Delete contact?")) return; await deleteContact(c.id); refresh(); }}>🗑</button></td>
                </tr>
              ))}
              {contacts.length === 0 && <tr><td colSpan={4} className="empty">No emergency contacts.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="card pad">
          <h2 className="rowhead">Performance reviews <button className="btn small" onClick={() => setModal("review")}>+ Add</button></h2>
          <table className="tbl">
            <thead><tr><th>Period</th><th>Rating</th><th>Reviewer</th><th></th></tr></thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.period}</td>
                  <td>{r.rating != null ? "★".repeat(r.rating) + "☆".repeat(Math.max(0, 5 - r.rating)) : "—"}</td>
                  <td className="muted">{r.reviewer}</td>
                  <td className="row-actions"><button className="icon danger" onClick={async () => { if (!confirm("Delete review?")) return; await deleteReview(r.id); refresh(); }}>🗑</button></td>
                </tr>
              ))}
              {reviews.length === 0 && <tr><td colSpan={4} className="empty">No reviews.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card pad" style={{ marginTop: 16 }}>
        <h2 className="rowhead">Conduct records <button className="btn small" onClick={() => setModal("conduct")}>+ Add</button></h2>
        <table className="tbl">
          <thead><tr><th>Type</th><th>Opened</th><th>Status</th><th>Disposition</th><th>Summary</th><th></th></tr></thead>
          <tbody>
            {conduct.map((c) => (
              <tr key={c.id}>
                <td>{c.type}</td>
                <td className="mono">{c.opened}</td>
                <td><span className={"pill " + (conductPill[c.status] ?? "warn")}>{c.status}</span></td>
                <td className="muted">{c.disposition ?? "—"}</td>
                <td className="muted">{c.summary}</td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditConduct(c)}>Update</button>
                  <button className="icon danger" onClick={async () => { if (!confirm("Delete conduct record?")) return; await deleteConduct(c.id); refresh(); }}>🗑</button>
                </td>
              </tr>
            ))}
            {conduct.length === 0 && <tr><td colSpan={6} className="empty">No conduct records.</td></tr>}
          </tbody>
        </table>
      </section>

      {modal === "contact" && <AddContact badge={badgeVal} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); notify("Contact added.", "ok"); }} />}
      {modal === "review" && <AddReview badge={badgeVal} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); notify("Review added.", "ok"); }} />}
      {modal === "conduct" && <AddConduct badge={badgeVal} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); notify("Conduct record added.", "ok"); }} />}
      {editConduct && <EditConduct rec={editConduct} onClose={() => setEditConduct(null)} onDone={() => { setEditConduct(null); refresh(); notify("Conduct updated.", "ok"); }} />}
    </div>
  );
}

function AddContact({ badge, onClose, onDone }: { badge: number; onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const [name, setName] = useState(""); const [rel, setRel] = useState(""); const [phone, setPhone] = useState("");
  return (
    <Modal title="Add emergency contact" onClose={onClose}>
      <div className="form-grid">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Relationship"><input value={rel} onChange={(e) => setRel(e.target.value)} /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => { if (!name.trim()) return notify("Name required.", "err"); await addContact(badge, name.trim(), rel, phone); onDone(); }}>Save</button>
      </div>
    </Modal>
  );
}
function AddReview({ badge, onClose, onDone }: { badge: number; onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const [period, setPeriod] = useState("2026-H1"); const [rating, setRating] = useState(4); const [reviewer, setReviewer] = useState(""); const [summary, setSummary] = useState("");
  return (
    <Modal title="Add performance review" onClose={onClose}>
      <div className="form-grid">
        <Field label="Period" hint="e.g. 2026-H1"><input value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
        <Field label="Rating (1–5)"><input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} /></Field>
        <Field label="Reviewer"><input value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></Field>
      </div>
      <Field label="Summary"><textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => { if (!period.trim()) return notify("Period required.", "err"); await addReview(badge, period.trim(), rating, reviewer, summary); onDone(); }}>Save</button>
      </div>
    </Modal>
  );
}
function AddConduct({ badge, onClose, onDone }: { badge: number; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState(CONDUCT_TYPES[0]); const [opened, setOpened] = useState(todayISO()); const [status, setStatus] = useState("Open"); const [summary, setSummary] = useState("");
  return (
    <Modal title="Add conduct record" onClose={onClose}>
      <div className="form-grid">
        <Field label="Type"><select value={type} onChange={(e) => setType(e.target.value)}>{CONDUCT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Opened"><input type="date" value={opened} onChange={(e) => setOpened(e.target.value)} /></Field>
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}>{CONDUCT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <Field label="Summary"><textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => { await addConduct(badge, type, opened, status, summary); onDone(); }}>Save</button>
      </div>
    </Modal>
  );
}
function EditConduct({ rec, onClose, onDone }: { rec: ConductRecord; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState(rec.status); const [disp, setDisp] = useState(rec.disposition ?? "");
  return (
    <Modal title={`Update conduct — ${rec.type}`} onClose={onClose}>
      <div className="form-grid">
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}>{CONDUCT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Disposition"><select value={disp} onChange={(e) => setDisp(e.target.value)}>{DISPOSITIONS.map((d) => <option key={d} value={d}>{d || "—"}</option>)}</select></Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => { await updateConduct(rec.id, status, disp); onDone(); }}>Save</button>
      </div>
    </Modal>
  );
}
