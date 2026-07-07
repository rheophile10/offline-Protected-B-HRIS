import { useMemo, useState } from "react";
import { useApp, Modal, Field, useConfirm, useLiveQuery } from "../ui";
import {
  listAssets,
  addAsset,
  setAssetStatus,
  deleteAsset,
  issueAsset,
  returnAsset,
  listOfficers,
  ASSET_KINDS,
  ASSET_STATUSES,
  type AssetRow,
  type Officer,
} from "../lib/hris";

const todayISO = () => new Date().toISOString().slice(0, 10);
const statusPill: Record<string, string> = { "In service": "ok", Maintenance: "warn", Retired: "muted" };

export function Equipment() {
  const { refresh, notify } = useApp();
  const confirm = useConfirm();
  const assets = useLiveQuery<AssetRow[]>(listAssets, []);
  const [adding, setAdding] = useState(false);
  const [issuing, setIssuing] = useState<AssetRow | null>(null);
  const [kindFilter, setKindFilter] = useState("");

  const kpi = useMemo(() => {
    const inService = assets.filter((a) => a.status === "In service").length;
    const issued = assets.filter((a) => a.holder_badge != null).length;
    const available = assets.filter((a) => a.status === "In service" && a.holder_badge == null).length;
    return { inService, issued, available };
  }, [assets]);

  const rows = kindFilter ? assets.filter((a) => a.kind === kindFilter) : assets;

  return (
    <div className="screen">
      <header className="screen-head row">
        <div>
          <h1>Equipment</h1>
          <p className="muted">Asset register and issue / return.</p>
        </div>
        <div className="head-actions">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="">All kinds</option>
            {ASSET_KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add asset</button>
        </div>
      </header>

      <div className="kpis">
        <div className="kpi ok"><div className="kpi-value">{kpi.inService}</div><div className="kpi-label">In service</div></div>
        <div className="kpi"><div className="kpi-value">{kpi.issued}</div><div className="kpi-label">Issued</div></div>
        <div className="kpi"><div className="kpi-value">{kpi.available}</div><div className="kpi-label">Available</div></div>
      </div>

      <table className="tbl card">
        <thead>
          <tr><th>Tag</th><th>Kind</th><th>Serial</th><th>Status</th><th>Holder</th><th>Issued</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.tag}>
              <td className="mono">{a.tag}</td>
              <td>{a.kind}</td>
              <td className="mono muted">{a.serial}</td>
              <td>
                <select className="ministatus" value={a.status} onChange={async (e) => { await setAssetStatus(a.tag, e.target.value); refresh(); }}>
                  {ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td>{a.holder_name ?? <span className="muted">— available —</span>}</td>
              <td className="mono">{a.issued ?? "—"}</td>
              <td className="row-actions">
                {a.holder_badge == null ? (
                  <button className="btn small good" disabled={a.status !== "In service"} onClick={() => setIssuing(a)}>Issue</button>
                ) : (
                  <button className="btn small" onClick={async () => { await returnAsset(a.tag); refresh(); notify("Returned.", "ok"); }}>Return</button>
                )}
                <button className="icon danger" title="Delete" onClick={async () => { if (!confirm(`Delete asset ${a.tag}?`)) return; await deleteAsset(a.tag); refresh(); }}>🗑</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="empty">No assets.</td></tr>}
        </tbody>
      </table>

      {adding && <AddAsset onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); notify("Asset added.", "ok"); }} />}
      {issuing && <IssueAsset asset={issuing} onClose={() => setIssuing(null)} onDone={() => { setIssuing(null); refresh(); notify("Asset issued.", "ok"); }} />}
    </div>
  );
}

function AddAsset({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const [tag, setTag] = useState(""); const [kind, setKind] = useState(ASSET_KINDS[0]); const [serial, setSerial] = useState("");
  return (
    <Modal title="Add asset" onClose={onClose}>
      <div className="form-grid">
        <Field label="Asset tag" hint="centrally allocated"><input value={tag} onChange={(e) => setTag(e.target.value)} /></Field>
        <Field label="Kind"><select value={kind} onChange={(e) => setKind(e.target.value)}>{ASSET_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Serial"><input value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => { if (!tag.trim()) return notify("Tag required.", "err"); await addAsset(tag.trim(), kind, serial); onDone(); }}>Save</button>
      </div>
    </Modal>
  );
}
function IssueAsset({ asset, onClose, onDone }: { asset: AssetRow; onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const officers = useLiveQuery<Officer[]>(() => listOfficers(), []);
  const [badge, setBadge] = useState(0); const [date, setDate] = useState(todayISO());
  const badgeVal = badge || officers[0]?.badge_number || 0;
  return (
    <Modal title={`Issue ${asset.tag} (${asset.kind})`} onClose={onClose}>
      <div className="form-grid">
        <Field label="Officer">
          <select value={badgeVal} onChange={(e) => setBadge(Number(e.target.value))}>
            {officers.map((o) => <option key={o.badge_number} value={o.badge_number}>{o.badge_number} — {o.name}</option>)}
          </select>
        </Field>
        <Field label="Issue date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn good" onClick={async () => { if (!badgeVal) return notify("Pick an officer.", "err"); await issueAsset(asset.tag, badgeVal, date); onDone(); }}>Issue</button>
      </div>
    </Modal>
  );
}
