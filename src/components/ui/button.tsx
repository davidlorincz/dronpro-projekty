'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center font-semibold transition-all duration-200 rounded-xl cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-a-ring-offset',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
          // Variants
          variant === 'primary' && [
            'bg-[#0eb24f] text-white',
            'hover:bg-[#0c9a43]',
            'focus:ring-[#0eb24f]',
            'shadow-sm hover:shadow-md',
          ],
          variant === 'secondary' && [
            'bg-a-elevated text-a-text-2',
            'hover:bg-a-hover',
            'focus:ring-gray-400',
          ],
          variant === 'outline' && [
            'bg-transparent border-2 border-cyan-500 text-cyan-600',
            'hover:bg-a-accent-bg',
            'focus:ring-cyan-500',
          ],
          variant === 'ghost' && [
            'bg-transparent text-a-text-2',
            'hover:bg-a-elevated hover:text-a-text',
            'focus:ring-gray-400',
          ],
          // Sizes
          size === 'sm' && 'px-4 py-2 text-sm',
          size === 'md' && 'px-5 py-2.5 text-base',
          size === 'lg' && 'px-8 py-3.5 text-lg',
          className
        )}
        ref={ref}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button };
