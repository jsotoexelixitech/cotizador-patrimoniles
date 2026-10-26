import { useMemo, useState } from 'react';
import { importe, numeroONulo } from '../tarifas/comun';
import {
  CLASE_INDUSTRIAS, cotizarRcg, INDOLE_OTRA, MONEDAS_RCG, RCG_CLASES, RCG_CONDICIONES, RCG_INDUSTRIAS,
  RCG_RESTRINGIDAS, tasaPromedio, type MonedaRcg, type SolicitudRcg,
} from '../tarifas/rcg';
import { AvisoEmision, Campo, Seccion, SelectSucursal } from './Campo';

type Form = Omit<SolicitudRcg, 'limite' | 'tasa'> & { limite: string; tasa: string };

const INICIAL: Form = {
  sucursal: '', usuario: '', correoUsuario: '', asegurado: '', rif: '', correoDestinatario: '', intermediario: '',
  ubicacion: '', moneda: 'USD', clase: 0, indole: '', actividadEspecifica: '', esContrato: false, numeroContrato: '',
  objetoObra: '', coasegurado: '', limite: '', tasa: String(tasaPromedio(RCG_CLASES[0])), condiciones: [],
};

export default function CotizadorRcg() {
  const [f, setF] = useState<Form>(INICIAL);
  const [tocado, setTocado] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const cot = useMemo(() => cotizarRcg({ ...f, limite: numeroONulo(f.limite), tasa: numeroONulo(f.tasa) }), [f]);
  const err = (k: keyof SolicitudRcg) => (tocado ? cot.errores[k] : undefined);
  const clase = RCG_CLASES[f.clase];
  const listo = Object.keys(cot.errores).length === 0 && !cot.restringida && cot.alternativas.length > 0;
  const m = (n: number) => `${f.moneda} ${importe(n)}`;

  const cambiarClase = (i: number) => setF((x) => ({ ...x, clase: i, tasa: String(tasaPromedio(RCG_CLASES[i])) }));
  const alternarCondicion = (i: number) =>
    set('condiciones', f.condiciones.includes(i) ? f.condiciones.filter((x) => x !== i) : [...f.condiciones, i]);

  return (
    <div className="cotizador">
      <form className="formulario no-imprimir" onSubmit={(e) => e.preventDefault()}>
        <Seccion numero="01" titulo="Datos de quien cotiza">
          <div className="rejilla">
            <SelectSucursal valor={f.sucursal} onCambio={(v) => set('sucursal', v)} error={err('sucursal')} />
            <Campo etiqueta="Elaborada por" error={err('usuario')}>
              <input value={f.usuario} maxLength={120} onChange={(e) => set('usuario', e.target.value)} />
            </Campo>
            <Campo etiqueta="Correo de quien cotiza" error={err('correoUsuario')}>
              <input type="email" value={f.correoUsuario} maxLength={150} onChange={(e) => set('correoUsuario', e.target.value)} />
            </Campo>
          </div>
        </Seccion>

        <Seccion numero="02" titulo="Tomador / Asegurado">
          <div className="rejilla">
            <Campo etiqueta="Nombre o razón social" error={err('asegurado')} ancho>
              <input value={f.asegurado} maxLength={180} onChange={(e) => set('asegurado', e.target.value)} />
            </Campo>
            <Campo etiqueta="RIF">
              <input value={f.rif} maxLength={60} onChange={(e) => set('rif', e.target.value)} />
            </Campo>
            <Campo etiqueta="Correo electrónico del tomador" error={err('correoDestinatario')} ayuda="Destinatario del PDF de la cotización.">
              <input type="email" value={f.correoDestinatario} maxLength={150} onChange={(e) => set('correoDestinatario', e.target.value)} />
            </Campo>
            <Campo etiqueta="Intermediario">
              <input value={f.intermediario} onChange={(e) => set('intermediario', e.target.value)} />
            </Campo>
            <Campo etiqueta="Ubicación del riesgo" ancho>
              <input value={f.ubicacion} onChange={(e) => set('ubicacion', e.target.value)} />
            </Campo>
          </div>
        </Seccion>

        <Seccion numero="03" titulo="Riesgo">
          <div className="rejilla">
            <Campo etiqueta="Clase de riesgo" ancho>
              <select value={f.clase} onChange={(e) => cambiarClase(Number(e.target.value))}>
                {RCG_CLASES.map((c, i) => <option key={c.nombre} value={i}>{c.etiqueta} ({c.min.toFixed(2)}% - {c.max.toFixed(2)}%)</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Índole específica" error={f.indole || tocado ? cot.errores.indole : undefined} ancho
              ayuda={f.indole === INDOLE_OTRA ? 'Describa claramente la actividad. Sujeto a revisión de suscripción.' : 'Selección sujeta a revisión de suscripción.'}>
              <select value={f.indole} onChange={(e) => set('indole', e.target.value)}>
                <option value="">Seleccione una índole específica…</option>
                <optgroup label="Actividades de la clase seleccionada">
                  {clase.indoles.map((v) => <option key={v} value={v}>{v}</option>)}
                  <option value={INDOLE_OTRA}>{INDOLE_OTRA}</option>
                </optgroup>
                <optgroup label="Clasificación obligatoria: Industrias">
                  {RCG_INDUSTRIAS.map((v) => <option key={v} value={v}>{v}{f.clase !== CLASE_INDUSTRIAS ? ' (requiere clase Industrias)' : ''}</option>)}
                </optgroup>
                <optgroup label="RESTRINGIDAS — cotización por Área Técnica">
                  {RCG_RESTRINGIDAS.map((v) => <option key={v} value={v}>⛔ {v}</option>)}
                </optgroup>
              </select>
            </Campo>
            <Campo etiqueta="Actividad específica" error={f.actividadEspecifica || tocado ? cot.errores.actividadEspecifica : undefined} ancho>
              <input value={f.actividadEspecifica} maxLength={180} onChange={(e) => set('actividadEspecifica', e.target.value)} />
            </Campo>
          </div>

          <label className="check">
            <input type="checkbox" checked={f.esContrato}
              onChange={(e) => setF((x) => ({ ...x, esContrato: e.target.checked, ...(e.target.checked ? {} : { numeroContrato: '', objetoObra: '', coasegurado: '', condiciones: [] }) }))} />
            Cotización con contrato
          </label>
          {f.esContrato && (
            <div className="rejilla">
              <Campo etiqueta="N.º de contrato" error={err('numeroContrato')}>
                <input value={f.numeroContrato} onChange={(e) => set('numeroContrato', e.target.value)} />
              </Campo>
              <Campo etiqueta="Nombre del coasegurado" error={err('coasegurado')}>
                <input value={f.coasegurado} maxLength={180} onChange={(e) => set('coasegurado', e.target.value)} />
              </Campo>
              <Campo etiqueta="Objeto de la obra" error={err('objetoObra')} ancho>
                <input value={f.objetoObra} onChange={(e) => set('objetoObra', e.target.value)} />
              </Campo>
            </div>
          )}
        </Seccion>

        <Seccion numero="04" titulo="Límite y tasa">
          <div className="rejilla">
            <Campo etiqueta="Moneda">
              <select value={f.moneda} onChange={(e) => set('moneda', e.target.value as MonedaRcg)}>
                {MONEDAS_RCG.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Límite de responsabilidad (opción I)" error={f.limite ? cot.errores.limite : err('limite')} ayuda="Entre 5.000 y 1.000.000.">
              <input type="number" min={5000} max={1000000} step="0.01" value={f.limite} onChange={(e) => set('limite', e.target.value)} />
            </Campo>
            <Campo etiqueta="Tasa básica (%)" error={cot.errores.tasa} ayuda={`Rango: ${clase.min}% - ${clase.max}%`}>
              <input type="number" min={clase.min} max={clase.max} step="0.01" value={f.tasa} onChange={(e) => set('tasa', e.target.value)} />
            </Campo>
          </div>
        </Seccion>

        <Seccion numero="05" titulo="Condiciones especiales">
          {f.esContrato
            ? RCG_CONDICIONES.slice(0, 4).map((c, i) => (
                <label className="check" key={c}>
                  <input type="checkbox" checked={f.condiciones.includes(i)} onChange={() => alternarCondicion(i)} /> {c}
                </label>
              ))
            : <p className="ayuda">Las condiciones adicionales solo se habilitan con contrato.</p>}
          <p className="ayuda"><strong>Siempre aplica:</strong> {RCG_CONDICIONES[4]}</p>
        </Seccion>
      </form>

      <aside className="resumen">
        <h2>Cotización RCG</h2>
        <dl className="datos solo-imprimir">
          <dt>Tomador / Asegurado</dt><dd>{f.asegurado}</dd>
          <dt>RIF</dt><dd>{f.rif || 'N/A'}</dd>
          <dt>Índole / actividad</dt><dd>{f.indole} · {f.actividadEspecifica}</dd>
          {f.esContrato && <><dt>Contrato / coasegurado</dt><dd>{f.numeroContrato} · {f.coasegurado}</dd></>}
          <dt>Ubicación del riesgo</dt><dd>{f.ubicacion || 'N/A'}</dd>
          <dt>Intermediario</dt><dd>{f.intermediario || 'N/A'}</dd>
          <dt>Sucursal · elaborada por</dt><dd>{f.sucursal} · {f.usuario}</dd>
          <dt>Fecha</dt><dd>{new Date().toLocaleDateString('es-VE')}</dd>
        </dl>
        {cot.restringida && <div className="alerta error">Actividad restringida: cotización por Área Técnica. No se puede cotizar automáticamente.</div>}
        {cot.alternativas.length === 0 ? (
          <p className="ayuda">Ingrese un límite y una tasa válidos.</p>
        ) : (
          <>
            <table className="tabla">
              <thead><tr><th>Opción</th><th>Límite</th><th>Prima neta</th></tr></thead>
              <tbody>
                {cot.alternativas.map((a) => (
                  <tr key={a.opcion}>
                    <td>{a.opcion}</td><td>{m(a.limite)}</td>
                    <td><strong>{m(a.prima)}</strong>{a.primaMinimaAplicada && <small className="ayuda"> (prima mínima)</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Coberturas — {f.esContrato ? 'con contrato (7)' : 'sin contrato (13)'}</h3>
            <table className="tabla compacta">
              <thead><tr><th>Cobertura</th>{cot.alternativas.map((a) => <th key={a.opcion}>{a.opcion}</th>)}</tr></thead>
              <tbody>
                {cot.coberturas.map((c) => (
                  <tr key={c.nombre}><td>{c.nombre}</td>{c.montos.map((x, i) => <td key={i} className="num">{importe(x)}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <p className="ayuda"><strong>Deducible:</strong> {cot.deducible}</p>
            {cot.notaIgtf && <p className="ayuda">La cotización no incluye el 3 % del IGTF; tómelo en cuenta al pagar la prima.</p>}
            <h3>Condiciones especiales</h3>
            <ul className="lista">{cot.condiciones.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="ayuda">Cotización válida por quince (15) días continuos.</p>
          </>
        )}
        <div className="acciones no-imprimir">
          <button type="button" className="boton" onClick={() => { setTocado(true); if (listo) window.print(); }}>Imprimir / guardar PDF</button>
          <button type="button" className="boton secundario" onClick={() => { setF(INICIAL); setTocado(false); }}>Nueva cotización</button>
        </div>
        {tocado && !listo && <div className="alerta error no-imprimir">Revise los campos marcados antes de imprimir.</div>}
        <AvisoEmision producto="RCG (ramo 28 · producto 89)" />
      </aside>
    </div>
  );
}
