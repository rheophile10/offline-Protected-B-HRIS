import { useState } from "react";
import { useApp, Field, useLiveQuery } from "../ui";
import { exportTruthDump, exportChanges, decryptToText, getWatermark } from "../lib/session";
import { readFileBytes, download } from "../lib/files";
import { recentChanges, type ChangeEventRow } from "../lib/hris";

export function Security({ onLock, userName }: { onLock: () => void; userName: string }) {
  const { notify } = useApp();
  const [decFile, setDecFile] = useState<File | null>(null);
  const [decPw, setDecPw] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const changes = useLiveQuery<ChangeEventRow[]>(() => recentChanges(50), []);

  const saveChanges = async () => {
    try {
      const { empty } = await exportChanges(userName);
      notify(empty ? "Exported (no changes since load)." : "Encrypted changeset exported (.hrischanges).", empty ? "info" : "ok");
    } catch (e) {
      notify("Export failed: " + (e as Error).message, "err");
    }
  };
  const saveTruth = async () => {
    try {
      await exportTruthDump();
      notify("Encrypted truth dump exported (.hrisdump).", "ok");
    } catch (e) {
      notify("Export failed: " + (e as Error).message, "err");
    }
  };
  const decrypt = async () => {
    if (!decFile) return notify("Choose an encrypted file.", "err");
    if (!decPw) return notify("Enter the passphrase.", "err");
    try {
      const text = await decryptToText(await readFileBytes(decFile), decPw);
      setPreview(text);
      notify("Decrypted successfully.", "ok");
    } catch (e) {
      setPreview(null);
      notify((e as Error).message, "err");
    }
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Data &amp; Security</h1>
        <p className="muted">
          Protected B personnel data. Encrypted exports only — the live database exists only in memory. Load
          watermark: db_version {getWatermark()}.
        </p>
      </header>

      <div className="grid-2">
        <section className="card pad">
          <h2>Export my changes (end of day)</h2>
          <p className="muted small">
            Encrypted delta since you loaded today's truth (<code>.hrischanges</code>). This is the file you hand to
            the coordinator — it merges cleanly with everyone else's.
          </p>
          <button className="btn good" onClick={saveChanges}>⭱ Export changes (.hrischanges)</button>
        </section>

        <section className="card pad">
          <h2>Export full truth (coordinator)</h2>
          <p className="muted small">
            Encrypted complete database state (<code>.hrisdump</code>). Distribute as the next cycle's truth. Do not
            merge multiple full dumps — merge changes instead.
          </p>
          <button className="btn" onClick={saveTruth}>⭱ Export truth (.hrisdump)</button>
        </section>
      </div>

      <section className="card pad">
        <h2>Session</h2>
        <p className="muted small">
          Operator: <strong>{userName}</strong>. Locking wipes the key, passphrase, identity, and database from
          memory. Export your changes first — unsaved work is lost by design. Saving to cloud-sync folders may be
          restricted by org policy; the app cannot control the save location.
        </p>
        <button className="btn" onClick={onLock}>🔒 Lock &amp; clear memory</button>
      </section>

      <section className="card pad">
        <h2>Decrypt a file</h2>
        <p className="muted small">
          Inspect or recover any <code>.hrisdump</code>, <code>.hrischanges</code>, or <code>.csv.enc</code> this
          app produced. Plaintext stays in memory unless you download it.
        </p>
        <div className="form-grid">
          <Field label="Encrypted file">
            <label className="filepick">
              <input type="file" accept=".hrisdump,.hrischanges,.enc,.csv.enc" onChange={(e) => setDecFile(e.target.files?.[0] ?? null)} />
              <span className="filepick-btn">{decFile ? decFile.name : "Choose file"}</span>
            </label>
          </Field>
          <Field label="Passphrase">
            <input type="password" value={decPw} onChange={(e) => setDecPw(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <button className="btn primary" onClick={decrypt}>Decrypt</button>
        {preview !== null && (
          <div className="preview">
            <div className="preview-head">
              <span className="muted small">{preview.length.toLocaleString()} chars</span>
              <button
                className="btn small"
                onClick={() =>
                  download(preview, (decFile?.name.replace(/\.(enc|hrisdump|hrischanges)$/i, "") ?? "decrypted") + ".txt", "text/plain")
                }
              >
                ⭱ Download plaintext
              </button>
            </div>
            <pre>{preview.slice(0, 4000)}{preview.length > 4000 ? "\n… (truncated)" : ""}</pre>
          </div>
        )}
      </section>

      <section className="card pad">
        <h2>Recent changes (audit)</h2>
        <div className="table-scroll" style={{ maxHeight: "40vh" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Operator</th>
                <th>Entity</th>
                <th>ID</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={i}>
                  <td className="mono">{new Date(c.at).toLocaleString()}</td>
                  <td>{c.user_id}</td>
                  <td>{c.entity_table}</td>
                  <td className="mono">{c.entity_id}</td>
                  <td>{c.action}</td>
                  <td className="muted">{c.new_val ?? ""}</td>
                </tr>
              ))}
              {changes.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">No changes recorded this session.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
