import { useState } from "react";

/**
 * Client-side pagination for a list. pageSize 0 = show all. Changing the page
 * size jumps back to page 1; when the list shrinks below the current page the
 * returned `page` is clamped to the last valid page.
 */
export function usePagination<T>(items: T[], defaultSize = 25) {
  const [pageSize, setPageSizeRaw] = useState(defaultSize);
  const [page, setPage] = useState(1);

  const setPageSize = (s: number) => {
    setPageSizeRaw(s);
    setPage(1);
  };

  const total = items.length;
  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems =
    pageSize === 0 ? items : items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return { pageItems, page: safePage, setPage, pageSize, setPageSize, total, pageCount };
}
