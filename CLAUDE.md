# Diwilo Web Admin — guía rápida

Responde en español. Modo económico: sin capturas salvo que se pidan; de las pruebas mostrar solo el resumen.

## Qué es
diwilo.com + panel `/admin`. Worker en `worker/src/`, frontend en `public/`. Repo diwilotech/diwilo-Web (Workers Builds publica al hacer push a `main`).

## Mapa
- `worker/src/index.js` rutas; `worker.js` entrada (cron, `/validar`).
- `worker/src/modulos.js` gestión de módulos de las apps (catálogo, planes, sincronización por hash, bitácora). UI: `public/admin/tabs/modulos.*` y sección `#bizMods` en `negocios.js`.
- `worker/src/central.js` puente a Diwilo Modulos (binding `MODULOS`): Marketing/Finanzas del propio Diwilo (`diwilo:diwilo`), tarjetas `/c/<slug>` y `/admin/api/cards`, leads y pagos → central. Org `<key>:<id>` de una app → app central `cd<key>`.
- `assistant.js` herramientas IA (usa `ctool`/`centralSummary`).
- `hubs.js` solo para `hubOrgs`; `billing.js` y `card.js` ya no se usan. Las tablas viejas del hub quedan como respaldo.

## Reglas
- Publicar Diwilo después de las apps y de Diwilo Modulos.
- Workers AI tiene cuota gratis compartida: evitar pruebas que gasten IA.
- Push/publicar solo con confirmación del usuario.
