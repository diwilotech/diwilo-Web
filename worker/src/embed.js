/**
 * Páginas de los módulos centrales (Finanzas, Marketing e IA de «Diwilo Modulos») dentro del panel /admin.
 * Son las mismas que ven los negocios en sus apps (Bootstrap + diwilo.css), así el panel y las apps se ven igual.
 *
 *   /admin/m/<modulo>?org=…   la página: <main> del módulo + diwilo.css/app.js/crud.js + datos de «me» incrustados
 *   /admin/m/<modulo>.js      el código de la página (viene del Worker central)
 *   /api/finanzas|marketing/… la API que esas páginas llaman; la organización activa va en la cookie dwl_org
 *
 * Todo exige Cloudflare Access (adminEmail). Las escrituras llevan x-app: 1 (CSRF), igual que en las apps.
 */
import { ccall, ctxFor, syncLeads } from './central.js';
import { propiasDiwilo } from './propias.js';

const ORG_RE = /^(diwilo|[a-z]+:[A-Za-z0-9_-]{1,64})$/;
const MODULOS = { finanzas: 'Finanzas', marketing: 'Marketing', nomina: 'Nómina', ai: 'IA', marca: 'Marca' };
const ICONOS = { finanzas: 'bi-pie-chart', marketing: 'bi-megaphone', nomina: 'bi-people-fill', ai: 'bi-robot', marca: 'bi-palette' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = (body, status, type = 'text/plain; charset=utf-8', extra = {}) => new Response(body, { status, headers: { 'content-type': type, 'cache-control': 'no-store', ...extra } });
const cookieOrg = (req) => /(?:^|;\s*)dwl_org=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];

export async function embedPage(req, env, url, email) {
  const m = /^\/admin\/m\/(finanzas|marketing|nomina|ai|marca)(\.js)?$/.exec(url.pathname);
  if (!m) return text('No encontrado', 404);
  if (!env.MODULOS) return text('Falta la conexión con Diwilo Modulos (service binding MODULOS)', 503);
  const [, id, js] = m;
  if (js) {
    const a = await env.MODULOS.asset(`/m/${id}.js`);
    return text(a.body, a.status, a.type || 'text/javascript; charset=utf-8', { 'cache-control': 'no-cache' });
  }
  const org = decodeURIComponent(url.searchParams.get('org') || cookieOrg(req) || 'diwilo');
  if (!ORG_RE.test(org)) return text('Organización no válida', 400);
  const [ctx, main, code] = await Promise.all([ctxFor(env, org, email), env.MODULOS.asset(`/m/${id}.html`), env.MODULOS.asset(`/m/${id}.js`)]);
  // La versión del código va en la dirección del script: así ningún caché (navegador o borde) sirve una página vieja tras publicar el módulo
  const ver = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(code.body || '')))).slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (main.status !== 200) return text('Página no encontrada', 404);
  const me = {
    app: { id: ctx.app, nombre: 'Diwilo' }, user: ctx.user, role: 'owner',
    business: { id: ctx.business.id, name: ctx.business.name || 'Diwilo', readOnly: false },
    settings: { tema: ctx.business.tema || 'violeta', modo: 'light', logo: null },
    modules: Object.entries(MODULOS).map(([k, nombre], orden) => ({ id: k, nombre, icono: ICONOS[k], orden, widgets: [], configurar: 'admin' })), businesses: [],
  };
  const html = `<!doctype html>
<html lang="es" data-dw-tema="${esc(me.settings.tema)}" data-bs-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<script>try{var t=JSON.parse(localStorage.getItem('dw_tema')||'{}');if(t.tema)document.documentElement.setAttribute('data-dw-tema',t.tema);document.documentElement.setAttribute('data-bs-theme',t.modo||'light')}catch(e){}</script>
<title>${esc(MODULOS[id])} · Diwilo</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
<link href="/admin/embed/diwilo.css" rel="stylesheet">
<link href="/admin/embed/embed.css" rel="stylesheet">
</head>
<body class="dw dw-embed">
<!-- Módulo «${id}» de Diwilo Modulos (Worker central) -->
${main.body.trim()}
<script>window.__DW_ME__=${JSON.stringify(me).replace(/</g, '\\u003c')}</script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="/admin/embed/app.js"></script>
<script src="/admin/embed/crud.js"></script>
<script src="/admin/embed/embed.js"></script>
<script src="/admin/m/${id}.js?v=${ver}"></script>
</body>
</html>`;
  return text(html, 200, 'text/html; charset=utf-8', {
    'x-frame-options': 'SAMEORIGIN', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'same-origin',
    'set-cookie': `dwl_org=${encodeURIComponent(org)}; Path=/; Secure; SameSite=Strict`,
  });
}

// API que llaman las páginas: la misma ruta que en las apps (/api/finanzas/…), hacia la organización de la cookie.
export async function embedApi(req, env, url, email, callAI) {
  const M = req.method;
  if (M !== 'GET' && M !== 'HEAD' && req.headers.get('x-app') !== '1') return text(JSON.stringify({ error: 'Falta la cabecera x-app' }), 403, 'application/json; charset=utf-8');
  const org = decodeURIComponent(cookieOrg(req) || 'diwilo');
  if (!ORG_RE.test(org)) return text(JSON.stringify({ error: 'Organización no válida' }), 400, 'application/json; charset=utf-8');
  if (!env.MODULOS) return text(JSON.stringify({ error: 'Falta la conexión con Diwilo Modulos' }), 503, 'application/json; charset=utf-8');
  // Diwilo: los leads del formulario del sitio se sincronizan solos al abrir Clientes y leads o el Resumen.
  if (org === 'diwilo' && M === 'GET' && /^\/api\/marketing\/(summary|contacts)$/.test(url.pathname)) await syncLeads(env, email).catch((e) => console.error('sync leads', e.message));
  const raw = M === 'GET' || M === 'HEAD' ? '' : await req.text();
  let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { return text(JSON.stringify({ error: 'JSON no válido' }), 400, 'application/json; charset=utf-8'); }
  const r = await ccall(env, org, email, M, url.pathname, { query: url.search, body, propias: org === 'diwilo' && callAI && url.pathname.startsWith('/api/ai/') ? propiasDiwilo(env, email, callAI) : undefined });
  return new Response(r.body, { status: r.status, headers: { ...r.headers, 'cache-control': 'no-store' } });
}
