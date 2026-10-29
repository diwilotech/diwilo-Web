/**
 * Marketing y Finanzas de Diwilo viven en el Worker central «Diwilo Modulos» (service binding MODULOS, RPC), los mismos
 * módulos que usan las apps. Diwilo es un negocio más («diwilo»); cada negocio de una app es «<app>:<id>» en el panel y
 * «cd<app>:<id>» en el módulo central (el id de la app), así que desde el panel se ven y editan los mismos datos que el negocio ve en su app.
 *
 *   /admin/api/cards        tarjetas de Diwilo (Marketing → Tarjetas)          /c/…  y  /validar/…   páginas públicas en diwilo.com
 *   ctool()                 herramientas de IA del módulo central (las usa IA Diwilo)
 *   centralLead…/centralPayment   leads del formulario del sitio y pagos de suscripciones → Marketing y Finanzas de Diwilo
 */
import { APPS } from './platform.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const ORG_RE = /^(diwilo|[a-z]+:[A-Za-z0-9_-]{1,64})$/;
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

class CentralError extends Error { constructor(status, message) { super(message); this.status = status; } }
const need = (env) => { if (!env.MODULOS) throw new CentralError(503, 'Falta la conexión con Diwilo Modulos (service binding MODULOS)'); return env.MODULOS; };

// Contexto de una organización para el módulo central: el equipo de Diwilo entra como propietario.
export async function ctxFor(env, org, email) {
  if (!ORG_RE.test(org || '')) throw new CentralError(400, 'Organización no válida');
  if (org === 'diwilo') return { app: 'diwilo', business: { id: 'diwilo', name: 'Diwilo', tema: 'violeta' }, role: 'owner', readOnly: false,
    user: { id: `diwilo:${email || 'sistema'}`, email: email || null, name: null }, origin: env.SITE_URL || 'https://diwilo.com', via: 'app', modulos: ['finanzas', 'marketing', 'nomina', 'whatsapp'] };
  const [app, id] = org.split(':');
  if (!APPS[app]) throw new CentralError(404, 'App no encontrada');
  const name = (await env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first().catch(() => null))?.name || null;
  // En Diwilo Modulos cada app se identifica por su Worker (cdacademia, cdcitas…), igual que en su modulos.app.json
  return { app: `cd${app}`, business: { id, name }, role: 'owner', readOnly: false, user: { id: `diwilo:${email || 'sistema'}`, email: email || null, name: null },
    origin: env[APPS[app].url] || 'https://diwilo.com', via: 'app', modulos: ['finanzas', 'marketing', 'nomina', 'whatsapp'] };
}

// Personas del equipo de Diwilo con acceso al panel: titulares (ADMIN_EMAILS) y las activas de «team». Mensajes → Administrador las usa para activar el modo administrador por WhatsApp.
export async function equipoDiwilo(env) {
  const out = new Map();
  for (const e of (env.ADMIN_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)) out.set(e, { email: e, nombre: null, rol: 'owner' });
  try { for (const r of (await env.DB.prepare('SELECT email, name FROM team WHERE active = 1').all()).results || []) { const e = String(r.email || '').toLowerCase(); if (e && !out.has(e)) out.set(e, { email: e, nombre: r.name || null, rol: 'equipo' }); else if (out.has(e) && r.name) out.get(e).nombre = r.name; } } catch { /* sin tabla de equipo */ }
  return [...out.values()];
}
// Foto, video, audio o documento de un chat de Mensajes (con soporte de Range para reproducir audio y video)
export async function cmedia(env, org, email, id, rango) {
  return need(env).media(await ctxFor(env, org, email), id, rango);
}
export async function ccall(env, org, email, method, path, { query = '', body, propias } = {}) {
  const ctx = await ctxFor(env, org, email);
  if (org === 'diwilo' && path.startsWith('/api/whatsapp/admins')) ctx.equipo = await equipoDiwilo(env);
  if (propias) ctx.propias = propias;   // herramientas propias de Diwilo para el módulo IA (ver propias.js)
  const r = await need(env).call(ctx, { method, path, query, body: body === undefined ? null : JSON.stringify(body) });
  return r;
}
const parse = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };
async function cjson(env, org, email, method, path, opts) {
  const r = await ccall(env, org, email, method, path, opts);
  const d = parse(r);
  if (r.status >= 400) throw new CentralError(r.status, d.error || `Diwilo Modulos respondió ${r.status}`);
  return d;
}

