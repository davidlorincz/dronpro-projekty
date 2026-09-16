"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from "lucide-react";
import { formatBytes } from "@/lib/upload";

export type LightboxImage = { url: string; name: string; downloadUrl: string; size?: number };

type LightboxCtx = { open: (images: LightboxImage[], index: number) => void };

const Ctx = createContext<LightboxCtx | null>(null);

/** Otevření náhledu obrázku. Používá se uvnitř `ChatProvider`. */
export function useLightbox() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLightbox mimo LightboxProvider");
  return ctx;
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [images, setImages] = useState<LightboxImage[]>([]);
  const [index, setIndex] = useState(0);

  const open = useCallback((next: LightboxImage[], i: number) => {
    if (!next.length) return;
    setImages(next);
    setIndex(Math.max(0, Math.min(i, next.length - 1)));
  }, []);
  const close = useCallback(() => setImages([]), []);
  const step = useCallback((delta: number) => setIndex((i) => (i + delta + images.length) % images.length), [images.length]);

  // Esc zavře, šipky přepínají mezi obrázky. `capture`, aby Esc nezavřel
  // zároveň panel vlákna pod lightboxem.
  useEffect(() => {
    if (!images.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [images.length, close, step]);

  const current = images[index];

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {current && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/85" onClick={close}>
          <div className="flex shrink-0 items-center gap-2 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{current.name}</div>
              <div className="text-xs text-white/60">
                {current.size ? formatBytes(current.size) : ""}
                {images.length > 1 && `${current.size ? " · " : ""}${index + 1} z ${images.length}`}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <a href={current.downloadUrl} title="Stáhnout" aria-label="Stáhnout" className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white">
                <Download className="h-5 w-5" />
              </a>
              <a href={current.url} target="_blank" rel="noopener noreferrer" title="Otevřít v novém panelu" aria-label="Otevřít v novém panelu" className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white">
                <ExternalLink className="h-5 w-5" />
              </a>
              <button type="button" onClick={close} title="Zavřít (Esc)" aria-label="Zavřít (Esc)" className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
            {images.length > 1 && (
              <button
                type="button" title="Předchozí (←)" aria-label="Předchozí (←)"
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                className="absolute left-2 rounded-full bg-black/40 p-2 text-white/80 hover:bg-black/60 hover:text-white cursor-pointer"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.url} alt={current.name}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
            {images.length > 1 && (
              <button
                type="button" title="Další (→)" aria-label="Další (→)"
                onClick={(e) => { e.stopPropagation(); step(1); }}
                className="absolute right-2 rounded-full bg-black/40 p-2 text-white/80 hover:bg-black/60 hover:text-white cursor-pointer"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
