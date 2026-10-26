import { useMemo, useState } from 'react';
import { importe, numeroONulo, porcentaje } from '../tarifas/comun';
import {
  actividadesDeClase, COBERTURAS_BASICAS, cotizarRc, NOMBRES, OPCIONES, TARIFA, tasaMedia, VIGENCIAS_CONTRATO,
  type BaseNomina, type IdOpcion, type Modo, type MonedaRc, type OpcionalVes, type ProductoEntrada,
} from '../tarifas/rcp-rce';
import { AvisoEmision, Campo, Seccion, SelectSucursal } from './Campo';

type K = 'p' | 'e';
interface ProductoForm { tasa: string; ajuste: string; opcion: IdOpcion; adicionales: boolean[]; opcionalesVes: { seleccionada: boolean; tasa: string; limite: string; grupo: string }[] }

const ADICIONALES: Record<K, { nombre: string; porEmpleado: string }[]> = {
  p: [
    { nombre: 'Gastos por asistencia médica, quirúrgica y farmacéutica', porEmpleado: 'I 15 · II 30 · III 75' },
    { nombre: 'Hernia', porEmpleado: 'I 7,50 · II 15 · III 37,50' },
  ],
  e: [
    { nombre: 'Negligencia del Empleador', porEmpleado: 'I 2 · II 4 · III 10' },
    { nombre: 'Asistencia Legal y Defensa Penal', porEmpleado: 'I 3 · II 6 · III 15' },
    { nombre: 'Gastos Médicos', porEmpleado: 'I 6 · II 10 · III 20' },
  ],
};

const productoInicial = (k: K): ProductoForm => ({
  tasa: '', ajuste: '0', opcion: 'I', adicionales: ADICIONALES[k].map(() => false),
  opcionalesVes: TARIFA[k].options.map((o) => ({
    seleccionada: false, tasa: String(o[1]), limite: /m[eé]dic/i.test(o[0]) ? '1000' : '650', grupo: '2000',
  })),
});

const aEntrada = (x: ProductoForm): ProductoEntrada => ({
  tasa: numeroONulo(x.tasa), ajuste: numeroONulo(x.ajuste), opcion: x.opcion, adicionales: x.adicionales,
  opcionalesVes: x.opcionalesVes.map((o): OpcionalVes => ({ seleccionada: o.seleccionada, tasa: numeroONulo(o.tasa), limite: o.limite, grupo: numeroONulo(o.grupo) })),
});

