// PM2: `vite preview` sirve el build y hace de proxy a nest-api y Nexus con las keys del .env.local del servidor
// (nunca llegan al navegador). Las apps dependen del servidor, así un `pm2 reload ecosystem.config.cjs` en QA nunca
// levanta las de producción ni al revés.
//  - QA 121 (srv001qa): `cotizador-rc` en :5185 bajo /cotizador-rc/ (Apache /cotizador-rc/ → 127.0.0.1:5185).
//  - Producción GCIA (Srv-Gcia-proyect), scripts/deploy-prod.sh:
//      `cotizador-patrimoniales`        vista cliente, 127.0.0.1:5195, raíz / (Apache patrimoniales.exelixitech.com).
//      `cotizador-patrimoniales-admin`  vista admin,   127.0.0.1:5185, raíz / (solo túnel SSH / red interna; opcional).
const os = require('os');

const GCIA = os.hostname() === 'Srv-Gcia-proyect';

const preview = { cwd: __dirname, script: 'node_modules/vite/bin/vite.js', args: 'preview' };

const qa = [
  {
    name: 'cotizador-rc',
    ...preview,
    env_production: { NODE_ENV: 'production', PORT: '5185', VITE_APP_BASE: '/cotizador-rc/' },
  },
];

const produccion = {
  NODE_ENV: 'production', VITE_APP_BASE: '/', COTIZADOR_HOST: '127.0.0.1', COTIZADOR_ENTORNO: 'produccion',
};

const gcia = [
  {
    name: 'cotizador-patrimoniales',
    ...preview,
    env_production: { ...produccion, PORT: '5195', COTIZADOR_CLIENTE: '1', COTIZADOR_OUTDIR: 'dist' },
  },
  {
    name: 'cotizador-patrimoniales-admin',
    ...preview,
    env_production: { ...produccion, PORT: '5185', COTIZADOR_CLIENTE: '0', COTIZADOR_OUTDIR: 'dist-admin' },
  },
];

module.exports = { apps: GCIA ? gcia : qa };
