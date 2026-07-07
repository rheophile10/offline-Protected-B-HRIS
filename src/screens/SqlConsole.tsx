import { useState } from "react";
import { useApp, useLiveQuery } from "../ui";
import { exec, lintScript, type QueryResult } from "../lib/db";
import { toCsv } from "../lib/files";
import { exportEncrypted } from "../lib/session";

const SAMPLE = "SELECT * FROM v_position_staffing ORDER BY deficit DESC;";

export function SqlConsole() {
  const { notify } = useApp();
  const [sql, setSql] = useState(SAMPLE);
  const [results, setResults] = useState<QueryResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lint = useLiveQuery<string[]>(() => lintScript(sql), [], [sql]);

  const run = async () => {
    setError(null);
    try {
      setResults(await exec(sql));
      notify("Query executed.", "ok");
    } catch (e) {
      setResults(null);
      setError((e as Error).message);
    }
  };

  const exportCsv = async (r: QueryResult, i: number) => {
    try {
      await exportEncrypted(toCsv(r.columns, r.values), `result-${i + 1}.csv`);
      notify("Encrypted CSV exported (.csv.enc).", "ok");
    } catch (e) {
      notify("Export failed: " + (e as Error).message, "err");
    }
  };

  return (
    <div className="screen sql-screen">
      <header className="screen-head">
        <h1>SQL Console</h1>
        <p className="muted">
          Read/write SQL against the in-memory cr-sqlite database. Result exports are encrypted (.csv.enc) — plain
          CSV is not offered (standards §2). Writes here are captured by CRDT changesets but are not individually
          attributed in the audit log.
        </p>
      </header>

      <div className="sql-editor card">
        <textarea
          spellCheck={false}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="Write SQL…  Ctrl/Cmd+Enter to run"
        />
        <div className="sql-bar">
          <button className="btn primary" onClick={run}>
            ▶ Run <span className="kbd">Ctrl+↵</span>
          </button>
          <span className={"lint " + (lint.length ? "bad" : "ok")}>
            {lint.length ? `⚠ ${lint.length} statement error(s)` : "✓ no syntax errors"}
          </span>
        </div>
        {lint.length > 0 && (
          <ul className="lint-list">
            {lint.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </div>

      {error && <div className="sql-error card">SQL error: {error}</div>}

      <div className="sql-results">
        {results?.map((r, i) => (
          <div className="card result-block" key={i}>
            <div className="result-head">
              <span className="muted">
                result {i + 1} — {r.values.length} row(s) × {r.columns.length} col(s)
              </span>
              <button className="btn small" onClick={() => exportCsv(r, i)}>
                🔒 Export CSV (encrypted)
              </button>
            </div>
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    {r.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.values.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((v, ci) => (
                        <td key={ci} className={v === null ? "muted" : ""}>
                          {v === null ? "NULL" : v instanceof Uint8Array ? `[blob ${v.length}b]` : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {results && results.length === 0 && (
          <div className="card empty">Statement executed — no rows returned.</div>
        )}
      </div>
    </div>
  );
}
