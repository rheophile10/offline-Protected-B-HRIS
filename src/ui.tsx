// Shared UI primitives + app context (notifications, data-refresh signal).
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { getTheme, setTheme, type Theme } from "./lib/theme";

export function ThemeToggle({ variant }: { variant?: "full" | "fixed" }) {
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };
  return (
    <button
      className={"theme-toggle" + (variant ? " " + variant : "")}
      onClick={toggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label="Toggle light or dark theme"
    >
      {theme === "dark" ? "☀ Light" : "☾ Dark"}
    </button>
  );
}

export interface AppCtx {
  version: number;
  refresh: () => void;
  notify: (msg: string, kind?: "ok" | "err" | "info") => void;
}
const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

interface Toast {
  id: number;
  msg: string;
  kind: "ok" | "err" | "info";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const notify = useCallback((msg: string, kind: "ok" | "err" | "info" = "info") => {
    const id = performance.now();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={{ version, refresh, notify }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/**
 * Run an async query, re-running whenever the global data version bumps or deps
 * change. Returns `fallback` until the first result arrives.
 */
export function useLiveQuery<T>(fn: () => Promise<T>, fallback: T, deps: unknown[] = []): T {
  const { version } = useApp();
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    let alive = true;
    fn().then(
      (d) => alive && setData(d),
      () => alive && setData(fallback),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return data;
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={"modal" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "$" + n.toLocaleString("en-CA");
}

export function useConfirm() {
  return (msg: string): boolean => window.confirm(msg);
}
