"use client";

import { useEffect, useState } from "react";

/** Dotykové ovládání — na hover se nedá spoléhat, akce musí být vidět rovnou. */
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return coarse;
}

/** Dlouhý stisk (~450 ms); pohyb prstem ho zruší. */
export function longPressHandlers(onLongPress: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return {
    onTouchStart: () => { cancel(); timer = setTimeout(onLongPress, 450); },
    onTouchMove: cancel,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}
