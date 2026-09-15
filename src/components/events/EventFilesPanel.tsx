"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Download, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { downscaleImage, formatBytes, postFile } from "@/lib/upload";

const MAX_MB = 20;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ACCEPT = "application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt";

export function EventFilesPanel({ eventId, editable }: { eventId: Id<"events">; editable: boolean }) {
  const files = useQuery(api.eventFiles.list, { eventId });
  const generateUploadUrl = useMutation(api.eventFiles.generateUploadUrl);
  const attach = useMutation(api.eventFiles.attach);
  const remove = useMutation(api.eventFiles.remove);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<{ name: string; pct: number }[]>([]);
  const [toDelete, setToDelete] = useState<{ _id: Id<"eventFiles">; name: string } | null>(null);

  const upload = useCallback(async (picked: File[]) => {
    if (!picked.length) return;
    setQueue(picked.map((f) => ({ name: f.name, pct: 0 })));
    let ok = 0;
    for (const original of picked) {
      const bump = (pct: number) =>
        setQueue((q) => q.map((x) => (x.name === original.name ? { ...x, pct } : x)));
      try {
        const file = await downscaleImage(original);
        // Klientská kontrola je jen kvůli rychlé zpětné vazbě — autoritativní
        // limit vynucuje `attach` z metadat `_storage`.
        if (file.size === 0) throw new Error(`${original.name}: soubor je prázdný.`);
        if (file.size > MAX_BYTES) throw new Error(`${original.name}: soubor je větší než ${MAX_MB} MB.`);
        const url = await generateUploadUrl({ eventId });
        const { storageId } = await postFile(url, file, bump);
        await attach({ eventId, storageId, name: file.name });
        bump(100);
        ok++;
      } catch (err) {
        errorToast(err, "Soubor se nepodařilo nahrát");
      }
    }
    setQueue([]);
    // Bez resetu by šel tentýž soubor vybrat znovu jen po refreshi.
    if (inputRef.current) inputRef.current.value = "";
    if (ok) toast(ok === 1 ? "Soubor nahrán" : `Nahráno souborů: ${ok}`, "success");
  }, [attach, eventId, generateUploadUrl]);

  return (
    <div className="space-y-3">
      <div className="font-semibold flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-a-text-3" /> Dokumenty a fotky
        {files && files.length > 0 && <span className="text-xs text-a-text-4">({files.length})</span>}
      </div>

      {editable && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(Array.from(e.dataTransfer.files)); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "rounded-xl border border-dashed px-4 py-6 text-center text-sm cursor-pointer transition-colors",
            dragging ? "border-cyan-500 bg-a-accent-bg" : "border-a-border hover:bg-a-hover"
          )}
        >
          <Upload className="h-5 w-5 mx-auto mb-2 text-a-text-4" />
          <div className="text-a-text-2">Přetáhni sem soubory nebo klikni pro výběr</div>
          <div className="text-xs text-a-text-4 mt-1">PDF, obrázky, Office · max {MAX_MB} MB na soubor</div>
          <input
            ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
            onChange={(e) => void upload(Array.from(e.target.files ?? []))}
          />
        </div>
      )}

      {queue.map((q) => (
        <div key={q.name} className="flex items-center gap-2 text-xs text-a-text-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span className="truncate">{q.name}</span>
          <div className="ml-auto h-1.5 w-24 rounded-full bg-a-elevated overflow-hidden shrink-0">
            <div className="h-full bg-cyan-500 transition-all" style={{ width: `${q.pct}%` }} />
          </div>
          <span className="w-9 text-right tabular-nums">{q.pct}%</span>
        </div>
      ))}

      {files === undefined ? (
        <div className="text-sm text-a-text-3">Načítám…</div>
      ) : files.length === 0 ? (
        <div className="text-xs text-a-text-4">Zatím žádné soubory.</div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((f) => (
            <li key={f._id} className="flex items-center gap-3 rounded-xl border border-a-border bg-a-elevated p-2">
              {f.isImage && f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* Storage je cizí origin a next/image by sem jen přidal optimalizační průchod navíc. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.name} loading="lazy"
                       className="h-12 w-12 rounded-lg object-cover border border-a-border" />
                </a>
              ) : (
                <div className="h-12 w-12 rounded-lg border border-a-border grid place-items-center shrink-0">
                  <FileText className="h-5 w-5 text-a-text-4" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <a href={f.url ?? "#"} target="_blank" rel="noreferrer"
                   className="block truncate text-sm text-a-text hover:text-a-accent-text">{f.name}</a>
                <div className="text-[11px] text-a-text-4 truncate">
                  {formatBytes(f.size)} · {f.uploadedBy?.name ?? f.uploadedBy?.email ?? "—"} · {formatDateTime(f.createdAt)}
                </div>
              </div>

              <a href={f.downloadUrl} className="p-1.5 text-a-text-4 hover:text-a-text cursor-pointer" title="Stáhnout">
                <Download className="h-4 w-4" />
              </a>
              {editable && (
                <button type="button" onClick={() => setToDelete({ _id: f._id, name: f.name })}
                        className="p-1.5 text-a-text-4 hover:text-st-blocked-text cursor-pointer" title="Smazat">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Smazat soubor?"
        description={toDelete ? `„${toDelete.name}“ bude nenávratně smazán z úložiště.` : undefined}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try { await remove({ id: toDelete._id }); toast("Soubor smazán", "success"); }
          catch (err) { errorToast(err); }
        }}
      />
    </div>
  );
}
