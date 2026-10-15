/**
 * Marketing y Finanzas de Diwilo viven en el Worker central «Diwilo Modulos» (service binding MODULOS, RPC), los mismos
 * módulos que usan las apps. Diwilo es un negocio más («diwilo»); cada negocio de una app es «<app>:<id>» en el panel y
 * «cd<app>:<id>» en el módulo central (el id de la app), así que desde el panel se ven y editan los mismos datos que el negocio ve en su app.
 *
 *   /admin/api/hub/:org/…   la API que usan las pantallas del panel (hub.js, marketing.js, finanzas.js), traducida al módulo central
 *   /admin/api/cards        tarjetas de Diwilo (Marketing → Tarjetas)          /c/…  y  /validar/…   páginas públicas en diwilo.com
 *   ctool()                 herramientas de IA del módulo central (las usa IA Diwilo)
 *   centralLead…/centralPayment   leads del formulario del sitio y pagos de suscripciones → Marketing y Finanzas de Diwilo
 */
import { APPS } from './platform.js';
import { hubOrgs } from './hubs.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const ORG_RE = /^(diwilo|[a-z]+:[A-Za-z0-9_-]{1,64})$/;
const MK = new Set(['contacts', 'deals', 'campaigns', 'spend', 'tasks', 'automations', 'lists', 'list_items', 'tools', 'cards', 'links']);
const FIN = new Set(['movements', 'invoices', 'recurring', 'cost_centers', 'accounts', 'budgets']);
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

class CentralError extends Error { constructor(status, message) { super(message); this.status = status; } }
const need = (env) => { if (!env.MODULOS) throw new CentralError(503, 'Falta la conexión con Diwilo Modulos (service binding MODULOS)'); return env.MODULOS; };

// Contexto de una organización para el módulo central: el equipo de Diwilo entra como propietario.
export async function ctxFor(env, org, email) {
  if (!ORG_RE.test(org || '')) throw new CentralError(400, 'Organización no válida');
  if (org === 'diwilo') return { app: 'diwilo', business: { id: 'diwilo', name: 'Diwilo', tema: 'violeta' }, role: 'owner', readOnly: false,
    user: { id: `diwilo:${email || 'sistema'}`, email: email || null, name: null }, origin: env.SITE_URL || 'https://diwilo.com', via: 'app', modulos: ['finanzas', 'marketing'] };
  const [app, id] = org.split(':');
  if (!APPS[app]) throw new CentralError(404, 'App no encontrada');
  const name = (await env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first().catch(() => null))?.name || null;
  // En Diwilo Modulos cada app se identifica por su Worker (cdacademia, cdcitas…), igual que en su modulos.app.json
  return { app: `cd${app}`, business: { id, name }, role: 'owner', readOnly: false, user: { id: `diwilo:${email || 'sistema'}`, email: email || null, name: null },
    origin: env[APPS[app].url] || 'https://diwilo.com', via: 'app', modulos: ['finanzas', 'marketing'] };
}

