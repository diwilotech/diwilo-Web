/**
 * Entrada del Worker "diwilo" (diwilo.com). Antes era un proyecto Pages con functions/;
 * ahora un solo Worker con archivos estáticos (public/ vía env.ASSETS):
 *   - Páginas del sitio: HTML o Markdown según la cabecera Accept (markdown.js)
 *   - /api, /admin/api, /v1, /l, /c y /mcp: lógica dinámica (index.js)
 *   - /blog: índice, artículos, RSS y sitemap del blog (blog.js)
 *   - /validar/:código: validación pública de cuentas de cobro (central.js)
 *   - Todo lo demás: archivo estático de public/ (con sus cabeceras de public/_headers)
 */
import app from './index.js';
import { negotiate } from './markdown.js';
import { blogPublic } from './blog.js';
import { publicValidate } from './central.js';
import { purgeArchived } from './platform.js';
import { runModulosDaily } from './modulos.js';
import { runAgentesDiwilo } from './propias.js';
import { callAI } from './index.js';

const PAGES = {
  '/': '/index.md',
  '/contacto': '/contacto.md',
  '/servicios': '/servicios.md',
  '/apps': '/apps.md',
  '/arquitectura': '/arquitectura.md',
  '/privacidad': '/privacidad.md',
  '/docs/api': '/docs/api.md',
};
const DYNAMIC = ['/api/', '/admin/api/', '/admin/m/', '/v1/', '/l/', '/c/', '/wa/', '/google/'];

export default {
  async fetch(req, env, ctx) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/blog' || path === '/blog.md' || path.startsWith('/blog/')) return blogPublic(req, env, ctx);
    // Validación pública de cuentas de cobro (QR del documento)
    if (path.startsWith('/validar/')) return publicValidate(req, env);
    if (PAGES[path]) return negotiate({ request: req, env, next: () => env.ASSETS.fetch(req) }, PAGES[path]);
    if (path === '/mcp' || DYNAMIC.some((p) => (path + '/').startsWith(p))) return app.fetch(req, env, ctx);
    return env.ASSETS.fetch(req);
  },

  // Cron diario (wrangler.jsonc → triggers): las apps borran por lotes los negocios archivados hace más de 20 días.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(purgeArchived(env));
    // Módulos: reenvía a los negocios cuya lista cambió (fechas que empiezan o terminan, envíos que fallaron, módulos nuevos)
    ctx.waitUntil(runModulosDaily(env));
    // Gastos recurrentes y automatizaciones de Marketing y Finanzas: los corre Diwilo Modulos (su propio cron).
    // Agentes de Diwilo del módulo IA (blog, videos…): diarios todos los días, semanales los lunes. Sus herramientas propias viven aquí.
    ctx.waitUntil(runAgentesDiwilo(env, callAI));
  },
};
