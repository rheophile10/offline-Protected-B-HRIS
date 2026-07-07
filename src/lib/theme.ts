// Theme preference. Defaults to dark. Persisted in localStorage — a non-sensitive
// UI preference, which standards.md §2 explicitly permits (no org data here).
export type Theme = "dark" | "light";
const KEY = "ohris.theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
}
export function setTheme(t: Theme): void {
  applyTheme(t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
}
/** Set the root attribute from the stored preference (call before first paint). */
export function initTheme(): void {
  applyTheme(getTheme());
}
