// Nahrávání souborů do Convex file storage — sdílí přílohy eventů i chatu.
import type { Id } from "../../convex/_generated/dataModel";

/** Delší hrana fotky po zmenšení — plně dostačuje na náhled i tisk do dokumentace. */
const IMAGE_MAX_EDGE = 2000;

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Fotky z mobilu mají klidně 5 MB; do 1GB kvóty Convexu se jich moc nevejde.
 * Zmenšení na klientu je typicky 5–10× úspora. Když se cokoli nepovede
 * (starý prohlížeč, HEIC, které canvas neumí), vracíme originál.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

/** POST na krátkodobou upload URL — `fetch` neumí průběh, proto XHR. */
export function postFile(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<{ storageId: Id<"_storage"> }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    // Content-Type určuje `contentType` uložený ve `_storage` — bez něj by
    // server nepoznal obrázek a náhled by se nevykreslil.
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error("Úložiště vrátilo neplatnou odpověď.")); }
      } else reject(new Error(`Nahrání selhalo (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Nahrání selhalo — zkontroluj připojení."));
    xhr.send(file);
  });
}
