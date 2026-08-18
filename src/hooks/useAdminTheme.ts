"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "admin-theme";

export function useAdminTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- načtení z localStorage až po hydrataci
    if (saved === "dark") setIsDark(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
    if (isDark) {
      document.body.classList.add("admin-dark");
    } else {
      document.body.classList.remove("admin-dark");
    }
    return () => document.body.classList.remove("admin-dark");
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((v) => !v), []);

  return { isDark, toggle };
}
