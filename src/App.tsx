import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./ui";
import { boot, exportChanges, lockSession } from "./lib/session";
import { SessionGate } from "./screens/SessionGate";
import { UserGate } from "./screens/UserGate";
import { Dashboard } from "./screens/Dashboard";
import { Officers } from "./screens/Officers";
import { Positions } from "./screens/Positions";
import { Assignments } from "./screens/Assignments";
import { Recruitment } from "./screens/Recruitment";
import { Compliance } from "./screens/Compliance";
import { SqlConsole } from "./screens/SqlConsole";
import { Security } from "./screens/Security";

type Screen =
  | "dashboard" | "officers" | "positions" | "assignments"
  | "recruitment" | "compliance" | "sql" | "security";

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "◧" },
  { id: "officers", label: "Officers", icon: "◑" },
  { id: "positions", label: "Positions", icon: "▤" },
  { id: "assignments", label: "Assignments", icon: "⇄" },
  { id: "recruitment", label: "Recruitment", icon: "⌸" },
  { id: "compliance", label: "Compliance", icon: "✓" },
  { id: "sql", label: "SQL Console", icon: "›_" },
  { id: "security", label: "Data & Security", icon: "🔒" },
];

function Shell() {
  const { notify, refresh } = useApp();
  const [booting, setBooting] = useState(true);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");

  useEffect(() => {
    boot()
      .then(() => setBooting(false))
      .catch((e) => notify("Engine failed: " + e.message, "err"));
  }, [notify]);

  if (booting) return <div className="center-splash">Loading cr-sqlite engine…</div>;
  if (!sessionLoaded)
    return <SessionGate onLoaded={() => { setSessionLoaded(true); refresh(); }} />;
  if (!userName)
    return <UserGate onSelected={(name) => { setUserName(name); setScreen("dashboard"); refresh(); }} />;

  const lock = async () => {
    await lockSession();
    setSessionLoaded(false);
    setUserName(null);
    notify("Session locked. Memory cleared.", "info");
  };
  const saveChanges = async () => {
    try {
      const { empty } = await exportChanges(userName);
      notify(empty ? "No changes since load." : "Encrypted changeset exported.", empty ? "info" : "ok");
    } catch (e) {
      notify("Export failed: " + (e as Error).message, "err");
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">⬡</span>
          <div>
            <div className="brand-name">Offline HRIS</div>
            <div className="brand-sub">Juárez PD · demo</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={"navitem" + (screen === n.id ? " active" : "")}
              onClick={() => setScreen(n.id)}
            >
              <span className="navicon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">Operator: <strong>{userName}</strong></div>
          <button className="btn good full" onClick={saveChanges}>⭱ Export my changes</button>
          <button className="btn full" onClick={lock}>🔒 Lock session</button>
          <div className="lockmsg">Unsaved changes are lost on lock — export first.</div>
        </div>
      </aside>
      <main className="content">
        {screen === "dashboard" && <Dashboard />}
        {screen === "officers" && <Officers />}
        {screen === "positions" && <Positions />}
        {screen === "assignments" && <Assignments />}
        {screen === "recruitment" && <Recruitment />}
        {screen === "compliance" && <Compliance />}
        {screen === "sql" && <SqlConsole />}
        {screen === "security" && <Security onLock={lock} userName={userName} />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
