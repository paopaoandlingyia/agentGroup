import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { dbExportBundle, dbImportBundle, type ExportBundleV1 } from "@/lib/local-db";

export function makeExportFilename(ext: "zip" | "json"): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `agent-group-export-${ts}.${ext}`;
}

export async function exportAsZip(activeSessionId: string | null): Promise<Blob> {
  const bundle = await dbExportBundle(activeSessionId);
  const json = JSON.stringify(bundle, null, 2);
  const zipped = zipSync(
    { "export.json": strToU8(json) },
    { level: 9 },
  );
  const ab = (zipped.buffer as ArrayBuffer).slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
  return new Blob([ab], { type: "application/zip" });
}

export async function exportAsJson(activeSessionId: string | null): Promise<Blob> {
  const bundle = await dbExportBundle(activeSessionId);
  const json = JSON.stringify(bundle, null, 2);
  return new Blob([json], { type: "application/json" });
}

function pickExportJson(files: Record<string, Uint8Array>): Uint8Array | null {
  if (files["export.json"]) return files["export.json"];
  const jsonKeys = Object.keys(files).filter((k) => k.toLowerCase().endsWith(".json"));
  if (jsonKeys.length === 1) return files[jsonKeys[0]];
  return null;
}

export async function importFromZip(file: File): Promise<ExportBundleV1> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf);
  const jsonFile = pickExportJson(files);
  if (!jsonFile) throw new Error("未找到 export.json");

  const jsonText = strFromU8(jsonFile);
  const parsed = JSON.parse(jsonText) as ExportBundleV1;
  await dbImportBundle(parsed);
  return parsed;
}

export async function importFromJson(file: File): Promise<ExportBundleV1> {
  const text = await file.text();
  const parsed = JSON.parse(text) as ExportBundleV1;
  await dbImportBundle(parsed);
  return parsed;
}

export async function importFromFile(file: File): Promise<ExportBundleV1> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) return importFromJson(file);
  return importFromZip(file);
}
