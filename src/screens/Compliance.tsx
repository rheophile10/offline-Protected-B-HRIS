import { useMemo, useState } from "react";
import { useApp, Modal, Field, useConfirm, useLiveQuery } from "../ui";
import {
  certCatalog,
  listCertifications,
  recordCertification,
  revokeCertification,
  deleteCertification,
  listOfficers,
  kpis,
  type CertType,
  type CertRow,
  type Officer,
  type Kpis,
} from "../lib/hris";

const EMPTY_KPI: Kpis = { officers: 0, budgeted: 0, filled: 0, deficit: 0, payroll: 0 };

const todayISO = () => new Date().toISOString().slice(0, 10);
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMonths(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
type Bucket = "Valid" | "Expiring" | "Expired" | "Revoked";
function bucketOf(r: CertRow, today: string, horizon: string): Bucket {
  if (r.status === "Revoked") return "Revoked";
  if (!r.expiry_date) return "Valid";
  if (r.expiry_date < today) return "Expired";
  if (r.expiry_date <= horizon) return "Expiring";
  return "Valid";
}
const pillClass: Record<Bucket, string> = { Valid: "ok", Expiring: "warn", Expired: "bad", Revoked: "muted" };
const rankOrder: Record<Bucket, number> = { Expired: 0, Expiring: 1, Valid: 2, Revoked: 3 };

export function Compliance() {
  const { refresh, notify } = useApp();
  const confirm = useConfirm();
  const catalog = useLiveQuery<CertType[]>(certCatalog, []);
  const allCerts = useLiveQuery<CertRow[]>(listCertifications, []);
  const k = useLiveQuery<Kpis>(kpis, EMPTY_KPI);
  const [certFilter, setCertFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [record, setRecord] = useState<{ badge?: number; code?: string } | null>(null);

  const today = todayISO();
  const horizon = addDays(today, 90);

  // current certification = latest issued per (officer, cert)
  const current = useMemo(() => {
    const m = new Map<string, CertRow>();
    for (const r of allCerts) {
      const key = r.badge_number + "|" + r.cert_code;
      const cur = m.get(key);
      if (!cur || (r.issued_date ?? "") > (cur.issued_date ?? "")) m.set(key, r);
    }
    return [...m.values()];
  }, [allCerts]);

  const counts = useMemo(() => {
    const c = { Valid: 0, Expiring: 0, Expired: 0, Revoked: 0 };
    for (const r of current) c[bucketOf(r, today, horizon)]++;
    const firearmsCurrent = current.filter(
      (r) => r.cert_code === "FIREARM" && ["Valid", "Expiring"].includes(bucketOf(r, today, horizon)),
    ).length;
    return { ...c, firearmsCurrent };
  }, [current, today, horizon]);

  const rows = useMemo(() => {
    let list = current;
    if (certFilter) list = list.filter((r) => r.cert_code === certFilter);
    if (statusFilter) list = list.filter((r) => bucketOf(r, today, horizon) === statusFilter);
    return [...list].sort((a, b) => {
      const ba = bucketOf(a, today, horizon), bb = bucketOf(b, today, horizon);
      if (rankOrder[ba] !== rankOrder[bb]) return rankOrder[ba] - rankOrder[bb];
      return (a.expiry_date ?? "9999") < (b.expiry_date ?? "9999") ? -1 : 1;
    });
  }, [current, certFilter, statusFilter, today, horizon]);

  const daysLeft = (exp: string | null) =>
    exp ? Math.round((Date.parse(exp) - Date.parse(today)) / 86_400_000) : null;

  return (
    <div className="screen">
      <header className="screen-head row">
        <div>
          <h1>Training &amp; Compliance</h1>
          <p className="muted">Current certifications across the roster (latest per officer).</p>
        </div>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setRecord({})}>+ Record certification</button>
        </div>
      </header>

      <div className="kpis">
        <Kpi label="Expired" value={counts.Expired} tone="bad" onClick={() => { setStatusFilter("Expired"); setCertFilter(""); }} />
        <Kpi label="Expiring ≤ 90 days" value={counts.Expiring} tone="warn" onClick={() => { setStatusFilter("Expiring"); setCertFilter(""); }} />
        <Kpi label="Valid" value={counts.Valid} tone="ok" onClick={() => { setStatusFilter("Valid"); setCertFilter(""); }} />
        <Kpi label="Firearms-current" value={`${counts.firearmsCurrent} / ${k.officers}`} tone={counts.firearmsCurrent < k.officers ? "warn" : "ok"} onClick={() => { setCertFilter("FIREARM"); setStatusFilter(""); }} />
      </div>

      <div className="toolbar" style={{ border: "none", background: "none", padding: "0 0 12px" }}>
        <span className="muted small">Filter:</span>
        <select value={certFilter} onChange={(e) => setCertFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">All certifications</option>
          {catalog.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">Any status</option>
          <option>Expired</option><option>Expiring</option><option>Valid</option><option>Revoked</option>
        </select>
        {(certFilter || statusFilter) && (
          <button className="btn small" onClick={() => { setCertFilter(""); setStatusFilter(""); }}>Clear</button>
        )}
        <span className="spacer" style={{ flex: 1 }} />
        <span className="muted small">{rows.length} shown</span>
      </div>

      <table className="tbl card">
        <thead>
          <tr>
            <th>Officer</th>
            <th>Rank</th>
            <th>Certification</th>
            <th>Issued</th>
            <th>Expires</th>
            <th className="num">Days left</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = bucketOf(r, today, horizon);
            const dl = daysLeft(r.expiry_date);
            return (
              <tr key={r.id}>
                <td>{r.officer_name}</td>
                <td className="muted">{r.rank}</td>
                <td>{r.cert_name}</td>
                <td className="mono">{r.issued_date ?? "—"}</td>
                <td className="mono">{r.expiry_date ?? "—"}</td>
                <td className={"num " + (dl !== null && dl < 0 ? "bad" : dl !== null && dl <= 90 ? "warn" : "")}>
                  {dl === null ? "—" : dl}
                </td>
                <td><span className={"pill " + pillClass[b]}>{b}</span></td>
                <td className="row-actions">
                  <button className="btn small" title="Record renewal" onClick={() => setRecord({ badge: r.badge_number, code: r.cert_code })}>Renew</button>
                  {r.status !== "Revoked" && (
                    <button className="icon" title="Revoke" onClick={async () => { await revokeCertification(r.id); refresh(); notify("Certification revoked.", "info"); }}>⊘</button>
                  )}
                  <button className="icon danger" title="Delete" onClick={async () => {
                    if (!confirm("Delete this certification record?")) return;
                    await deleteCertification(r.id); refresh(); notify("Deleted.", "info");
                  }}>🗑</button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={8} className="empty">No certifications match.</td></tr>}
        </tbody>
      </table>

      {record && (
        <RecordCert
          catalog={catalog}
          preset={record}
          onClose={() => setRecord(null)}
          onDone={() => { setRecord(null); refresh(); notify("Certification recorded.", "ok"); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone, onClick }: { label: string; value: number | string; tone: "bad" | "warn" | "ok"; onClick: () => void }) {
  return (
    <button className={"kpi kpi-btn " + tone} onClick={onClick}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </button>
  );
}

function RecordCert({
  catalog,
  preset,
  onClose,
  onDone,
}: {
  catalog: CertType[];
  preset: { badge?: number; code?: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useApp();
  const officers = useLiveQuery<Officer[]>(() => listOfficers(), []);
  const [badge, setBadge] = useState<number>(preset.badge ?? 0);
  const [code, setCode] = useState<string>(preset.code ?? "");
  const [issued, setIssued] = useState<string>(todayISO());
  const [expiry, setExpiry] = useState<string>("");

  const badgeVal = badge || officers[0]?.badge_number || 0;
  const codeVal = code || catalog[0]?.code || "";
  const cert = catalog.find((c) => c.code === codeVal);
  // auto-suggest expiry from validity when not set
  const expiryVal = expiry || (cert?.validity_months ? addMonths(issued, cert.validity_months) : "");

  const save = async () => {
    if (!badgeVal || !codeVal) return notify("Pick an officer and a certification.", "err");
    await recordCertification(badgeVal, codeVal, issued || null, expiryVal || null);
    onDone();
  };

  return (
    <Modal title="Record / renew certification" onClose={onClose}>
      <div className="form-grid">
        <Field label="Officer">
          <select value={badgeVal} onChange={(e) => setBadge(Number(e.target.value))}>
            {officers.map((o) => <option key={o.badge_number} value={o.badge_number}>{o.badge_number} — {o.name}</option>)}
          </select>
        </Field>
        <Field label="Certification">
          <select value={codeVal} onChange={(e) => { setCode(e.target.value); setExpiry(""); }}>
            {catalog.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Issued">
          <input type="date" value={issued} onChange={(e) => { setIssued(e.target.value); setExpiry(""); }} />
        </Field>
        <Field label="Expires" hint={cert?.validity_months ? `${cert.validity_months}-month validity` : "no expiry"}>
          <input type="date" value={expiryVal} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
