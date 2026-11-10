# Cotizador RC — La Mundial de Seguros

Cotizador libre (sin login) de Responsabilidad Civil General (RCG) y Patronal / Empresarial (RCP / RCE).
Reemplaza los dos cotizadores de Google Apps Script con las mismas fórmulas.

```bash
npm install
npm run dev      # http://localhost:5180
npm test         # pruebas del motor de tarifas
npm run build    # dist/ ; VITE_APP_BASE=/cotizador-rc/ para servirlo bajo subpath
```

## Estructura

- `src/tarifas/` — motor puro (sin React), pensado para moverlo luego a nest-api.
  - `rcg.ts` — portado del `.gs` RCG (`TRES-ALTERNATIVAS-USD-EUR-SIEMPRE-10-15-PRUEBA-6`).
  - `rcp-rce.ts` + `data/` — tabla `TARIFF` (11 clases, 344 actividades RCE) y `EQUIVALENCE` del cotizador RCP/RCE.
- `src/components/` + `src/features/` — UI sobre la plantilla homologada RCV (`exelixi-modulos/plantilla-modulo-react`): aurora, stepper píldora, SectionCard, Poppins y paleta La Mundial. Flujo: Producto → Tomador → Riesgo → Cotización → Emisión.

## Reglas RCG

- Límite inicial 5.000 – 1.000.000. Opciones I/II/III = ×1/×2/×3 con tope 1.000.000 (se descarta la que no supere a la anterior).
- Prima = máx(límite × tasa / 100, mínimo). Mínimo USD/EUR = 70 × (suma de la opción / límite inicial); Bs = 35 % de la suma.
- Tasa dentro del rango de la clase. Índoles de industria exigen «Toda clase de Industrias».
- Actividades restringidas (petróleo, minería, astilleros…): no bloquean (acuerdo del 30-oct-2026). Aviso «Actividad sujeta a
  evaluación de la mesa técnica» y el resumen y el PDF dicen «Sujeto a aprobación de la mesa técnica». Aplica también a los
  planes Sis2000 y al combo (por la descripción de la actividad).
- Sublímite 30 % con tope en Agua (300.000), Contaminación (100.000), Avisos (30.000) y Defensa Penal (20.000).

## Combo de coberturas

- Todas las coberturas con tarifa vigente de un ramo: `GET /nest/api/v1/riesgos-generales/coberturas?cramo=N` (ruta propia
  del cotizador en nest-api; si responde 404, el ambiente aún no la tiene). Motor puro en `src/tarifas/combo.ts`.
- Obligatorias siempre incluidas; adicionales a elección. Cada una con su suma dentro de mín./máx. (0 = sin tope) y ninguna
  adicional por encima de la básica ('1'). Prima = suma × tasa / 100, o la prima fija si no hay tasa; total = suma de primas.
- Coberturas sin tarifa en Sis2000 (a propósito: «Tarifa la aplica Técnico»): con la vista técnica se eligen y se escribe su
  tasa % o su prima; el combo se emite entonces con prima informada (nest-api `modo: cotizador`). Sin vista técnica no se emiten.

## Emisión con la prima del cotizador (RCG, RCP, RCE)

- Solo QA y con `VITE_RC_EMITIR=1` en `.env.local`. POST `riesgos-generales/emision` en `modo: cotizador`: nest-api valida y no
  recalcula (requiere `RIESGOS_GENERALES_EMISION_COTIZADOR=true` y la key con `emissions:riesgos-generales-prima`).
- Coberturas: `src/tarifas/data/mapeo-sis2000.ts` (concepto → ccober por moneda; las dudosas marcadas). Toda la prima va en la
  básica, salvo las adicionales por empleado de RCP/RCE; los sublímites van con prima 0. Motor en `src/tarifas/emision-rc.ts`.
- Plan contenedor: un plan vigente del ramo (RCG sugiere PLANI / PLANII / PLAN3 según la opción).

## Vista técnica

Interruptor en **Parámetros** (apagado por defecto, se guarda en el navegador). Apagado, el cliente solo ve la prima total:
se ocultan la tasa y la prima de cada cobertura en pantalla, en el resumen (también el desglose RCP/RCE que se imprime) y en el PDF.

## Reglas RCP / RCE

- USD/EUR: prima básica = nómina × tasa / 100, ajuste ±10 % relativo, adicionales por empleado; mínimo 70.
  Límites RCP: individual = mín(nómina × 20/25/30 %, 35k/40k/45k); colectivo = mín(individual × 10, 275k/300k/325k).
  Si las tres opciones dan la misma prima se diferencian ×1 / ×1,10 / ×1,15.
- Bs (tasa BCV): RCP = 35 % del límite por evento/año; RCE = 60 % de la prima patronal.
- Salario anual mínimo por empleado (USD/EUR): 1.800.

## Pendiente

- Emisión: RCG = ramo 28 / producto 89 en Sis2000 (planes PLANI, PLANII, PLAN3, IGEMA). Falta habilitar los planes del producto y el endpoint de emisión patrimonial.
- Confirmar con La Mundial el mínimo en Bs (35 % de la suma) y el producto/ramo de RCP y RCE en Sis2000.
- PDF oficial con membrete (hoy: imprimir / guardar PDF desde el navegador), correlativo y envío por correo.

## Parámetros configurables

Botón **Parámetros** (cabecera): rangos de tasa por clase, índoles, límites, multiplicadores de opciones, primas mínimas,
sublímites, coberturas, condiciones, deducible y actividades restringidas (RCG); prima mínima, salario mínimo, opciones
I/II/III, reglas en Bs, 11 clases y 344 actividades con sus equivalencias (RCP/RCE).

- Se guardan en el navegador (`localStorage`, clave `cotizador-rc.parametros`) y se pueden exportar/importar en JSON.
- "Restaurar oficiales" vuelve a la tarifa de La Mundial (`PARAMETROS_RCG` / `PARAMETROS_RC`).
- Pendiente: publicarlos desde nest-api para que todos los usuarios usen la misma tarifa.

## PDF de cotización RCG

`src/pdf/cotizacionRcgPdf.ts` (pdf-lib): 2 páginas de cotización + 3 de la Solicitud de Seguro RCG con los datos,
las coberturas marcadas y el intermediario, igual que el documento de La Mundial. Logo, sello y plantilla de la
solicitud en `src/pdf/assets/` (extraídos del cotizador Apps Script). El N.º es provisional hasta tener el correlativo
oficial desde el backend.
