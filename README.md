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
- Tasa dentro del rango de la clase. Índoles de industria exigen «Toda clase de Industrias». Actividades restringidas → Área Técnica.
- Sublímite 30 % con tope en Agua (300.000), Contaminación (100.000), Avisos (30.000) y Defensa Penal (20.000).

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
