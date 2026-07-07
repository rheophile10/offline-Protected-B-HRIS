// Encryption for all data leaving the app. See standards.md §3.
// AES-256-GCM + PBKDF2-SHA-256; keys are NON-EXTRACTABLE; passphrase lives only
// in this module while unlocked and is wiped on lock().

const MAGIC = "OHRIS1"; // 6 ASCII bytes
const VERSION = 1;
const HEADER = 36; // 6 magic + 1 version + 1 reserved + 16 salt + 12 iv
const ITER = 250_000;

// The passphrase is held here — module-private — only while unlocked.
// Never exposed on window, in React state, in the DOM, or in storage.
let passphrase: string | null = null;

export function isUnlocked(): boolean {
  return passphrase !== null;
}
export function setPassphrase(pw: string): void {
  passphrase = pw;
}
export function lock(): void {
  passphrase = null;
}

async function deriveKey(pw: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pw) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITER, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false, // NON-EXTRACTABLE — raw key can never be read back out
    ["encrypt", "decrypt"],
  );
}

/** Encrypt UTF-8 text with the current session passphrase. Returns file bytes. */
export async function encryptText(plaintext: string): Promise<Uint8Array> {
  if (passphrase === null) throw new Error("Session is locked — no passphrase set.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  const out = new Uint8Array(HEADER + ct.length);
  out.set(new TextEncoder().encode(MAGIC), 0);
  out[6] = VERSION;
  out[7] = 0;
  out.set(salt, 8);
  out.set(iv, 24);
  out.set(ct, HEADER);
  return out;
}

/** Decrypt file bytes with an explicit passphrase (used at unlock time). */
export async function decryptText(bytes: Uint8Array, pw: string): Promise<string> {
  if (bytes.length < HEADER) throw new Error("File too small to be a valid encrypted file.");
  const magic = new TextDecoder().decode(bytes.slice(0, 6));
  if (magic !== MAGIC) throw new Error("Not an Offline HRIS encrypted file (bad header).");
  if (bytes[6] !== VERSION) throw new Error(`Unsupported file version ${bytes[6]}.`);
  const salt = bytes.slice(8, 24);
  const iv = bytes.slice(24, 36);
  const ct = bytes.slice(36);
  const key = await deriveKey(pw, salt);
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
  } catch {
    throw new Error("Decryption failed — wrong passphrase or the file was modified.");
  }
  return new TextDecoder().decode(pt);
}
