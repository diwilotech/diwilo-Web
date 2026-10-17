# Diwilo Web Admin — guía rápida

Responde en español. Modo económico: sin capturas salvo que se pidan; de las pruebas mostrar solo el resumen.

## Qué es
diwilo.com + panel `/admin`. Worker en `worker/src/`, frontend en `public/`. Repo diwilotech/diwilo-Web (Workers Builds publica al hacer push a `main`).

## Mapa
- `worker/src/index.js` rutas; `worker.js` entrada (cron, `/validar`).
- `worker/src/modulos.js` gestión de módulos de las apps (catálogo, planes, sincronización por hash, bitácora). UI: `public/admin/tabs/modulos.*` (se monta dentro de Negocios como vistas Planes/Módulos/Bitácora) y sección `#bizMods` en `negocios.js`. Precios y días de prueba: por app (`platform_price_<app>`, `platform_trial_<app>`) en el modal «Precios y pruebas» de Negocios; cada negocio puede tener un plan con otro precio.
- `worker/src/central.js` puente a Diwilo Modulos (binding `MODULOS`): Marketing/Finanzas del propio Diwilo (`diwilo:diwilo`), tarjetas `/c/<slug>` y `/admin/api/cards`, leads y pagos → central. Org `<key>:<id>` de una app → app central `cd<key>`.
- `worker/src/embed.js` + `public/admin/embed/` (diwilo.css, app.js, crud.js copiados de las apps): las pestañas Finanzas y Marketing del panel muestran en un iframe `/admin/m/<modulo>?org=…` la MISMA página que ven las apps (viene de Diwilo Modulos `/m/*`); su API `/api/finanzas|marketing/*` usa la cookie `dwl_org` y exige Cloudflare Access. Tarjetas, Leads y Links ya son vistas de Marketing. Si cambia `diwilo.css/app.js/crud.js` en las apps, copiarlos aquí.
- Panel `/admin`: usa el shell común de las apps (`public/admin/shell.js` + `admin/embed/diwilo.css` + Bootstrap/Bootstrap Icons, temas y modo claro/oscuro en `localStorage dw_tema`). `core.js` solo carga las pestañas; `admin.css` son estilos heredados ligados a las variables del tema. Tema/modo por persona en `admin_prefs` (`access.js`, `/admin/api/prefs`). Prueba de humo: `cd tools/smoke-panel && npm i && npm test` → «Todo bien». Pendientes en `MIGRACION-PENDIENTE.md`.
- `assistant.js` herramientas IA (usa `ctool`/`centralSummary`).
- `hubs.js` solo para `hubOrgs`; `billing.js` y `card.js` ya no se usan. Las tablas viejas del hub quedan como respaldo.

## Reglas
- Publicar Diwilo después de las apps y de Diwilo Modulos.
- Workers AI tiene cuota gratis compartida: evitar pruebas que gasten IA.
- Push/publicar solo con confirmación del usuario.
