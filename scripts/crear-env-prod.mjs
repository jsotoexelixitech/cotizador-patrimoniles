#!/usr/bin/env node
// Crea la .env.local de producción GCIA sin que nadie copie ni vea una key. Uso (en ~/exelixi/cotizador-rc):
//   node scripts/crear-env-prod.mjs
// Opcionales (códigos de plan de Sis2000 PRODUCCIÓN; vacío = el único plan vigente del ramo):
//   RCG_PLAN=RCGGEN RCP_PLAN=<cplan ramo 27> RCE_PLAN=<cplan ramo 37> CPRODUCTOR=80080 node scripts/crear-env-prod.mjs
// Hace:
//  1. Key de nest-api «cotizador-patrimoniales GCIA» con NEST_ADMIN_TOKEN (~/server-api-sys/.env) vía
//     POST /api/v1/admin/keys, con solo las rutas del cotizador que existen en el catálogo (GET /api/v1/admin/scopes)
//     + emissions:riesgos-generales y emissions:riesgos-generales-prima.
//  2. Key de Nexus = API_KEY de ~/exelixi/nexus-api/.env; puerto de cada API = PORT de su .env.
//  3. COTIZACIONES_RC_SECRET (firma hacia Nexus): el de nexus-api/.env; si no existe, lo genera y lo agrega allí
//     (con respaldo). Nexus lo lee tras  pm2 reload nexus-api --update-env.
//  4. Escribe .env.local con permisos 600. Nunca imprime keys ni secretos.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { hostname, homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fallar = (m) => { console.error(`ERROR: ${m}`); process.exit(1); };
if (hostname() !== 'Srv-Gcia-proyect') fallar('este script es solo para producción GCIA (Srv-Gcia-proyect).');
process.umask(0o077);

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, '.env.local');
if (existsSync(destino)) fallar('.env.local ya existe: no se sobrescribe. Si hay que regenerarla, bórrala a mano y revoca la key vieja.');

const NEST_ENV = join(homedir(), 'server-api-sys', '.env');
const NEXUS_ENV = join(homedir(), 'exelixi', 'nexus-api', '.env');