// Herramienta de IA del módulo central (para IA Diwilo): lanza el error con el mensaje del módulo.
export async function ctool(env, org, email, name, args = {}) {
  const { org: _o, ...rest } = args || {};
  const r = await need(env).tool(await ctxFor(env, org, email), name, rest);
  if (!r.ok) throw new Error(r.error || 'No se pudo');
  return r.result;
}
export const centralSummary = (env, org, email, kind, params = {}) =>
  cjson(env, org, email, 'GET', kind === 'finanzas' ? '/api/finanzas/summary' : '/api/marketing/summary', { query: new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString() });

// La marca de Diwilo (módulo Marca) para el panel: logo, nombre y lema. Cualquier persona del equipo la ve (pantalla de bienvenida y barra superior).
export async function brandApi(env, email) {
  const leer = async (p) => { try { const r = await ccall(env, 'diwilo', email, 'GET', p); return r.status < 300 ? parse(r) : {}; } catch { return {}; } };
  const [g, l] = await Promise.all([leer('/api/marca'), leer('/api/marca/logo')]);
  return json({ nombre: g.negocio?.nombre || 'Diwilo', lema: g.marca?.lema || '', logo: l.data_url || null });
}

/* ---------------- leads del sitio y pagos de suscripciones ---------------- */
const LEAD_STAGE = (s) => (s === 'ganado' ? 'cliente' : s === 'perdido' ? 'perdido' : 'lead');
const leadBody = (l) => ({ ref: `lead:${l.id}`, name: l.name || l.email || 'Lead', email: l.email || null, phone: l.phone || null, stage: LEAD_STAGE(l.status),
  source: l.utm_source ? `Sitio web · ${l.utm_source}` : 'Sitio web', utm_campaign: l.utm_campaign || null, notes: [l.topics, l.message].filter(Boolean).join(' — ').slice(0, 2000) || null, fecha: l.ts });

