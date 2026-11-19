# Botón «Cotizador RC» en Sys2000 (SysIP) — SSO de Exélixi Nexus

Especificación para La Mundial. El cotizador de Responsabilidad Civil (RCG, RCP y RCE) se abre desde Sys2000 en un
iframe con el SSO de Nexus, igual que RCV y Patrimoniales. Así el cotizador sabe quién cotiza y emite: la cotización
guardada y la póliza llevan el productor y el usuario de la sesión de Sys2000.

La landing pública de La Mundial **no cambia**: enlaza el cotizador sin token y cotiza como venta web
(La Mundial directo).

## 1. Entrada en `assets/config.json`

Agregar una entrada nueva en `iframeEmbedded`, con el mismo patrón que `patrimoniales` y `rcv`:

```json
"iframeEmbedded": {
  "cotizador-rc": {
    "ssoUrl": "<sso-delegate de Nexus del ambiente>",
    "ssoApiKey": "<la misma key de empresa de Nexus que ya usan rcv, funerario, patrimoniales, marketplace, …>"
  }
}
```

| Ambiente | `ssoUrl` |
|----------|----------|
| QA | `https://nexusqa.exelixitech.com/nexus-api/api/auth/sso-delegate` |
| Producción | `https://nexus-api.exelixitech.com/api/auth/sso-delegate` |

- `ssoApiKey`: **la misma** key de empresa de Nexus de las demás entradas de Nexus (`rcv`, `funerario`,
  `patrimoniales`, `marketplace`, `kpi-comparativo`, `expediente-digital`). No hace falta una key nueva ni se escribe
  aquí.
- No lleva `url`: la URL del cotizador la devuelve Nexus en `redirect_url`.
- Nota conocida: hoy esas keys quedan públicas en el `config.json` que descarga el navegador. Es igual para todas las
  entradas de Nexus; para `cotizador-rc` no hace falta nada distinto.

## 2. Target `cotizador-rc`

En `iframe.service.ts` la clave del módulo se traduce al target de Nexus. Para que la clave `cotizador-rc` use SSO
de Nexus (y no se trate como un iframe estático), agregarla al mapa de claves con su propio target:

```ts
const NEXUS_SSO_TARGET_BY_KEY: Record<string, string> = {
  rcv: 'ocr',
  ocr: 'ocr',
  'cotizador-rc': 'cotizador-rc',
};
```

## 3. Llamada al sso-delegate

`POST <ssoUrl>` con cabecera `x-api-key: <ssoApiKey>` y el mismo cuerpo que ya arma `buildNexusSsoDelegateBody` para
Endosos / RCV, con `target: "cotizador-rc"`:

```json
{
  "target": "cotizador-rc",
  "metadata": {
    "cusuario": "<código de usuario Sis2000>",
    "cproductor": "<productor del usuario>",
    "crol": "<rol del usuario>",
    "email": "<correo del usuario>",
    "xusuario": "<nombre del usuario>",
    "xlogin": "<login de Sys2000>",
    "centidad": "P",
    "citem": "<productor o canal>",
    "ccanalalt_in": "<canal, si aplica>",
    "cscanalalt_in": "<subcanal, si aplica>",
    "cgestor": "<gestor, si aplica>"
  }
}
```

Campos que usa el cotizador:

| Campo | Para qué |
|-------|----------|
| `cproductor` | Productor con el que se guarda la cotización y se emite la póliza. |
| `cusuario` | Usuario de Sis2000 que cotiza («Emitida por» en el registro de cotizaciones). |
| `crol`, `email` | Se guardan con la cotización (quién la hizo). |
| `xusuario`, `xlogin` | Nombre que se muestra: «Cotizando como: <nombre> · Productor <código>». Sin ellos se muestra el código de usuario. |

Importante: enviar el `cusuario` y el `cproductor` **reales** de la sesión. Hoy `buildNexusSsoDelegateBody` pone
`cusuario = 7` y `cproductor = 80080` cuando vienen vacíos: con esos valores la cotización quedaría a nombre del
usuario 7 y de La Mundial directo.

Respuesta (igual que los demás módulos):

```json
{ "success": true, "redirect_url": "https://…/cotizador-rc/?nexus_token=…", "empresa": "…", "modulo": "Cotizador RC" }
```

## 4. Abrir el iframe

Usar `redirect_url` tal cual como `src` del iframe (mismo componente `embedded-iframe` de RCV / Patrimoniales). No se
le agregan parámetros: el productor y el usuario viajan **solo** dentro del `nexus_token` firmado por Nexus. El
servidor del cotizador valida el token y de ahí toma el productor; lo que venga en la URL o en el navegador no se usa.

- El token vale para la jornada (8 horas desde que Nexus lo emite). Si vence, el cotizador pide volver a abrirlo
  desde Sys2000: basta con pulsar el botón de nuevo (se pide un token nuevo al sso-delegate).
- Cada vez que se pulsa el botón hay que pedir un `redirect_url` nuevo (no reutilizar uno guardado).

## 5. Landing pública de La Mundial (sin SSO)

La landing enlaza el cotizador público **sin** `nexus_token`. Sin token el cotizador funciona como hasta ahora:

- Muestra «Cotización web».
- Cotiza y cobra con el productor de La Mundial directo (80080, canal web).
- «Ya tengo un código» (pagar una cotización guardada) sigue siendo público: la póliza se emite con el productor y el
  usuario con que se guardó esa cotización (si la hizo un intermediario desde Sys2000, sale a su nombre).

## 6. Qué ve el usuario

| Entrada | Etiqueta en la cabecera | Productor de la cotización y de la póliza |
|---------|-------------------------|-------------------------------------------|
| Botón de Sys2000 (token válido) | «Cotizando como: <nombre> · Productor <código>» | El `cproductor` del token |
| Landing pública (sin token) | «Cotización web» | 80080 (La Mundial directo) |
| Token vencido o inválido | Aviso: «vuelve a abrir el cotizador desde Sys2000» | No guarda ni emite hasta volver a entrar |
