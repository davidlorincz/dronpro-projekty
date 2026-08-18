'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'available' | 'rented' | 'buffer' | 'maintenance';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          variant === 'default' && 'bg-badge-rented-bg text-badge-rented-text',
          variant === 'secondary' && 'bg-a-elevated text-a-text-2',
          variant === 'success' && 'bg-badge-available-bg text-badge-available-text',
          variant === 'warning' && 'bg-badge-buffer-bg text-badge-buffer-text',
          variant === 'destructive' && 'bg-badge-maintenance-bg text-badge-maintenance-text',
          variant === 'available' && 'bg-badge-available-bg text-badge-available-text',
          variant === 'rented' && 'bg-badge-rented-bg text-badge-rented-text',
          variant === 'buffer' && 'bg-badge-buffer-bg text-badge-buffer-text',
          variant === 'maintenance' && 'bg-badge-maintenance-bg text-badge-maintenance-text',
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };
