import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Aviso en línea (advertencia o error) con el mismo lenguaje visual de los toasts. */
export function Aviso({ children, tono = 'warn' }: { children: ReactNode; tono?: 'warn' | 'error' }) {
  const clases = tono === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700';
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 text-[0.78rem] font-semibold ${clases}`}>
      <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
