export type ToastType = "error" | "success";
export interface ToastAction { label: string; onClick: () => void }
export interface Toast { id: string; message: string; type: ToastType; hint?: string; action?: ToastAction }

type Listener = (toast: Toast) => void;
let listeners: Listener[] = [];

/** hint = volitelný druhý řádek s návodem, jak chybu vyřešit; action = tlačítko typu „Vrátit“. */
export function toast(message: string, type: ToastType = "error", hint?: string, action?: ToastAction) {
  const id = Math.random().toString(36).slice(2);
  listeners.forEach(l => l({ id, message, type, hint, action }));
}

export function _addToastListener(cb: Listener) {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}
