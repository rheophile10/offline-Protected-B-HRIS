import { useState } from "react";
import { useApp, Field } from "../ui";
import { readFileBytes, readFileText, download } from "../lib/files";
import { startFromEncrypted, startFromSchema, startWithDemo, SCHEMA_SQL } from "../lib/session";

type Mode = "open" | "new" | "demo";

export function SessionGate({ onLoaded }: { onLoaded: () => void }) {
  const { notify } = useApp();
  const [mode, setMode] = useState<Mode>("demo");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [schemaFile, setSchemaFile] = useState<File | null>(null);
  const [dumpFile, setDumpFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      if (!password) throw new Error("Enter a passphrase.");
      if (mode === "demo") {
        await startWithDemo(password);
      } else if (mode === "new") {
        if (password !== confirm) throw new Error("Passphrases do not match.");
        const schema = schemaFile ? await readFileText(schemaFile) : SCHEMA_SQL;
        await startFromSchema(schema, password);
      } else {
        if (!dumpFile) throw new Error("Choose an encrypted .hrisdump file.");
        const schema = schemaFile ? await readFileText(schemaFile) : SCHEMA_SQL;
        const bytes = await readFileBytes(dumpFile);
        await startFromEncrypted(schema, bytes, password, dumpFile.name); // throws on wrong password
      }
      onLoaded();
    } catch (e) {
      notify((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-head">
          <span className="logo big">⬡</span>
          <h1>Offline HRIS</h1>
          <p className="muted">
            Protected B · fully offline · CRDT sync. All data is encrypted at rest — the database lives only in
            memory until you export an encrypted changeset.
          </p>
        </div>

        <div className="seg">
          <button className={mode === "demo" ? "active" : ""} onClick={() => setMode("demo")}>Demo data</button>
          <button className={mode === "open" ? "active" : ""} onClick={() => setMode("open")}>Open truth</button>
          <button className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>New blank</button>
        </div>

        <div className="gate-body">
          {mode === "demo" && (
            <p className="muted small">
              Loads a built-in <strong>fictional</strong> Juárez Police Department dataset (invented names, badges,
              and salaries — not real personnel). Set a passphrase now — it will encrypt any changeset or CSV you
              export this session. Demo only; not for production data.
            </p>
          )}
          {(mode === "open" || mode === "new") && (
            <Field label="Schema (.sql)" hint="Optional — defaults to the built-in HRIS schema.">
              <FilePick accept=".sql" file={schemaFile} onPick={setSchemaFile} label="Choose schema .sql" />
            </Field>
          )}
          {mode === "open" && (
            <Field label="Encrypted truth (.hrisdump)">
              <FilePick accept=".hrisdump" file={dumpFile} onPick={setDumpFile} label="Choose .hrisdump" />
            </Field>
          )}

          <Field label="Passphrase">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Org / day passphrase"
              autoComplete="new-password"
              onKeyDown={(e) => e.key === "Enter" && mode !== "new" && go()}
            />
          </Field>
          {mode === "new" && (
            <Field label="Confirm passphrase">
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat passphrase"
                autoComplete="new-password"
              />
            </Field>
          )}

          <button className="btn primary full" disabled={busy} onClick={go}>
            {busy ? "Working…" : mode === "open" ? "Decrypt & open" : "Start session"}
          </button>

          {mode === "new" && (
            <button className="btn subtle full" onClick={() => download(SCHEMA_SQL, "hris_schema.sql", "application/sql")}>
              ⭱ Download the built-in schema.sql
            </button>
          )}
        </div>
      </div>
      <p className="gate-foot muted small">
        No network access is possible from this page (CSP <code>connect-src 'none'</code>). See standards.md.
      </p>
    </div>
  );
}

function FilePick({
  accept,
  file,
  onPick,
  label,
}: {
  accept: string;
  file: File | null;
  onPick: (f: File | null) => void;
  label: string;
}) {
  return (
    <label className="filepick">
      <input type="file" accept={accept} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <span className="filepick-btn">{file ? file.name : label}</span>
    </label>
  );
}
