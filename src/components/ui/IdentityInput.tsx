import { ChevronDown } from 'lucide-react';

/** Input tipo de documento (V/E/J/G/P) + número. */
export function IdentityInput({
  tipoDoc,
  identificacion,
  onTipoDocChange,
  onIdentificacionChange,
  placeholder = 'Ej. 18456329',
  tipos = ['V', 'E', 'J', 'G', 'P'],
}: {
  tipoDoc: string;
  identificacion: string;
  onTipoDocChange: (v: string) => void;
  onIdentificacionChange: (v: string) => void;
  placeholder?: string;
  tipos?: string[];
}) {
  return (
    <div className="group flex items-stretch w-full rounded-xl border border-slate-200 bg-white overflow-hidden transition-all duration-200 hover:border-slate-300 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
      <div className="relative shrink-0">
        <select
          aria-label="Tipo de documento"
          value={tipoDoc || 'V'}
          onChange={(e) => onTipoDocChange(e.target.value)}
          className="h-full appearance-none cursor-pointer bg-slate-50/70 pl-3.5 pr-8 py-2.5 text-sm font-bold text-slate-800 outline-none border-r border-slate-200 hover:bg-slate-100 transition-colors"
        >
          {tipos.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
        />
      </div>
      <input
        type="text"
        inputMode="numeric"
        maxLength={10}
        value={identificacion}
        onChange={(e) => onIdentificacionChange(e.target.value.replace(/\D/g, ''))}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-300"
      />
    </div>
  );
}
