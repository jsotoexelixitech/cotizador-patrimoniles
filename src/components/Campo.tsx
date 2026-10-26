import type { ReactNode } from 'react';
import { SUCURSALES } from '../tarifas/comun';

export function Campo({ etiqueta, error, ayuda, children, ancho }: {
  etiqueta: string; error?: string; ayuda?: string; children: ReactNode; ancho?: boolean;
}) {
  return (
    <label className={'campo' + (ancho ? ' ancho' : '') + (error ? ' con-error' : '')}>
      <span>{etiqueta}</span>
      {children}
      {error ? <small className="error">{error}</small> : ayuda ? <small className="ayuda">{ayuda}</small> : null}
    </label>
  );
}

export function SelectSucursal({ valor, onCambio, error }: { valor: string; onCambio: (v: string) => void; error?: string }) {
  return (
    <Campo etiqueta="Sucursal" error={valor ? error : undefined}>
      <select value={valor} onChange={(ev) => onCambio(ev.target.value)}>
        <option value="">Seleccione la sucursal…</option>
        {SUCURSALES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </Campo>
  );
}

export function Seccion({ numero, titulo, children }: { numero: string; titulo: string; children: ReactNode }) {
  return (
    <section className="seccion">
      <h2><span>{numero}</span>{titulo}</h2>
      {children}
    </section>
  );
}

/** Aviso fijo del alcance actual: solo cotiza; la emisión se habilita al conectar Sis2000. */
export function AvisoEmision({ producto }: { producto: string }) {
  return (
    <div className="aviso-emision no-imprimir">
      <strong>Emisión de {producto}: pendiente de habilitar.</strong>
      <span> Este cotizador calcula con las fórmulas oficiales. La emisión se conectará con Sis2000 cuando estén habilitados los planes del producto.</span>
    </div>
  );
}
