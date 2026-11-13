/**
 * Slider de suma asegurada entre el mínimo y el tope permitidos (vista cliente y técnica). Va junto al campo numérico:
 * los dos editan el mismo valor.
 */
export function SliderSuma({ valor, min, max, onChange, formato }: {
  valor: string; min: number; max: number; onChange: (v: string) => void; formato: (n: number) => string;
}) {
  if (!(max > min)) return null;
  // ~200 pasos redondeados a una cifra "bonita" (1, 2 o 5 × 10^n) para que el slider caiga en montos redondos.
  const bruto = (max - min) / 200;
  const pot = 10 ** Math.floor(Math.log10(bruto || 1));
  const step = [1, 2, 5, 10].map((f) => f * pot).find((s) => s >= bruto) ?? pot * 10;
  const n = Number(valor);
  const actual = Number.isFinite(n) && valor.trim() !== '' ? Math.min(Math.max(n, min), max) : min;
  return (
    <div className="mt-2">
      <input type="range" min={min} max={max} step={step} value={actual} aria-label="Suma asegurada"
        onChange={(e) => {
          const v = Number(e.target.value);
          // El último paso puede no caer exacto en el tope: al final del recorrido se deja el tope.
          onChange(String(v + step > max ? max : v));
        }}
        className="w-full accent-indigo-600 cursor-pointer" />
      <div className="flex justify-between text-[0.65rem] text-slate-400 font-medium">
        <span>Mín. {formato(min)}</span>
        <span>Tope {formato(max)}</span>
      </div>
    </div>
  );
}
