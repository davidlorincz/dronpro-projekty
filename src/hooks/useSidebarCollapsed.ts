"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "admin-sidebar-collapsed";

/**
 * Hlavní menu: na desktopu zasunuté / vysunuté (pamatuje se), na mobilu
 * vysouvací panel přes obsah (nepamatuje se, zavře se při přechodu na jinou stránku).
 */
export function useSidebarCollapsed() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(pathname);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- načtení z localStorage až po hydrataci
    if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
  }, []);

  // Přechod na jinou stránku zavře mobilní menu.
  if (mobileOpen && openedOn !== pathname) {
    setMobileOpen(false);
    setOpenedOn(pathname);
  }

  const toggle = useCallback(() => {
    // Na úzké obrazovce je desktopové menu schované vždy → přepínáme vysouvací panel.
    if (!window.matchMedia("(min-width: 768px)").matches) {
      setOpenedOn(pathname);
      setMobileOpen((v) => !v);
      return;
    }
    setCollapsed((v) => {
      localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
      return !v;
    });
  }, [pathname]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return { collapsed, mobileOpen, toggle, closeMobile };
}
