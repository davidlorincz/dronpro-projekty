export type ToastType = "error" | "success";
export interface Toast { id: string; message: string; type: ToastType; hint?: string }

type Listener = (toast: Toast) => void;
let listeners: Listener[] = [];

/** hint = volitelný druhý řádek s návodem, jak chybu vyřešit. */
export function toast(message: string, type: ToastType = "error", hint?: string) {
  const id = Math.random().toString(36).slice(2);
  listeners.forEach(l => l({ id, message, type, hint }));
}

export function _addToastListener(cb: Listener) {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}
