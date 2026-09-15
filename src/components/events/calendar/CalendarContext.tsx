"use client";

import { createContext, useContext } from "react";
import type { CalEvent, Conflict } from "./calendarLib";

export type CalCtx = {
  today: string;
  canEdit: boolean;
  conflicts: Map<string, Conflict[]>;
  userName: (id: string) => string;
  /** Id právě tažené akce (kvůli zvýraznění). */
  draggingId?: string;
  /** Začátek tažení pruhu — volá se z `onPointerDown`. */
  startMove: (e: CalEvent, ev: React.PointerEvent) => void;
  /** Začátek výběru dnů pro novou akci. */
  startSelect: (ev: React.PointerEvent) => void;
  /** Po dokončeném tažení se klik nesmí propsat do otevření popoveru / dialogu. */
  consumeClick: () => boolean;
  /** Den (nebo rozsah) je vybraný tažením pro založení akce. */
  isSelected: (iso: string) => boolean;
  openDetail: (e: CalEvent) => void;
  createAt: (from: string, to?: string) => void;
};

export const CalendarContext = createContext<CalCtx | null>(null);

export function useCal() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error("useCal mimo CalendarContext");
  return ctx;
}
