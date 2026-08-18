'use client';

import { useEffect, useState } from "react";
import { _addToastListener, Toast } from "@/lib/toast";
import { X, AlertCircle, CheckCircle2 } from "lucide-react";

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => _addToastListener(t => {
    setToasts(p => [...p, t]);
    setTimeout(() => setToasts(p => p.filter(x => x.id !== t.id)), 4000);
  }), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 bg-a-surface rounded-xl shadow-lg border-l-4 px-4 py-3 pointer-events-auto ${
            t.type === "error" ? "border-l-red-500" : "border-l-green-500"
          }`}
        >
          {t.type === "error" ? (
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <span className="text-sm text-a-text-2 block">{t.message}</span>
            {t.hint && (
              <span className="text-xs text-a-text-4 block mt-1">{t.hint}</span>
            )}
          </div>
          <button
            onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}
            className="text-a-text-4 hover:text-a-text-2 shrink-0 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
