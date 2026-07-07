import { useState } from "react";
import { useApp, Modal, Field, money, useConfirm, useLiveQuery } from "../ui";
import {
  listOfficers,
  upsertOfficer,
  deleteOfficer,
  currentPostings,
  ranks,
  OFFICER_STATUSES,
  type Officer,
} from "../lib/hris";

const blank = (): Officer => ({
  badge_number: 0,
  name: "",
  rank: null,
  start_date: null,
  current_salary: null,
  status: "Active",
});

export function Officers() {
  const { refresh, notify } = useApp();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Officer | null>(null);
  const [isNew, setIsNew] = useState(false);

  const officers = useLiveQuery<Officer[]>(() => listOfficers(search), [], [search]);
  const postings = useLiveQuery<Record<number, string>>(currentPostings, {});
  const rankList = useLiveQuery<string[]>(ranks, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.badge_number) return notify("Badge number is required.", "err");
    if (!editing.name.trim()) return notify("Name is required.", "err");
    try {
      await upsertOfficer(editing, isNew);
      setEditing(null);
      refresh();
      notify(isNew ? "Officer added." : "Officer updated.", "ok");
    } catch (e) {
      notify((e as Error).message, "err");
    }
  };
  const remove = async (o: Officer) => {
    if (!confirm(`Delete ${o.name} (badge ${o.badge_number}) and their assignments?`)) return;
    await deleteOfficer(o.badge_number);
    refresh();
    notify("Officer deleted.", "info");
  };

  return (
    <div className="screen">
      <header className="screen-head row">
        <div>
          <h1>Officers</h1>
          <p className="muted">{officers.length} on roster</p>
        </div>
        <div className="head-actions">
          <input
            className="search"
            placeholder="Search name, rank, badge…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="btn primary"
            onClick={() => {
              setEditing(blank());
              setIsNew(true);
            }}
          >
            + Add officer
          </button>
        </div>
      </header>

      <table className="tbl card">
        <thead>
          <tr>
            <th>Badge</th>
            <th>Name</th>
            <th>Rank</th>
            <th>Current posting</th>
            <th>Start date</th>
            <th className="num">Salary</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {officers.map((o) => (
            <tr key={o.badge_number}>
              <td className="mono">{o.badge_number}</td>
              <td>{o.name}</td>
              <td>{o.rank}</td>
              <td className="muted">{postings[o.badge_number] ?? "—"}</td>
              <td className="mono">{o.start_date ?? "—"}</td>
              <td className="num">{money(o.current_salary)}</td>
              <td>
                <span className={"pill " + statusClass(o.status)}>{o.status}</span>
              </td>
              <td className="row-actions">
                <button className="icon" onClick={() => { setEditing({ ...o }); setIsNew(false); }} title="Edit">✎</button>
                <button className="icon danger" onClick={() => remove(o)} title="Delete">🗑</button>
              </td>
            </tr>
          ))}
          {officers.length === 0 && (
            <tr>
              <td colSpan={8} className="empty">No officers match.</td>
            </tr>
          )}
        </tbody>
      </table>

      {editing && (
        <Modal title={isNew ? "Add officer" : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="form-grid">
            <Field label="Badge number">
              <input
                type="number"
                value={editing.badge_number || ""}
                disabled={!isNew}
                onChange={(e) => setEditing({ ...editing, badge_number: Number(e.target.value) })}
              />
            </Field>
            <Field label="Name">
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Rank">
              <select value={editing.rank ?? ""} onChange={(e) => setEditing({ ...editing, rank: e.target.value || null })}>
                <option value="">—</option>
                {rankList.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {OFFICER_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Start date">
              <input
                type="date"
                value={editing.start_date ?? ""}
                onChange={(e) => setEditing({ ...editing, start_date: e.target.value || null })}
              />
            </Field>
            <Field label="Current salary">
              <input
                type="number"
                value={editing.current_salary ?? ""}
                onChange={(e) => setEditing({ ...editing, current_salary: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function statusClass(s: string): string {
  if (s === "Active") return "ok";
  if (s === "Retired" || s === "Terminated") return "muted";
  return "warn";
}
