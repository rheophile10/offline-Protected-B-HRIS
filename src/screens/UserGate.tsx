import { useState } from "react";
import { useApp, ThemeToggle, useLiveQuery } from "../ui";
import { listActiveUsers, setCurrentUser, type AppUser } from "../lib/identity";
import { logSession } from "../lib/audit";

/**
 * Operator identity gate (app-development-requirements §4). Not authentication —
 * offline attribution only. Shown after the truth is decrypted, before any CRUD.
 */
export function UserGate({ onSelected }: { onSelected: (name: string) => void }) {
  const { notify } = useApp();
  const users = useLiveQuery<AppUser[]>(listActiveUsers, []);
  const [busy, setBusy] = useState(false);

  const pick = async (u: AppUser) => {
    setBusy(true);
    try {
      setCurrentUser(u.id);
      await logSession("user_select", u.display_name);
      onSelected(u.display_name);
    } catch (e) {
      notify((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <ThemeToggle variant="fixed" />
      <div className="gate-card">
        <div className="gate-head">
          <span className="logo big">⬡</span>
          <h1>Who is working?</h1>
          <p className="muted">
            Select your operator identity. This stamps your name on every change for the end-of-day audit — it is
            not a login.
          </p>
        </div>
        <div className="gate-body">
          {users.length === 0 && <p className="muted small">No active operators in this dataset.</p>}
          {users.map((u) => (
            <button key={u.id} className="btn full user-pick" disabled={busy} onClick={() => pick(u)}>
              <span className="user-avatar">{initials(u.display_name)}</span>
              {u.display_name}
            </button>
          ))}
        </div>
      </div>
      <p className="gate-foot muted small">Operator identity is held in memory only and cleared on lock.</p>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
