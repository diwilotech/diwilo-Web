# Migración del panel /admin al shell común de las apps CD

Estado (2026-10-16): hecha. Falta solo lo marcado «Pendiente».

## Hecho
- `admin.html` usa `#dw-shell` (barra superior, lateral, inferior con «Más», campana), Bootstrap 5.3 + Bootstrap Icons y `admin/embed/diwilo.css` (`public/admin/shell.js`).
- Pestañas con componentes Bootstrap/`dw-*` (botones, formularios, tablas, tarjetas, badges). `admin.css` quedó solo con piezas propias (gráficas, tarjetas visuales, editor del blog, agentes, progreso de IA) ligadas a las variables del tema.
- Íconos Phosphor → Bootstrap Icons (sin CSS de Phosphor).
- Avisos con toast de Bootstrap; `Admin.ask/sure` y los formularios en ventana usan `<dialog class="ask">` con el aspecto de los modales de Bootstrap.
- Gráficas, progreso de IA y colores fijos pasaron a variables del tema (claro/oscuro).
- Login con el diseño de `diwilo-login.css` (`admin/login.css`); el acceso real sigue siendo Cloudflare Access.
- Tema y modo por persona del equipo: tabla `admin_prefs` (`access.js`), `GET /admin/api/me` los devuelve y `POST /admin/api/prefs` los guarda.
- Campana: leads nuevos y negocios vencidos o por vencer, los mismos números del menú.
- `embed/diwilo.css` y `embed/app.js` al día con la Academia.
- Prueba de humo: `cd tools/smoke-panel && npm i && npm test` → «Todo bien» (shell, 7 pestañas, claro/oscuro, celular/escritorio, tema, campana, sin Phosphor).

## Pendiente
1. Publicar: no se hizo push ni deploy (requiere confirmación). Orden: apps → Diwilo Modulos → Diwilo. Tras publicar, mirar `diwilo.com/admin` con Access: la prueba de humo usa datos de mentira.
2. Revisión visual con datos reales de cada pestaña (Negocios, Módulos, Blog, IA): hay HTML generado con estilos en línea que solo se ve con datos.
3. El sitio público (`src/pages`, `tools/build.py`, `public/assets/css/styles.css`) no se migró a propósito: es la web de marketing, no una app con shell.
