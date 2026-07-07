import { useMemo } from "react";
import { useLiveQuery } from "../ui";
import { listOfficers, kpis, type Officer, type Kpis } from "../lib/hris";

const EMPTY_KPI: Kpis = { officers: 0, budgeted: 0, filled: 0, deficit: 0, payroll: 0 };
const PENSION_YEARS = 30; // illustrative full-pension service milestone

const todayISO = () => new Date().toISOString().slice(0, 10);
function addYears(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}
const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000);

export function Planning() {
  const officers = useLiveQuery<Officer[]>(() => listOfficers(), []);
  const k = useLiveQuery<Kpis>(kpis, EMPTY_KPI);
  const today = todayISO();

  const withService = useMemo(
    () =>
      officers
        .filter((o) => o.start_date)
        .map((o) => {
          const service = yearsBetween(o.start_date as string, today);
          const eligibleDate = addYears(o.start_date as string, PENSION_YEARS);
          return { ...o, service, eligibleDate };
        }),
    [officers, today],
  );

  const horizons = useMemo(() => {
    return [1, 2, 3, 5].map((yrs) => {
      const date = addYears(today, yrs);
      const cumulative = withService.filter((o) => o.eligibleDate <= date).length;
      return { yrs, date, cumulative, projectedDeficit: k.deficit + cumulative };
    });
  }, [withService, today, k.deficit]);

  const nearing = useMemo(
    () => withService.filter((o) => o.service >= PENSION_YEARS - 5).sort((a, b) => (a.eligibleDate < b.eligibleDate ? -1 : 1)),
    [withService],
  );

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Workforce Planning</h1>
        <p className="muted">
          Retirement exposure projected from length of service (illustrative {PENSION_YEARS}-year full-pension
          milestone). Projected deficit assumes eligible officers retire and are not backfilled.
        </p>
      </header>

      <div className="kpis">
        <div className="kpi"><div className="kpi-value">{k.filled}</div><div className="kpi-label">Currently filled</div></div>
        <div className={"kpi " + (k.deficit > 0 ? "warn" : "ok")}><div className="kpi-value">{k.deficit}</div><div className="kpi-label">Current deficit</div></div>
        <div className="kpi warn"><div className="kpi-value">{nearing.length}</div><div className="kpi-label">Within 5 yrs of pension</div></div>
        <div className="kpi bad"><div className="kpi-value">{horizons[3]?.projectedDeficit ?? k.deficit}</div><div className="kpi-label">Proj. deficit @ 5 yrs</div></div>
      </div>

      <div className="grid-2">
        <section className="card pad">
          <h2>Projected vacancy deficit by horizon</h2>
          <table className="tbl">
            <thead>
              <tr><th>Horizon</th><th>As of</th><th className="num">Retirement-eligible</th><th className="num">Projected deficit</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Today</td><td className="mono">{today}</td><td className="num">0</td>
                <td className={"num " + (k.deficit > 0 ? "warn" : "ok")}>{k.deficit}</td>
              </tr>
              {horizons.map((h) => (
                <tr key={h.yrs}>
                  <td>+{h.yrs} year{h.yrs > 1 ? "s" : ""}</td>
                  <td className="mono">{h.date}</td>
                  <td className="num">{h.cumulative}</td>
                  <td className="num bad">{h.projectedDeficit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card pad">
          <h2>Officers nearing pension eligibility</h2>
          <table className="tbl">
            <thead>
              <tr><th>Officer</th><th>Rank</th><th className="num">Years of service</th><th>Eligible</th></tr>
            </thead>
            <tbody>
              {nearing.map((o) => (
                <tr key={o.badge_number}>
                  <td>{o.name}</td>
                  <td className="muted">{o.rank}</td>
                  <td className="num">{o.service.toFixed(1)}</td>
                  <td className={"mono " + (o.eligibleDate <= today ? "bad" : "")}>{o.eligibleDate}</td>
                </tr>
              ))}
              {nearing.length === 0 && <tr><td colSpan={4} className="empty">No officers within 5 years of the milestone.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
