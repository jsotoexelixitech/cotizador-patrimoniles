import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Badge({
  children,
  tone = 'indigo',
  className,
}: {
  children: ReactNode;
  tone?: 'indigo' | 'success' | 'warn';
  className?: string;
}) {
  const tones = {
    indigo: 'text-indigo-700 bg-indigo-50 ring-indigo-200',
    success: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
    warn: 'text-amber-700 bg-amber-50 ring-amber-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ring-1',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
