import { money, useLiveQuery } from "../ui";
import { kpis, staffing, rankHeadcount, type Kpis, type StaffingRow } from "../lib/hris";

const EMPTY_KPI: Kpis = { officers: 0, budgeted: 0, filled: 0, deficit: 0, payroll: 0 };

export function Dashboard() {
  const k = useLiveQuery(kpis, EMPTY_KPI);
  const rows = useLiveQuery<StaffingRow[]>(staffing, []);
  const ranks = useLiveQuery<{ rank: string; budgeted: number; filled: number }[]>(rankHeadcount, []);
  const maxBudget = Math.max(1, ...ranks.map((r) => r.budgeted));

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Dashboard</h1>
        <p className="muted">Establishment, staffing and payroll at a glance.</p>
      </header>

      <div className="kpis">
        <Kpi label="Officers on roster" value={k.officers} />
        <Kpi label="Budgeted headcount" value={k.budgeted} />
        <Kpi label="Positions filled" value={k.filled} />
        <Kpi label="Vacancy deficit" value={k.deficit} tone={k.deficit > 0 ? "warn" : "ok"} />
        <Kpi label="Active payroll" value={money(k.payroll)} />
      </div>

      <div className="grid-2">
        <section className="card pad">
          <h2>Headcount by rank</h2>
          <div className="bars">
            {ranks.map((r) => (
              <div className="bar-row" key={r.rank}>
                <span className="bar-label">{r.rank}</span>
                <div className="bar-track">
                  <div className="bar-budget" style={{ width: `${(r.budgeted / maxBudget) * 100}%` }} />
                  <div className="bar-fill" style={{ width: `${(r.filled / maxBudget) * 100}%` }} />
                </div>
                <span className="bar-num">
                  {r.filled}/{r.budgeted}
                </span>
              </div>
            ))}
          </div>
          <div className="legend">
            <span><i className="sw fill" /> Filled</span>
            <span><i className="sw budget" /> Budgeted</span>
          </div>
        </section>

        <section className="card pad">
          <h2>Largest staffing gaps</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>Position</th>
                <th>Detachment</th>
                <th className="num">Filled</th>
                <th className="num">Budget</th>
                <th className="num">Deficit</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((r) => (
                <tr key={r.position_number}>
                  <td>{r.title}</td>
                  <td className="muted">{r.detachment}</td>
                  <td className="num">{r.filled}</td>
                  <td className="num">{r.budgeted}</td>
                  <td className={"num " + (r.deficit > 0 ? "warn" : "ok")}>{r.deficit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "ok" }) {
  return (
    <div className={"kpi" + (tone ? " " + tone : "")}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