/** Lee una variable de un .env (CRLF o LF, con o sin comillas). */
function leer(archivo, nombre) {
  if (!existsSync(archivo)) fallar(`no existe ${archivo}`);
  let valor = '';
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(new RegExp(`^\\s*${nombre}\\s*=\\s*(.*)$`));
    if (m) valor = m[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return valor;
}

const admin = leer(NEST_ENV, 'NEST_ADMIN_TOKEN') || fallar('NEST_ADMIN_TOKEN vacío en ~/server-api-sys/.env');
const nestUrl = `http://127.0.0.1:${leer(NEST_ENV, 'PORT') || '3002'}`;
const nexusKey = leer(NEXUS_ENV, 'API_KEY') || fallar('API_KEY vacío en ~/exelixi/nexus-api/.env');
const nexusUrl = `http://127.0.0.1:${leer(NEXUS_ENV, 'PORT') || '3092'}`;

// ── 1 · Rutas del cotizador que existen en el catálogo de nest-api de producción ──
const cabeceras = { 'content-type': 'application/json', 'x-admin-token': admin };
const cat = await fetch(`${nestUrl}/api/v1/admin/scopes`, { headers: cabeceras });
if (!cat.ok) fallar(`GET /api/v1/admin/scopes respondió ${cat.status} (¿nest-api arriba en ${nestUrl}? ¿NEST_ADMIN_TOKEN?)`);
const { routes = [], scopes: catScopes = [] } = await cat.json();
const RUTAS = [
  /^GET \/api\/v1\/riesgos-generales\/(ramos|coberturas|tarifa)\b/,
  /^GET \/api\/v1\/valrep\/planes\/riesgos-generales\b/,
  /^POST \/api\/v1\/mail\/send$/,
  /^POST \/api\/v1\/riesgos-generales\/(cotizacion|emision)$/,
];
const rutas = routes.map((r) => r.routeId).filter((id) => RUTAS.some((re) => re.test(id)));
// Scopes obligatorios (tal cual); el partner patrimonial (quote/emit) no existe en GCIA y no se pide.
const OBLIGATORIOS = ['emissions:riesgos-generales', 'emissions:riesgos-generales-prima'];
const idsScopes = new Set(catScopes.map((s) => String(s.id)));
const faltan = OBLIGATORIOS.filter((s) => !idsScopes.has(s));
if (faltan.length) console.warn(`AVISO: el catálogo no lista ${faltan.join(', ')}; se piden igual (nest-api los valida).`);
const pedidas = [...new Set([...rutas, ...OBLIGATORIOS])];
for (const re of RUTAS) if (!rutas.some((id) => re.test(id))) console.warn(`AVISO: sin ruta en el catálogo para ${re.source}`);
console.log(`Rutas/scopes de la key (${pedidas.length}):\n  ${pedidas.join('\n  ')}`);

const alta = await fetch(`${nestUrl}/api/v1/admin/keys`, {
  method: 'POST', headers: cabeceras, body: JSON.stringify({ name: 'cotizador-patrimoniales GCIA', scopes: pedidas }),
});
const creada = await alta.json().catch(() => ({}));
if (!alta.ok || !creada.plainKey) fallar(`POST /api/v1/admin/keys respondió ${alta.status}: ${creada.message ?? 'sin plainKey'}`);
console.log(`Key nest-api creada: id ${creada.key?.id ?? '?'} (el valor no se muestra).`);

// ── 3 · Secreto de la firma hacia Nexus ──
let secreto = leer(NEXUS_ENV, 'COTIZACIONES_RC_SECRET');
if (!secreto) {
  secreto = randomBytes(32).toString('hex');
  const respaldo = `${NEXUS_ENV}.bak-${new Date().toISOString().replace(/[:.]/g, '')}`;
  copyFileSync(NEXUS_ENV, respaldo);
  const texto = readFileSync(NEXUS_ENV, 'utf8');
  const fin = texto.includes('\r\n') ? '\r\n' : '\n';
  appendFileSync(NEXUS_ENV, `${texto.endsWith('\n') ? '' : fin}COTIZACIONES_RC_SECRET=${secreto}${fin}`);
  console.log(`COTIZACIONES_RC_SECRET generado y agregado a nexus-api/.env (respaldo ${respaldo}).`);
  console.log('  Nexus lo toma con:  pm2 reload nexus-api --update-env');
} else {
  console.log('COTIZACIONES_RC_SECRET tomado de nexus-api/.env.');
}

// ── 4 · .env.local ──
const plan = (v, def = '') => (process.env[v] ?? def).trim();
const contenido = [
  `# Producción GCIA — generado por scripts/crear-env-prod.mjs el ${new Date().toISOString()}. No versionar ni copiar.`,
  '# Variables sin VITE_ = solo servidor (proxy de vite preview); nunca entran al bundle.',
  `NEST_API_URL=${nestUrl}`,
  `NEST_API_KEY=${creada.plainKey}`,
  `NEXUS_API_URL=${nexusUrl}`,
  `NEXUS_API_KEY=${nexusKey}`,
  `COTIZACIONES_RC_SECRET=${secreto}`,
  '# Emisión de prueba desde el navegador: apagada en producción (se emite por Nexus con riesgos-generales/emision modo cotizador).',
  'VITE_RCG_PLANES_EMITIR=0',
  'VITE_RC_EMITIR=0',
  `VITE_RCG_PLANES_CPRODUCTOR=${plan('CPRODUCTOR', '80080')}`,
  `VITE_RCG_PLAN_CONTENEDOR=${plan('RCG_PLAN', 'RCGGEN')}`,
  `VITE_RCP_PLAN_CONTENEDOR=${plan('RCP_PLAN')}`,
  `VITE_RCE_PLAN_CONTENEDOR=${plan('RCE_PLAN')}`,
  '',
].join('\n');
writeFileSync(destino, contenido, { mode: 0o600, flag: 'wx' });
console.log(`.env.local escrita (600) con: ${contenido.split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split('=')[0]).join(', ')}`);
