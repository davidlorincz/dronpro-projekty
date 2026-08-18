import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shared admin table row styling for consistency across all list tables.
// Zebra striping (visible in light + dark) for readability on long rows.
export const zebraRow = "even:bg-a-elevated";
// Same zebra + whole-row clickable (opens detail). Action buttons inside the
// row must call e.stopPropagation().
export const clickableRow =
  "cursor-pointer even:bg-a-elevated hover:!bg-a-accent-bg/40";

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatPriceShort(price: number): string {
  return `${price.toLocaleString('cs-CZ')} Kč`;
}

export function generateReservationNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `R-${year}${month}-${random}`;
}
