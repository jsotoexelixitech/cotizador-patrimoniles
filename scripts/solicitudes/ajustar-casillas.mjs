// Ajusta la posición de cada casilla de las solicitudes al cuadrado que Word dibujó en el PDF en blanco.
// Word informa mal la posición horizontal de los campos en párrafos centrados; en el PDF cada casilla es un cuadrado
// (`x y w h re`, ~8 pt). Para cada casilla de posiciones.json se toma el cuadrado de su misma línea más cercano y se guarda
// en `caja` = [x, y, lado] (puntos desde arriba a la izquierda). Lo corre preparar-plantillas.ps1 al final; también suelto:
//   node scripts/solicitudes/ajustar-casillas.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRef } from 'pdf-lib';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'solicitudes', 'plantillas');
const ramos = process.argv.slice(2).length ? process.argv.slice(2) : ['rcg', 'rcp', 'rce'];

for (const r of ramos) {
  const pdf = await PDFDocument.load(readFileSync(join(dir, `solicitud-${r}.pdf`)));
  const archivoPos = join(dir, `solicitud-${r}.posiciones.json`);
  const pos = JSON.parse(readFileSync(archivoPos, 'utf8'));
  // Cuadrados de cada página, en coordenadas desde arriba a la izquierda.
  const cuadrados = pdf.getPages().map((pg) => {
    const c = pg.node.Contents();
    const partes = c instanceof PDFArray ? c.asArray() : [c];
    const texto = partes.map((p) => Buffer.from(decodePDFRawStream(p instanceof PDFRef ? pdf.context.lookup(p) : p).decode()).toString('latin1')).join('\n');
    const H = pg.getHeight();
    return [...texto.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)]
      .map((m) => m.slice(1, 5).map(Number))
      .filter(([, , w, h]) => w > 5 && w < 12 && Math.abs(w - h) < 1)
      .map(([x, y, w, h]) => ({ x, y: H - y - h, lado: w, usado: false }));
  });
  // Casillas: campos cuyo texto en el formato en blanco es «0» (resultado de un FORMCHECKBOX sin marcar).
  const casillas = pos.campos.filter((c) => c.v === '0' || c.v === '1');
  const pares = [];
  for (const c of casillas) {
    for (const q of cuadrados[c.p - 1] ?? []) {
      const dy = Math.abs(q.y - c.y - 1.5);
      if (dy > 6) continue;
      pares.push({ c, q, d: Math.abs(q.x - c.x) + dy * 4 });
    }
  }
  pares.sort((a, b) => a.d - b.d);
  let ajustadas = 0;
  for (const { c, q, d } of pares) {
    if (c.caja || q.usado || d > 40) continue;
    c.caja = [Number(q.x.toFixed(2)), Number(q.y.toFixed(2)), Number(q.lado.toFixed(2))];
    q.usado = true;
    ajustadas++;
  }
  const json = JSON.stringify(pos).replace(/\{"n"/g, '\n{"n"');
  writeFileSync(archivoPos, json);
  console.log(`${r}: ${ajustadas} de ${casillas.length} casillas ajustadas al cuadrado del PDF`);
}