export async function centralLeadCreated(env, lead) {
  try { await cjson(env, 'diwilo', 'sistema', 'POST', '/api/marketing/contacts/externo', { body: leadBody({ ...lead, status: 'nuevo' }) }); }
  catch (e) { console.error('lead → marketing', e.message); }
}
export async function centralLeadStatus(env, leadId, status) {
  try { await cjson(env, 'diwilo', 'sistema', 'PATCH', '/api/marketing/contacts/externo', { body: { ref: `lead:${leadId}`, stage: LEAD_STAGE(status) } }); }
  catch (e) { console.error('lead estado → marketing', e.message); }
}
async function importLeads(env, email, afterId = 0) {
  const { results } = await env.DB.prepare('SELECT * FROM leads WHERE id > ? ORDER BY id').bind(afterId).all();
  let n = 0;
  for (const l of results) if ((await cjson(env, 'diwilo', email, 'POST', '/api/marketing/contacts/externo', { body: leadBody(l) })).nuevo) n++;
  return { imported: n, total: results.length };
}
export async function syncLeads(env, email) {
  const last = Number((await env.DB.prepare("SELECT value FROM settings WHERE key = 'central_leads_last'").first())?.value || 0);
  const max = (await env.DB.prepare('SELECT MAX(id) n FROM leads').first())?.n || 0;
  if (max <= last) return;
  await importLeads(env, email, last);
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('central_leads_last', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(max)).run();
}
// Pago de una suscripción → ingreso de Diwilo en el centro de costo de la app (sin duplicar: ref «pago:<id>»).
export async function centralPayment(env, p) {
  try {
    if (!(p.amount > 0)) return;
    await cjson(env, 'diwilo', 'sistema', 'POST', '/api/finanzas/movements/externo', { body: { ref: `pago:${p.id}`, kind: 'ingreso', date: p.date || today(), amount: p.amount, category: 'Suscripciones apps',
      description: `${APPS[p.app]?.name || p.app}: ${p.months} ${p.months === 1 ? 'mes' : 'meses'}${p.note ? ' · ' + p.note : ''}`.slice(0, 300), counterparty: p.business_name || null, centro_costo: APPS[p.app]?.name || p.app } });
  } catch (e) { console.error('pago → finanzas', e.message); }
}
/* ---------------- tarjetas y validación pública en diwilo.com ---------------- */
// /admin/api/cards (pantalla Marketing → Tarjetas del panel): lista, guardar (con foto e íconos) y borrar.
export async function cardsApi(req, env, url, email) {
  try {
    const M = req.method, id = Number(url.searchParams.get('id') || 0);
    if (M === 'GET') {
      const { rows } = await cjson(env, 'diwilo', email, 'GET', '/api/marketing/cards');
      return json(rows.map((r) => ({ ...r, photo_url: null })));
    }
    if (M === 'DELETE') { await cjson(env, 'diwilo', email, 'DELETE', `/api/marketing/cards/${id}`); return json({ ok: true }); }
    if (M === 'POST') {
      const b = await req.json().catch(() => ({}));
      const fields = Object.fromEntries(['slug', 'name', 'role', 'company', 'bio', 'phone', 'whatsapp', 'email', 'website', 'instagram', 'linkedin', 'accent'].filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
      const cid = b.id ? (await cjson(env, 'diwilo', email, 'PATCH', `/api/marketing/cards/${Number(b.id)}`, { body: fields }), Number(b.id))
        : (await cjson(env, 'diwilo', email, 'POST', '/api/marketing/cards', { body: fields })).id;
      const foto = Object.fromEntries(['photo_data', 'icon_192', 'icon_512'].filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
      if (Object.keys(foto).length) await cjson(env, 'diwilo', email, 'PUT', `/api/marketing/cards/${cid}/foto`, { body: foto });
      const row = (await cjson(env, 'diwilo', email, 'GET', '/api/marketing/cards')).rows.find((r) => r.id === cid);
      return json({ id: cid, slug: row?.slug });
    }
    return json({ error: 'no encontrado' }, 404);
  } catch (e) {
    if (e instanceof CentralError) return json({ error: e.message }, e.status);
    throw e;
  }
}
// /c/… y /validar/… de diwilo.com
export async function publicCard(req, env, rest) {
  const origin = new URL(req.url).origin;
  const r = await need(env).tarjeta('diwilo', rest, origin, { bot: /bot|crawl|spider|preview/i.test(req.headers.get('user-agent') || '') });
  const body = r.base64 ? Uint8Array.from(atob(r.body), (ch) => ch.charCodeAt(0)) : r.body;
  // Sin ícono propio: el de Diwilo
  const headers = { ...r.headers };
  if (r.status === 302 && headers.location?.includes('/icons/icon-')) headers.location = headers.location.replace(/\/icons\/icon-(\d+)\.png$/, '/assets/img/icon-$1.png');
  return new Response(r.status === 302 ? null : body, { status: r.status, headers });
}
// Webhook de WhatsApp de Diwilo (/wa/<código>): verificación de Meta (GET) y mensajes entrantes (POST). Solo bandejas del negocio «diwilo».
export async function publicWhatsapp(req, env, ctx, slug) {
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const m = need(env);
  if ((await m.whatsappNegocio('diwilo', slug)) !== 'diwilo') return new Response('No encontrado', { status: 404 });
  const url = new URL(req.url);
  const r = await m.whatsapp('diwilo', slug, { method: req.method, query: url.search, body: req.method === 'POST' ? (await req.text()).slice(0, 1000000) : null, sig: req.headers.get('x-hub-signature-256') });
  return new Response(r.body, { status: r.status, headers: r.headers });
}
export async function publicValidate(req, env) {
  const u = new URL(req.url);
  const r = await need(env).validar('diwilo', decodeURIComponent(u.pathname.split('/')[2] || ''), u.origin);
  return new Response(r.body, { status: r.status, headers: { ...r.headers, 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
}
