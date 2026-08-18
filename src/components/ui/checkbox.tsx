'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label?: string;
  description?: string;
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, label, description, id, ...props }, ref) => {
  const checkboxId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex items-start gap-3">
      <CheckboxPrimitive.Root
        ref={ref}
        id={checkboxId}
        className={cn(
          'peer h-5 w-5 shrink-0 rounded-md border-2 transition-all duration-200',
          'border-a-border bg-a-surface',
          'focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-a-ring-offset',
          'hover:border-cyan-400',
          'data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {(label || description) && (
        <div className="grid gap-1 leading-none">
          {label && (
            <label
              htmlFor={checkboxId}
              className="text-sm font-medium text-a-text-2 cursor-pointer hover:text-cyan-600 transition-colors"
            >
              {label}
            </label>
          )}
          {description && (
            <p className="text-xs text-a-text-3">{description}</p>
          )}
        </div>
      )}
    </div>
  );
});
Checkbox.displayName = 'Checkbox';

export { Checkbox };
