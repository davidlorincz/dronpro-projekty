"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: Props) {
  if (total === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
      <label className="flex items-center gap-2 text-sm text-a-text-3">
        <span>Zobrazit</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="text-sm border border-a-border rounded-lg px-2 py-1 bg-a-input text-a-text-2 cursor-pointer focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={0}>Vše</option>
        </select>
        <span>na stránku</span>
      </label>

      <div className="flex items-center gap-3 text-sm text-a-text-3">
        <span className="tabular-nums">
          {pageSize === 0
            ? `${total}`
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`}{" "}
          z {total}
        </span>
        {pageSize !== 0 && pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-md text-a-text-4 hover:text-a-text-2 hover:bg-a-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Předchozí"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="tabular-nums px-1">{page} / {pageCount}</span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount}
              className="p-1.5 rounded-md text-a-text-4 hover:text-a-text-2 hover:bg-a-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Další"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