export async function ccall(env, org, email, method, path, { query = '', body } = {}) {
  const r = await need(env).call(await ctxFor(env, org, email), { method, path, query, body: body === undefined ? null : JSON.stringify(body) });
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

/* ---------------- /admin/api/hub/:org/… → módulo central ---------------- */
function target(a, b, c, d) {
  if (a === 'marketing' && b === 'summary') return '/api/marketing/summary';
  if (a === 'finance' && b === 'summary') return '/api/finanzas/summary';
  if (a === 'finance' && b === 'bank-lines') return `/api/finanzas/bank-lines${c ? `/${c}/${d || ''}`.replace(/\/$/, '') : ''}`;
  if (a === 'finance' && b === 'bank-import') return '/api/finanzas/bank-import';
  if (a === 'finance' && b === 'export') return '/api/finanzas/export';
  if (a === 'billing') return `/api/finanzas/billing/${b || ''}`;
  if (a === 'invoices' && b && c) return `/api/finanzas/invoices/${b}/${c}`;
  if (a === 'campaigns' && b && c === 'links') return `/api/marketing/campaigns/${b}/links`;
  if (a === 'lists' && b && c === 'check') return `/api/marketing/lists/${b}/check`;
  if (MK.has(a)) return `/api/marketing/${a}${b ? `/${b}` : ''}${c ? `/${c}` : ''}`;
  if (FIN.has(a)) return `/api/finanzas/${a}${b ? `/${b}` : ''}${c ? `/${c}` : ''}`;
  return null;
}

export async function hubProxy(req, env, path, url, email, callAI) {
  try {
    const parts = path.split('/').filter(Boolean).slice(3).map(decodeURIComponent); // tras /admin/api/hub
    if (parts[0] === 'orgs' && req.method === 'GET') return json(await hubOrgs(env));
    const [org, a, b, c, d] = parts;
    if (!ORG_RE.test(org || '')) return json({ error: 'Organización no válida' }, 400);
    const M = req.method;
    const body = M === 'GET' || M === 'DELETE' ? undefined : await req.json().catch(() => ({}));

    // Diwilo: los leads del formulario se sincronizan solos al abrir Clientes y leads o el Resumen.
    if (org === 'diwilo' && M === 'GET' && ((a === 'marketing' && b === 'summary') || (a === 'contacts' && !b))) await syncLeads(env, email).catch((e) => console.error('sync leads', e.message));
    if (a === 'marketing' && b === 'import-leads' && M === 'POST') { if (org !== 'diwilo') return json({ error: 'Solo para Diwilo' }, 400); return json(await importLeads(env, email, 0)); }
    if (a === 'finance' && b === 'import-payments' && M === 'POST') { if (org !== 'diwilo') return json({ error: 'Solo para Diwilo' }, 400); return json(await importPayments(env, email)); }
    if (a === 'reports') return reports(env, org, email, M, b, body, callAI);

    const p = target(a, b, c, d);
    if (!p) return json({ error: 'no encontrado' }, 404);
    const r = await ccall(env, org, email, M, p, { query: url.search, body });
    return new Response(r.body, { status: r.status, headers: { ...r.headers, 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof CentralError) return json({ error: e.message }, e.status);
    throw e;
  }
}

// Informes: Marketing y Finanzas tienen cada uno los suyos; el panel los ve juntos (id «m12» / «f3»).
async function reports(env, org, email, M, id, body, callAI) {
  if (M === 'GET' && !id) {
    const [mk, fin] = await Promise.all([cjson(env, org, email, 'GET', '/api/marketing/reports'), cjson(env, org, email, 'GET', '/api/finanzas/reports')]);
    const rows = [...mk.rows.map((r) => ({ ...r, id: `m${r.id}`, kind: 'marketing' })), ...fin.rows.map((r) => ({ ...r, id: `f${r.id}`, kind: 'finanzas' }))].sort((x, y) => y.created_at - x.created_at);
    return json({ rows });
  }
  if (M === 'DELETE' && id) {
    const m = /^([mf])(\d+)$/.exec(id); if (!m) return json({ error: 'Informe no válido' }, 400);
    await cjson(env, org, email, 'DELETE', `/api/${m[1] === 'm' ? 'marketing' : 'finanzas'}/reports/${m[2]}`);
    return json({ ok: true });
  }
  if (M === 'POST' && !id) {
    // El analista de IA de Diwilo escribe el informe con los datos del módulo y lo guarda allá
    const kind = body?.kind === 'finanzas' ? 'finanzas' : 'marketing', mod = kind === 'finanzas' ? 'finanzas' : 'marketing';
    const { instruccion, datos } = await cjson(env, org, email, 'GET', `/api/${mod}/reports/datos`);
    let content;
    try { content = await callAI(env, instruccion, [{ role: 'user', content: 'Datos (JSON):\n' + JSON.stringify(datos).slice(0, 12000) }], { source: 'informes' }); } catch { content = null; }
    if (!content) return json({ error: 'La IA no respondió. Intenta de nuevo en un momento.' }, 502);
    const title = `${kind === 'finanzas' ? 'Finanzas' : 'Marketing'} · ${new Date(Date.now() - 5 * 3600000).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const r = await cjson(env, org, email, 'POST', `/api/${mod}/reports`, { body: { title, content, origen: 'ia' } });
    return json({ id: `${kind === 'finanzas' ? 'f' : 'm'}${r.id}`, title, content }, 201);
  }
  return json({ error: 'no encontrado' }, 404);
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
async function syncLeads(env, email) {
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
async function importPayments(env, email) {
  const { results } = await env.DB.prepare('SELECT * FROM sub_payments ORDER BY ts').all();
  let n = 0;
  for (const p of results) {
    if (!(p.amount > 0)) continue;
    const r = await cjson(env, 'diwilo', email, 'POST', '/api/finanzas/movements/externo', { body: { ref: `pago:${p.id}`, kind: 'ingreso', date: new Date(p.ts - 5 * 3600000).toISOString().slice(0, 10), amount: p.amount,
      category: 'Suscripciones apps', description: `${APPS[p.app]?.name || p.app}: ${p.months} ${p.months === 1 ? 'mes' : 'meses'}${p.note ? ' · ' + p.note : ''}`.slice(0, 300), counterparty: p.business_name || null, centro_costo: APPS[p.app]?.name || p.app } });
    if (r.nuevo) n++;
  }
  return { imported: n, total: results.length };
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
export async function publicValidate(req, env) {
  const u = new URL(req.url);
  const r = await need(env).validar('diwilo', decodeURIComponent(u.pathname.split('/')[2] || ''), u.origin);
  return new Response(r.body, { status: r.status, headers: { ...r.headers, 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
}
