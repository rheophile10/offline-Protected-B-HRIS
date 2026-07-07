// Operator identity for attribution (app-development-requirements §4).
// Held module-private — never on window, in React state, in the DOM, or storage.
// This is NOT authentication (offline, no server); it stamps who changed a row.
import { all } from "./db";

export interface AppUser {
  id: string;
  display_name: string;
  pin_hash: string | null;
  active: number;
}

let currentUserId: string | null = null;

export function setCurrentUser(id: string): void {
  currentUserId = id;
}
export function currentUser(): string | null {
  return currentUserId;
}
export function clearUser(): void {
  currentUserId = null;
}
export function requireUser(): string {
  if (!currentUserId) throw new Error("No operator identity selected.");
  return currentUserId;
}

/** Active operators available at the user gate. */
export function listActiveUsers(): Promise<AppUser[]> {
  return all<AppUser>("SELECT id, display_name, pin_hash, active FROM app_user WHERE active = 1 ORDER BY display_name");
}

export async function displayName(id: string): Promise<string> {
  const rows = await all<{ display_name: string }>(
    "SELECT display_name FROM app_user WHERE id = ?",
    [id],
  );
  return rows[0]?.display_name ?? id;
}
