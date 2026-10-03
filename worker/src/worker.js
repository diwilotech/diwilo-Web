/**
 * Entrada del Worker "diwilo" (diwilo.com). Antes era un proyecto Pages con functions/;
 * ahora un solo Worker con archivos estáticos (public/ vía env.ASSETS):
 *   - Páginas del sitio: HTML o Markdown según la cabecera Accept (markdown.js)
 *   - /api, /admin/api, /v1, /l, /c y /mcp: lógica dinámica (index.js)
 *   - Todo lo demás: archivo estático de public/ (con sus cabeceras de public/_headers)
 */
import app from './index.js';
import { negotiate } from './markdown.js';

const PAGES = {
  '/': '/index.md',
  '/contacto': '/contacto.md',
  '/servicios': '/servicios.md',
  '/arquitectura': '/arquitectura.md',
  '/privacidad': '/privacidad.md',
  '/docs/api': '/docs/api.md',
};
const DYNAMIC = ['/api/', '/admin/api/', '/v1/', '/l/', '/c/'];

export default {
  async fetch(req, env, ctx) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    if (PAGES[path]) return negotiate({ request: req, env, next: () => env.ASSETS.fetch(req) }, PAGES[path]);
    if (path === '/mcp' || DYNAMIC.some((p) => (path + '/').startsWith(p))) return app.fetch(req, env, ctx);
    return env.ASSETS.fetch(req);
  },
};
