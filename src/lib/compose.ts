import type { KeyboardEvent } from "react";

/** Styl textového pole pro psaní zpráv (komentáře, chat). */
export const areaCls = "w-full resize-none rounded-lg border border-a-border bg-a-input px-2.5 py-1.5 text-sm text-a-text outline-none focus:border-cyan-500 placeholder:text-a-text-4";

/** Enter odešle, Shift+Enter nový řádek (a nic neodesílá během skládání znaků IME). */
export function submitOnEnter(e: KeyboardEvent<HTMLTextAreaElement>, submit: () => void) {
  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
}
