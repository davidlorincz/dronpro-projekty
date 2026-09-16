"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMe } from "@/components/layout/AuthGuard";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { postFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { useChat } from "./ChatContext";

const EMOJI_EDGE = 128;

/** Zmenšení na 128 px (GIF necháváme kvůli animaci). */
async function prepareEmoji(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, EMOJI_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.9));
  return blob ? new File([blob], "emoji.webp", { type: "image/webp" }) : file;
}

export function CustomEmojiDialog({ onClose }: { onClose: () => void }) {
  const { me, isAdmin } = useMe();
  const { customEmoji } = useChat();
  const generateUploadUrl = useMutation(api.chatMessages.generateUploadUrl);
  const add = useMutation(api.chatEmoji.add);
  const remove = useMutation(api.chatEmoji.remove);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const canAdd = me.role === "admin" || me.role === "member";
  const slug = name.trim().toLowerCase().replace(/^:|:$/g, "");
  const validName = /^[a-z0-9_-]{2,32}$/.test(slug);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!name) setName(f.name.replace(/\.[^.]+$/, "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_-]+/g, "-").slice(0, 32));
  };

  const submit = async () => {
    if (!file || !validName || saving) return;
    setSaving(true);
    try {
      const prepared = await prepareEmoji(file);
      const url = await generateUploadUrl();
      const { storageId } = await postFile(url, prepared, () => {});
      await add({ name: slug, storageId });
      toast(`Emoji :${slug}: přidáno`, "success");
      setFile(null); setPreview(null); setName("");
    } catch (e) { errorToast(e, "Emoji se nepodařilo přidat"); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vlastní emoji</DialogTitle>
          <DialogDescription>Emoji týmu použiješ ve zprávě i jako reakci — napiš <code>:nazev:</code> nebo ho vyber v nabídce.</DialogDescription>
        </DialogHeader>

        {canAdd && (
          <div className="flex items-start gap-3 rounded-xl border border-a-border p-3">
            <button
              type="button" onClick={() => fileRef.current?.click()}
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-a-border bg-a-elevated text-a-text-4 hover:border-cyan-500 cursor-pointer"
              title="Vybrat obrázek" aria-label="Vybrat obrázek"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview ? <img src={preview} alt="" className="h-12 w-12 object-contain" /> : <ImagePlus className="h-6 w-6" />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp,image/jpeg" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center rounded-lg border border-a-border bg-a-input px-2 focus-within:border-cyan-500">
                <span className="text-a-text-4">:</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nazev-emoji" className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-a-text outline-none!" />
                <span className="text-a-text-4">:</span>
              </div>
              <div className={cn("text-xs", name && !validName ? "text-red-500" : "text-a-text-4")}>
                2–32 znaků: malá písmena bez diakritiky, číslice, - a _. Obrázek PNG, GIF, WebP nebo JPEG.
              </div>
              <Button size="sm" onClick={() => void submit()} disabled={!file || !validName || saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Přidat emoji
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3 max-h-64 overflow-y-auto">
          {customEmoji.length === 0 ? (
            <div className="py-6 text-center text-sm text-a-text-4">Zatím žádná vlastní emoji.</div>
          ) : (
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {customEmoji.map((e) => (
                <div key={e._id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-a-hover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {e.url && <img src={e.url} alt={e.name} className="h-6 w-6 object-contain" />}
                  <span className="min-w-0 flex-1 truncate text-xs text-a-text-2">:{e.name}:</span>
                  {(e.createdBy === me._id || isAdmin) && (
                    <button type="button" title="Smazat emoji" aria-label="Smazat emoji"
                      onClick={async () => { try { await remove({ emojiId: e._id }); } catch (err) { errorToast(err); } }}
                      className="hidden rounded p-0.5 text-a-text-4 hover:text-red-600 group-hover:block cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Zavřít</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
