// PM2 en el servidor (121): `vite preview` sirve el build y hace de proxy a nest-api y Nexus con las keys del .env.local
// del servidor (nunca llegan al navegador). Apache publica /cotizador-rc/ → 127.0.0.1:5185.
module.exports = {
  apps: [
    {
      name: 'cotizador-rc',
      cwd: __dirname,
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview',
      env_production: { NODE_ENV: 'production', PORT: '5185', VITE_APP_BASE: '/cotizador-rc/' },
    },
  ],
};