export default function CotizadorRcpRce() {
  const [modo, setModo] = useState<Modo>('both');
  const [moneda, setMoneda] = useState<MonedaRc>('USD');
  const [tasaBcv, setTasaBcv] = useState('');
  const [base, setBase] = useState<BaseNomina>('employee');
  const [monto, setMonto] = useState('');
  const [empleados, setEmpleados] = useState('');
  const [claseSel, setClaseSel] = useState('');
  const [claseRelacionada, setClaseRelacionada] = useState('');
  const [actividad, setActividad] = useState('');
  const [filtro, setFiltro] = useState('');
  const [indole, setIndole] = useState('');
  const [datos, setDatos] = useState({ asegurado: '', rif: '', correo: '', direccion: '', sucursal: '', emisor: '', correoEmisor: '', intermediario: '' });
  const [contrato, setContrato] = useState({ esContrato: false, numeroContrato: '', vigenciaContrato: 'Anual', objetoContrato: '' });
  const [prod, setProd] = useState<Record<K, ProductoForm>>({ p: productoInicial('p'), e: productoInicial('e') });
  const [tocado, setTocado] = useState(false);

  const otraClase = claseSel === 'other';
  const claseTexto = otraClase ? claseRelacionada : claseSel;
  const clase = claseTexto === '' ? null : Number(claseTexto);
  const actividades = useMemo(() => (clase === null ? [] : actividadesDeClase(clase)), [clase]);
  const ves = moneda === 'VES';
  const simbolo = ves ? 'Bs' : moneda;
  const activos: K[] = modo === 'both' ? ['p', 'e'] : [modo];

  const setP = (k: K, cambio: Partial<ProductoForm>) => setProd((x) => ({ ...x, [k]: { ...x[k], ...cambio } }));

  // Al cambiar clase/actividad se propone la tasa media del rango (igual que el original).
  const aplicarClase = (nuevaClase: number | null) => {
    setActividad('');
    setProd((x) => ({
      p: { ...x.p, tasa: nuevaClase === null ? '' : String(tasaMedia(TARIFA.p.risks[nuevaClase])) },
      e: { ...x.e, tasa: '' },
    }));
  };
  const elegirActividad = (v: string) => {
    setActividad(v);
    setP('e', { tasa: v === '' ? '' : String(tasaMedia(TARIFA.e.risks[Number(v)])) });
  };

  const cot = useMemo(() => cotizarRc({
    modo, moneda, tasaBcv: numeroONulo(tasaBcv), base, monto: numeroONulo(monto), empleados: numeroONulo(empleados),
    clase, otraClase, actividad: actividad === '' ? null : Number(actividad), indole, ...datos, ...contrato,
    p: aEntrada(prod.p), e: aEntrada(prod.e),
  }), [modo, moneda, tasaBcv, base, monto, empleados, clase, otraClase, actividad, indole, datos, contrato, prod]);

  const m = (n: number) => `${simbolo} ${importe(n)}`;
  const listo = cot.errores.length === 0;
  const actividadesFiltradas = actividades.filter((i) => !filtro || TARIFA.e.risks[i][0].toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div className="cotizador">
      <form className="formulario no-imprimir" onSubmit={(e) => e.preventDefault()}>
        <Seccion numero="01" titulo="Producto y moneda">
          <div className="segmentos">
            {([['p', 'Patronal (RCP)'], ['e', 'Empresarial (RCE)'], ['both', 'RCP + RCE']] as [Modo, string][]).map(([v, t]) => (
              <button type="button" key={v} className={modo === v ? 'activo' : ''} onClick={() => setModo(v)}>{t}</button>
            ))}
          </div>
          <div className="rejilla">
            <Campo etiqueta="Moneda">
              <select value={moneda} onChange={(e) => setMoneda(e.target.value as MonedaRc)}>
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="VES">Bolívares (Bs)</option>
              </select>
            </Campo>
            {ves && (
              <Campo etiqueta="Tasa BCV: 1 USD = Bs" ayuda="Tasa oficial del BCV del día (bcv.org.ve).">
                <input type="number" min={0} step="0.0001" value={tasaBcv} onChange={(e) => setTasaBcv(e.target.value)} />
              </Campo>
            )}
          </div>
        </Seccion>

        <Seccion numero="02" titulo="Tomador y emisor">
          <div className="rejilla">
            <Campo etiqueta="Tomador / Asegurado" ancho><input value={datos.asegurado} onChange={(e) => setDatos({ ...datos, asegurado: e.target.value })} /></Campo>
            <Campo etiqueta="RIF"><input value={datos.rif} onChange={(e) => setDatos({ ...datos, rif: e.target.value })} /></Campo>
            <Campo etiqueta="Correo electrónico"><input type="email" value={datos.correo} onChange={(e) => setDatos({ ...datos, correo: e.target.value })} /></Campo>
            <Campo etiqueta="Ubicación del riesgo" ancho><input value={datos.direccion} onChange={(e) => setDatos({ ...datos, direccion: e.target.value })} /></Campo>
            <Campo etiqueta="Intermediario"><input value={datos.intermediario} onChange={(e) => setDatos({ ...datos, intermediario: e.target.value })} /></Campo>
            <SelectSucursal valor={datos.sucursal} onCambio={(v) => setDatos({ ...datos, sucursal: v })} />
            <Campo etiqueta="Emitida por"><input value={datos.emisor} onChange={(e) => setDatos({ ...datos, emisor: e.target.value })} /></Campo>
            <Campo etiqueta="Correo de quien emite"><input type="email" value={datos.correoEmisor} onChange={(e) => setDatos({ ...datos, correoEmisor: e.target.value })} /></Campo>
          </div>
          <label className="check">
            <input type="checkbox" checked={contrato.esContrato} onChange={(e) => setContrato({ ...contrato, esContrato: e.target.checked })} /> Cotización con contrato
          </label>
          {contrato.esContrato && (
            <div className="rejilla">
              <Campo etiqueta="N.º de contrato"><input value={contrato.numeroContrato} onChange={(e) => setContrato({ ...contrato, numeroContrato: e.target.value })} /></Campo>
              <Campo etiqueta="Vigencia">
                <select value={contrato.vigenciaContrato} onChange={(e) => setContrato({ ...contrato, vigenciaContrato: e.target.value })}>
                  {VIGENCIAS_CONTRATO.map((v) => <option key={v}>{v}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Objeto de la obra" ancho><input value={contrato.objetoContrato} onChange={(e) => setContrato({ ...contrato, objetoContrato: e.target.value })} /></Campo>
            </div>
          )}
        </Seccion>

        <Seccion numero="03" titulo="Clasificación del riesgo">
          <div className="rejilla">
            <Campo etiqueta="Índole (descripción de la actividad)" ancho>
              <input value={indole} onChange={(e) => setIndole(e.target.value)} placeholder="Ej.: venta de repuestos" />
            </Campo>
            <Campo etiqueta="Clase común" ancho>
              <select value={claseSel} onChange={(e) => { setClaseSel(e.target.value); setClaseRelacionada(''); aplicarClase(e.target.value === '' || e.target.value === 'other' ? null : Number(e.target.value)); }}>
                <option value="">Selecciona una clase</option>
                {TARIFA.p.risks.map((r, i) => <option key={r[0]} value={i}>{i + 1}. {r[0]}</option>)}
                <option value="other">12. Otras (Especificar)</option>
              </select>
            </Campo>
            {otraClase && (
              <Campo etiqueta="Clase relacionada" ancho>
                <select value={claseRelacionada} onChange={(e) => { setClaseRelacionada(e.target.value); aplicarClase(e.target.value === '' ? null : Number(e.target.value)); }}>
                  <option value="">Selecciona la clase más parecida</option>
                  {TARIFA.p.risks.map((r, i) => <option key={r[0]} value={i}>{i + 1}. {r[0]}</option>)}
                </select>
              </Campo>
            )}
            {clase !== null && (
              <>
                <Campo etiqueta="Buscar actividad">
                  <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar…" />
                </Campo>
                <Campo etiqueta={`Actividad del riesgo (${actividadesFiltradas.length})`} ancho>
                  <select value={actividad} onChange={(e) => elegirActividad(e.target.value)}>
                    <option value="">Selecciona la actividad</option>
                    {actividadesFiltradas.map((i) => <option key={i} value={i}>{TARIFA.e.risks[i][0]}</option>)}
                  </select>
                </Campo>
              </>
            )}
          </div>
        </Seccion>

        <Seccion numero="04" titulo="Nómina">
          <div className="rejilla">
            <Campo etiqueta="Base">
              <select value={base} onChange={(e) => setBase(e.target.value as BaseNomina)}>
                <option value="employee">Salario anual promedio por empleado</option>
                <option value="total">Nómina anual total</option>
              </select>
            </Campo>
            <Campo etiqueta={`Monto anual (${simbolo})`} ayuda={ves ? 'Monto en bolívares.' : `Promedio por empleado mínimo ${simbolo} 1.800.`}>
              <input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </Campo>
            <Campo etiqueta="Cantidad de empleados">
              <input type="number" min={1} step={1} value={empleados} onChange={(e) => setEmpleados(e.target.value)} />
            </Campo>
          </div>
          <p className="ayuda">Nómina anual total: <strong>{m(cot.nomina)}</strong></p>
        </Seccion>

        {activos.map((k, idx) => {
          const x = prod[k];
          const r = cot.resultados.find((y) => y.k === k);
          return (
            <Seccion key={k} numero={`05${idx === 0 ? 'A' : 'B'}`} titulo={NOMBRES[k]}>
              <p className="ayuda">{r?.riesgo ? `${k === 'p' ? 'Clase' : 'Actividad'}: ${r.riesgo[0]} · rango ${porcentaje(r.riesgo[1])} – ${porcentaje(r.riesgo[2])}` : 'Clasificación pendiente'}</p>
              <div className="rejilla">
                <Campo etiqueta="Tasa básica (%)">
                  <input type="number" step="any" value={x.tasa} onChange={(e) => setP(k, { tasa: e.target.value })} />
                </Campo>
                <Campo etiqueta="Ajuste: descuento (−) o recargo (+) %" ayuda="Relativo, máximo ±10 %.">
                  <input type="number" min={-10} max={10} step="0.01" value={x.ajuste} onChange={(e) => setP(k, { ajuste: e.target.value })} />
                </Campo>
                {!ves && (
                  <Campo etiqueta="Opción para el resumen">
                    <select value={x.opcion} onChange={(e) => setP(k, { opcion: e.target.value as IdOpcion })}>
                      {OPCIONES.map((o) => <option key={o} value={o}>Opción {o}</option>)}
                    </select>
                  </Campo>
                )}
              </div>
              <p className="ayuda">Coberturas básicas: {[...COBERTURAS_BASICAS, k === 'p' ? 'Gastos de entierro' : 'Secuelas o deformidades permanentes'].join(' · ')}.</p>
              <h3>Coberturas adicionales</h3>
              {!ves
                ? ADICIONALES[k].map((a, i) => (
                    <label className="check" key={a.nombre}>
                      <input type="checkbox" checked={x.adicionales[i]}
                        onChange={(e) => setP(k, { adicionales: x.adicionales.map((v, j) => (j === i ? e.target.checked : v)) })} />
                      {a.nombre} <small className="ayuda">— por empleado: {a.porEmpleado}</small>
                    </label>
                  ))
                : TARIFA[k].options.map((o, i) => {
                    const op = x.opcionalesVes[i];
                    const cambiar = (c: Partial<typeof op>) => setP(k, { opcionalesVes: x.opcionalesVes.map((v, j) => (j === i ? { ...v, ...c } : v)) });
                    const restringida = /Negligencia|Defensa Penal/i.test(o[0]);
                    const medica = /m[eé]dic/i.test(o[0]);
                    return (
                      <div key={o[0]} className="opcional">
                        <label className="check"><input type="checkbox" checked={op.seleccionada} onChange={(e) => cambiar({ seleccionada: e.target.checked })} /> {o[0]}</label>
                        {op.seleccionada && (
                          <div className="rejilla">
                            <Campo etiqueta={`Tasa (${o[1]}% – ${o[2]}%)`}>
                              <input type="number" step="any" value={k === 'e' ? String(o[1]) : op.tasa} readOnly={k === 'e'} onChange={(e) => cambiar({ tasa: e.target.value })} />
                            </Campo>
                            {!restringida && (medica ? (
                              <Campo etiqueta="Límite médico por trabajador (USD)">
                                <select value={op.limite} onChange={(e) => cambiar({ limite: e.target.value })}>
                                  <option value="1000">1.000</option><option value="1500">1.500</option><option value="2000">2.000</option><option value="tech">Mayor a 2.000 · Área técnica</option>
                                </select>
                              </Campo>
                            ) : (
                              <Campo etiqueta="Límite por trabajador (USD)">
                                <input type="number" value={op.limite} onChange={(e) => cambiar({ limite: e.target.value })} />
                              </Campo>
                            ))}
                            {!restringida && (
                              <Campo etiqueta="Límite dos o más trabajadores (USD)">
                                <input type="number" value={op.grupo} onChange={(e) => cambiar({ grupo: e.target.value })} />
                              </Campo>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
            </Seccion>
          );
        })}
      </form>

      <aside className="resumen">
        <h2>Cotización {modo === 'both' ? 'RCP + RCE' : modo === 'p' ? 'RCP' : 'RCE'}</h2>
        <dl className="datos solo-imprimir">
          <dt>Tomador / Asegurado</dt><dd>{datos.asegurado}</dd>
          <dt>RIF</dt><dd>{datos.rif}</dd>
          <dt>Índole</dt><dd>{indole}</dd>
          <dt>Ubicación del riesgo</dt><dd>{datos.direccion}</dd>
          <dt>Intermediario</dt><dd>{datos.intermediario || 'No indicado'}</dd>
          {contrato.esContrato && <><dt>Contrato</dt><dd>{contrato.numeroContrato} · {contrato.vigenciaContrato} · {contrato.objetoContrato}</dd></>}
          <dt>Nómina anual · empleados</dt><dd>{m(cot.nomina)} · {empleados}</dd>
          <dt>Sucursal · emitida por</dt><dd>{datos.sucursal} · {datos.emisor}</dd>
          <dt>Fecha</dt><dd>{new Date().toLocaleDateString('es-VE')}</dd>
        </dl>
        {cot.resultados.map((r) => (
          <div key={r.k} className="bloque">
            <h3>{NOMBRES[r.k]}{r.opcion ? ` · Opción ${r.opcion}` : ''}</h3>
            {r.opciones && (
              <table className="tabla compacta">
                <thead><tr><th>Concepto</th>{r.opciones.map((o) => <th key={o.id}>{o.id}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Prima básica</td>{r.opciones.map((o) => <td key={o.id} className="num">{importe(o.primaBasica)}</td>)}</tr>
                  <tr><td>Ajuste</td>{r.opciones.map((o) => <td key={o.id} className="num">{importe(o.ajuste)}</td>)}</tr>
                  <tr><td>Adicionales</td>{r.opciones.map((o) => <td key={o.id} className="num">{importe(o.primaOpcionales)}</td>)}</tr>
                  <tr><td>Ajuste a mínimo / diferenciación</td>{r.opciones.map((o) => <td key={o.id} className="num">{importe(o.ajusteMinimo + o.diferenciacion)}</td>)}</tr>
                  <tr className="fuerte"><td>Prima</td>{r.opciones.map((o) => <td key={o.id} className="num">{importe(o.prima)}</td>)}</tr>
                  <tr><td>Límite por trabajador</td>{r.opciones.map((o) => <td key={o.id} className="num">{importe(o.limites[0])}</td>)}</tr>
                  <tr><td>Dos o más / evento-año</td>{r.opciones.map((o) => <td key={o.id} className="num">{importe(o.limites[1])}</td>)}</tr>
                </tbody>
              </table>
            )}
            <dl className="datos">
              <dt>Tasa final</dt><dd>{Number.isFinite(r.tasaEfectiva) ? porcentaje(r.tasaEfectiva) : '—'}</dd>
              <dt>Límite por trabajador</dt><dd>{m(r.limites[0] ?? 0)}</dd>
              <dt>Dos o más trabajadores</dt><dd>{m(r.limites[1] ?? 0)}</dd>
              <dt>Por evento / año póliza</dt><dd>{m(r.limites[2] ?? 0)}</dd>
              <dt>Prima</dt><dd><strong>{listo ? m(r.prima) : '—'}</strong></dd>
            </dl>
            {r.nota && <p className="ayuda">{r.nota}</p>}
          </div>
        ))}
        <div className="total"><span>Total</span><strong>{listo ? m(cot.total) : '—'}</strong></div>
        {cot.errores.length > 0 && tocado && cot.errores.map((x) => <div key={x} className="alerta error no-imprimir">{x}</div>)}
        {cot.avisos.map((x) => <div key={x} className="alerta">{x}</div>)}
        <p className="ayuda">Cotización válida por quince (15) días.{!ves && ' No incluye el 3 % del IGTF.'}</p>
        <div className="acciones no-imprimir">
          <button type="button" className="boton" onClick={() => { setTocado(true); if (listo) window.print(); }}>Imprimir / guardar PDF</button>
          {!tocado && !listo && <small className="ayuda">Complete los datos para ver la prima.</small>}
        </div>
        <AvisoEmision producto="RCP / RCE" />
      </aside>
    </div>
  );
}
