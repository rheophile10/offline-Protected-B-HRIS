// File helpers. Downloads use Blob + object URLs (blob: scheme), which are NOT
// network egress and are unaffected by CSP connect-src 'none' (standards §4).

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsText(file);
  });
}

export function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsArrayBuffer(file);
  });
}

export function download(data: Uint8Array | string, filename: string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type CsvValue = string | number | bigint | null | Uint8Array;

/** RFC-4180-ish CSV. Values are quoted when they contain quote/comma/newline. */
export function toCsv(columns: string[], rows: CsvValue[][]): string {
  const cell = (v: CsvValue): string => {
    if (v === null || v === undefined) return "";
    let s: string;
    if (v instanceof Uint8Array) s = "0x" + Array.from(v).map((b) => b.toString(16).padStart(2, "0")).join("");
    else s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  return "﻿" + lines.join("\r\n"); // BOM for spreadsheet apps
}
