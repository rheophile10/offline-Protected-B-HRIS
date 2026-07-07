import { useState } from "react";
import { useApp, Modal, Field, money, useConfirm, useLiveQuery } from "../ui";
import {
  listPositions,
  upsertPosition,
  deletePosition,
  staffing,
  ranks,
  detachments,
  type Position,
  type StaffingRow,
} from "../lib/hris";

const blank = (): Position => ({
  position_number: "",
  title: "",
  rank_requirement: null,
  term_years: null,
  reports_to: null,
  detachment: null,
  headcount_qty: 1,
  pay_min: null,
  pay_max: null,
  job_description: null,
});

export function Positions() {
  const { refresh, notify } = useApp();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Position | null>(null);
  const [isNew, setIsNew] = useState(false);

  const positions = useLiveQuery<Position[]>(() => listPositions(search), [], [search]);
  const staff = useLiveQuery<StaffingRow[]>(staffing, []);
  const rankList = useLiveQuery<string[]>(ranks, []);
  const detList = useLiveQuery<string[]>(detachments, []);
  const fill = new Map(staff.map((s) => [s.position_number, s]));

  const save = async () => {
    if (!editing) return;
    if (!editing.position_number.trim()) return notify("Position number is required.", "err");
    if (!editing.title.trim()) return notify("Title is required.", "err");
    try {
      await upsertPosition(editing, isNew);
      setEditing(null);
      refresh();
      notify(isNew ? "Position added." : "Position updated.", "ok");
    } catch (e) {
      notify((e as Error).message, "err");
    }
  };
  const remove = async (p: Position) => {
    if (!confirm(`Delete ${p.title} (${p.position_number}) and its assignments?`)) return;
    await deletePosition(p.position_number);
    refresh();
    notify("Position deleted.", "info");
  };

  return (
    <div className="screen">
      <header className="screen-head row">
        <div>
          <h1>Positions</h1>
          <p className="muted">{positions.length} in establishment</p>
        </div>
        <div className="head-actions">
          <input
            className="search"
            placeholder="Search title, number, detachment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn primary" onClick={() => { setEditing(blank()); setIsNew(true); }}>
            + Add position
          </button>
        </div>
      </header>

      <table className="tbl card">
        <thead>
          <tr>
            <th>No.</th>
            <th>Title</th>
            <th>Rank req.</th>
            <th>Detachment</th>
            <th className="num">Filled / Budget</th>
            <th className="num">Pay range</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const s = fill.get(p.position_number);
            return (
              <tr key={p.position_number}>
                <td className="mono">{p.position_number}</td>
                <td>{p.title}</td>
                <td>{p.rank_requirement}</td>
                <td className="muted">{p.detachment}</td>
                <td className="num">
                  {s ? (
                    <span className={s.deficit > 0 ? "warn" : "ok"}>
                      {s.filled} / {p.headcount_qty}
                    </span>
                  ) : (
                    p.headcount_qty
                  )}
                </td>
                <td className="num mono">
                  {money(p.pay_min)}–{money(p.pay_max)}
                </td>
                <td className="row-actions">
                  <button className="icon" onClick={() => { setEditing({ ...p }); setIsNew(false); }} title="Edit">✎</button>
                  <button className="icon danger" onClick={() => remove(p)} title="Delete">🗑</button>
                </td>
              </tr>
            );
          })}
          {positions.length === 0 && (
            <tr>
              <td colSpan={7} className="empty">No positions match.</td>
            </tr>
          )}
        </tbody>
      </table>

      {editing && (
        <Modal title={isNew ? "Add position" : `Edit ${editing.title}`} onClose={() => setEditing(null)} wide>
          <div className="form-grid">
            <Field label="Position number">
              <input
                value={editing.position_number}
                disabled={!isNew}
                onChange={(e) => setEditing({ ...editing, position_number: e.target.value })}
              />
            </Field>
            <Field label="Title">
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <Field label="Rank requirement">
              <select
                value={editing.rank_requirement ?? ""}
                onChange={(e) => setEditing({ ...editing, rank_requirement: e.target.value || null })}
              >
                <option value="">—</option>
                {rankList.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Detachment">
              <select
                value={editing.detachment ?? ""}
                onChange={(e) => setEditing({ ...editing, detachment: e.target.value || null })}
              >
                <option value="">—</option>
                {detList.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Reports to" hint="Position number or external body">
              <input
                value={editing.reports_to ?? ""}
                onChange={(e) => setEditing({ ...editing, reports_to: e.target.value || null })}
              />
            </Field>
            <Field label="Term (years)">
              <input
                type="number"
                value={editing.term_years ?? ""}
                onChange={(e) => setEditing({ ...editing, term_years: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
            <Field label="Headcount">
              <input
                type="number"
                value={editing.headcount_qty}
                onChange={(e) => setEditing({ ...editing, headcount_qty: Number(e.target.value) })}
              />
            </Field>
            <Field label="Pay min">
              <input
                type="number"
                value={editing.pay_min ?? ""}
                onChange={(e) => setEditing({ ...editing, pay_min: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
            <Field label="Pay max">
              <input
                type="number"
                value={editing.pay_max ?? ""}
                onChange={(e) => setEditing({ ...editing, pay_max: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
          </div>
          <Field label="Job description">
            <textarea
              rows={4}
              value={editing.job_description ?? ""}
              onChange={(e) => setEditing({ ...editing, job_description: e.target.value || null })}
            />
          </Field>
          <div className="modal-actions">
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
