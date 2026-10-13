/**
 * Marketing Hub y Finance Hub: módulos horizontales del panel (/admin → Marketing y Finanzas).
 * Funcionan por organización: 'diwilo' (la operación de Diwilo) o '<app>:<id del negocio>' (cada negocio
 * de las apps). El negocio sigue viviendo en su app; aquí solo se guardan sus datos de marketing y finanzas.
 * Tablas en worker/hubs.sql.
 *
 *   GET    /admin/api/hub/orgs                                  organizaciones (Diwilo + negocios de cada app)
 *   GET    /admin/api/hub/:org/:entity?q=&limit=                 listar   (entity: ver ENTITIES)
 *   POST   /admin/api/hub/:org/:entity                           crear
 *   PATCH  /admin/api/hub/:org/:entity/:id                       editar
 *   DELETE /admin/api/hub/:org/:entity/:id                       borrar
 *   GET    /admin/api/hub/:org/marketing/summary?from=&to=       contactos, embudo, campañas (gasto, CPL, ROI), tareas
 *   POST   /admin/api/hub/:org/marketing/import-leads            (solo diwilo) trae los leads del formulario del sitio
 *          (además se sincronizan solos al abrir Clientes y leads o el Resumen de Diwilo)
 *   GET    /admin/api/hub/:org/campaigns/:id/links               links de rastreo de la campaña (por su utm_campaign)
 *   POST   /admin/api/hub/:org/campaigns/:id/links               { platform, target } crea el link de una plataforma (UTM automáticos)
 *   GET    /admin/api/hub/:org/finance/summary?month=YYYY-MM     ingresos, gastos, presupuesto vs real, cartera, flujo de caja
 *   POST   /admin/api/hub/:org/finance/import-payments           (solo diwilo) trae los pagos de suscripciones de Negocios
 *   POST   /admin/api/hub/:org/invoices/:id/pay                  { date, amount, account_id } registra el pago de una factura
 *   GET    /admin/api/hub/:org/finance/bank-lines?account_id=    extracto importado (pendientes y conciliadas)
 *   POST   /admin/api/hub/:org/finance/bank-import               { account_id, lines: [{ date, description, amount, ref }] }
 *   POST   /admin/api/hub/:org/finance/bank-lines/:id/match      { movement_id } | { create: { category, cost_center_id } }
 *   GET    /admin/api/hub/:org/finance/export?kind=movements|invoices&from=&to=   CSV para el contador
 *   POST   /admin/api/hub/:org/reports                           { kind: marketing|finanzas } informe escrito por el agente de IA
 *   POST   /admin/api/hub/:org/lists/:id/check                   revisa los sitios/feeds de una lista (p. ej. blogs de competidores)
 * runHubsDaily(env, callAI) lo corre el cron: gastos recurrentes que vencen y automatizaciones.
 */
import { APPS, listAppBusinesses } from './platform.js';
import { readFeed } from './web.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
class HubError extends Error { constructor(status, message) { super(message); this.status = status; } }
const now = () => Date.now();
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); // Colombia (UTC-5)
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1 + n, 1));
  f.setUTCDate(Math.min(d, new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate()));
  return f.toISOString().slice(0, 10);
}
const DIWILO = 'diwilo';
const ORG_RE = /^(diwilo|[a-z]+:[A-Za-z0-9_-]{1,64})$/;

/* ---------------- entidades (CRUD genérico) ---------------- */
// Tipos: text | long | email | url | date | month | money | int | bool (bool+ = sí por defecto) | ['opción', ...]   (! = obligatorio)
const STAGES_CONTACT = ['lead', 'cliente', 'perdido'];
const STAGES_DEAL = ['nuevo', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido'];
export const ENTITIES = {
  contacts: { table: 'mk_contacts', search: ['name', 'email', 'company', 'phone'], order: 'updated_at DESC',
    fields: { name: 'text!', email: 'email', phone: 'text', company: 'text', stage: STAGES_CONTACT, source: 'text', campaign_id: 'int', owner: 'text', tags: 'text', notes: 'long', last_contact_at: 'date' } },
  deals: { table: 'mk_deals', search: ['title', 'notes'], order: 'updated_at DESC',
    fields: { title: 'text!', contact_id: 'int', campaign_id: 'int', value: 'money', stage: STAGES_DEAL, expected_close: 'date', notes: 'long' } },
  campaigns: { table: 'mk_campaigns', search: ['name', 'utm_campaign'], order: "CASE status WHEN 'activa' THEN 0 WHEN 'pausada' THEN 1 ELSE 2 END, start_date DESC",
    fields: { name: 'text!', channel: ['meta_ads', 'google_ads', 'whatsapp', 'correo', 'organico', 'otro'], status: ['activa', 'pausada', 'terminada'], start_date: 'date', end_date: 'date', budget: 'money', goal_leads: 'int', utm_campaign: 'text', notes: 'long' } },
  spend: { table: 'mk_spend', search: ['note'], order: 'date DESC',
    fields: { campaign_id: 'int!', date: 'date!', amount: 'money!', leads: 'int', clicks: 'int', impressions: 'int', note: 'text' } },
  tasks: { table: 'mk_tasks', search: ['title', 'notes', 'assignee'], order: 'done, COALESCE(due_date, \'9999\'), created_at DESC',
    fields: { title: 'text!', due_date: 'date', done: 'bool', contact_id: 'int', deal_id: 'int', assignee: 'text', notes: 'long', source: ['manual', 'plantilla'] } },
  automations: { table: 'mk_automations', search: ['name'], order: 'created_at DESC',
    fields: { name: 'text!', trigger: ['lead_nuevo', 'sin_contacto', 'presupuesto_campana', 'factura_vencida', 'semanal'], action: ['crear_tarea', 'crear_oportunidad', 'informe_ia'], days: 'int', percent: 'int', task_title: 'long', active: 'bool+' } },
  tools: { table: 'org_tools', search: ['name', 'vendor', 'account_email'], order: "CASE status WHEN 'cancelada' THEN 1 ELSE 0 END, name",
    fields: { name: 'text!', category: ['marketing', 'crm', 'infraestructura', 'software', 'api', 'ia', 'otro'], vendor: 'text', plan: 'text', cost: 'money', cycle: ['mensual', 'anual', 'por uso'], renews_on: 'date', url: 'url', account_email: 'email', status: ['activa', 'prueba', 'cancelada'], cost_center_id: 'int', notes: 'long' } },
  reports: { table: 'hub_reports', search: ['title', 'content'], order: 'created_at DESC', readOnly: true, fields: {} },
  // Listas que los agentes vigilan y completan (competidores, fuentes, temas, tendencias, prospectos…)
  lists: { table: 'mk_lists', search: ['name', 'description'], order: 'name',
    fields: { name: 'text!', kind: ['competidores', 'fuentes', 'temas', 'tendencias', 'prospectos', 'otra'], description: 'long' } },
  list_items: { table: 'mk_list_items', search: ['title', 'url', 'notes'], order: "CASE status WHEN 'descartado' THEN 1 ELSE 0 END, updated_at DESC",
    fields: { list_id: 'int!', title: 'text!', url: 'url', feed_url: 'url', notes: 'long', status: ['activo', 'revisado', 'descartado'], score: 'int' } },
  cost_centers: { table: 'fin_cost_centers', search: ['name', 'code'], order: 'active DESC, kind, name',
    fields: { name: 'text!', kind: ['app', 'cliente', 'proyecto', 'departamento'], code: 'text', active: 'bool+', notes: 'long' } },
  accounts: { table: 'fin_accounts', search: ['name', 'bank'], order: 'name',
    fields: { name: 'text!', kind: ['banco', 'efectivo', 'tarjeta', 'billetera'], bank: 'text', last4: 'text', opening_balance: 'money' } },
  invoices: { table: 'fin_invoices', search: ['number', 'counterparty', 'tax_id'], order: 'issue_date DESC, id DESC',
    fields: { kind: ['emitida', 'recibida'], number: 'text', counterparty: 'text!', tax_id: 'text', issue_date: 'date!', due_date: 'date', subtotal: 'money', tax: 'money', total: 'money', status: ['pendiente', 'pagada', 'anulada'], cost_center_id: 'int', category: 'text', notes: 'long' } },
  movements: { table: 'fin_movements', search: ['description', 'counterparty', 'category'], order: 'date DESC, id DESC',
    fields: { kind: ['ingreso', 'gasto'], date: 'date!', currency: ['COP', 'USD'], amount_usd: 'usd', amount: 'money!', fx_rate: 'num', category: 'text', description: 'text', counterparty: 'text', cost_center_id: 'int', account_id: 'int', invoice_id: 'int', reconciled: 'bool' } },
  recurring: { table: 'fin_recurring', search: ['name', 'vendor'], order: 'active DESC, next_date',
    fields: { name: 'text!', vendor: 'text', category: ['infraestructura', 'software', 'api', 'ia', 'marketing', 'otro'], currency: ['COP', 'USD'], amount_usd: 'usd', amount: 'money!', fx_rate: 'num', cycle: ['mensual', 'anual'], next_date: 'date!', cost_center_id: 'int', account_id: 'int', active: 'bool+', notes: 'long' } },
  budgets: { table: 'fin_budgets', search: ['category'], order: 'month DESC, id DESC',
    fields: { month: 'month!', cost_center_id: 'int', category: 'text', amount: 'money!' } },
};

function cast(key, type, v) {
  if (Array.isArray(type)) {
    if (v === null || v === undefined || v === '') return type[0];
    if (!type.includes(v)) throw new HubError(400, `Valor no válido para ${key}`);
    return v;
  }
  const t = type.replace(/[!+]$/, '');
  if (v === null || v === undefined || v === '') {
    if (type.endsWith('!')) throw new HubError(400, `Falta ${key}`);
    return t === 'bool' ? (type.endsWith('+') ? 1 : 0) : null;
  }
  switch (t) {
    case 'text': return String(v).trim().slice(0, 300);
    case 'long': return String(v).trim().slice(0, 5000);
    case 'email': { const s = String(v).trim().toLowerCase().slice(0, 254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HubError(400, `Correo no válido en ${key}`); return s; }
    case 'url': { const s = String(v).trim().slice(0, 500); if (!/^https?:\/\//i.test(s)) throw new HubError(400, `La dirección de ${key} debe empezar por https://`); return s; }
    case 'date': { const s = String(v).slice(0, 10); if (!DATE.test(s)) throw new HubError(400, `Fecha no válida en ${key}`); return s; }
    case 'month': { const s = String(v).slice(0, 7); if (!MONTH.test(s)) throw new HubError(400, `Mes no válido en ${key}`); return s; }
    case 'money': case 'int': { const n = Math.round(Number(String(v).replace(/[^\d.-]/g, ''))); if (!Number.isFinite(n)) throw new HubError(400, `Número no válido en ${key}`); if (t === 'money' && n < 0) throw new HubError(400, `${key} no puede ser negativo`); return n; }
    case 'bool': return v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0;
    case 'usd': case 'num': { const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.')); if (!Number.isFinite(n) || n < 0) throw new HubError(400, `Número no válido en ${key}`); return Math.round(n * (t === 'usd' ? 100 : 10000)) / (t === 'usd' ? 100 : 10000); }
    default: return String(v);
  }
}
// creating: aplica obligatorios y valores por defecto de todo el esquema; editando: solo lo que llega.
function pick(def, body, creating) {
  const out = {};
  for (const [k, type] of Object.entries(def.fields)) {
    if (!creating && !(k in body)) continue;
    out[k] = cast(k, type, body[k]);
  }
  return out;
}

/* ---------------- organizaciones ---------------- */
async function ensureOrg(env, id, name, extra = {}) {
  const t = now();
  await env.DB.prepare(`INSERT INTO orgs (id, kind, app, business_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`)
    .bind(id, extra.kind || (id === DIWILO ? 'diwilo' : 'negocio'), extra.app || null, extra.business_id || null, name, t, t).run();
}
async function listOrgs(env) {
  await ensureOrg(env, DIWILO, 'Diwilo');
  const errors = [];
  await Promise.all(Object.entries(APPS).map(async ([key, cfg]) => {
    if (!env[cfg.binding]) return;
    try {
      for (const b of await listAppBusinesses(env, key)) await ensureOrg(env, `${key}:${b.id}`, b.name, { app: key, business_id: b.id });
    } catch (e) { errors.push(`${cfg.name}: ${e.message}`); }
  }));
  const { results } = await env.DB.prepare("SELECT id, kind, app, business_id, name FROM orgs ORDER BY CASE kind WHEN 'diwilo' THEN 0 ELSE 1 END, app, name").all();
  return { orgs: results.map((o) => ({ ...o, app_name: o.app ? APPS[o.app]?.name || o.app : null })), errors };
}
async function orgExists(env, org) {
  if (org === DIWILO) { await ensureOrg(env, DIWILO, 'Diwilo'); return true; }
  return !!(await env.DB.prepare('SELECT 1 FROM orgs WHERE id = ?').bind(org).first());
}

/* ---------------- CRUD ---------------- */
async function list(env, org, def, url) {
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
  const where = ['org_id = ?'], args = [org];
  if (q) { where.push('(' + def.search.map((c) => `${c} LIKE ?`).join(' OR ') + ')'); def.search.forEach(() => args.push(`%${q}%`)); }
  // contactos: origen (formulario del sitio o agregados a mano)
  const origin = url.searchParams.get('f_origin');
  if (def.table === 'mk_contacts' && origin === 'form') where.push("ref LIKE 'lead:%'");
  if (def.table === 'mk_contacts' && origin === 'manual') where.push('ref IS NULL');
  // filtros simples por columna: ?f_stage=lead
  for (const [k, v] of url.searchParams) {
    const col = k.startsWith('f_') ? k.slice(2) : null;
    if (col && (col in def.fields || col === 'id') && v !== '') { where.push(`${col} = ?`); args.push(v); }
  }
  const { results } = await env.DB.prepare(`SELECT * FROM ${def.table} WHERE ${where.join(' AND ')} ORDER BY ${def.order} LIMIT ${limit}`).bind(...args).all();
  if (def.table === 'mk_contacts') {
    // Estado del lead del formulario (nuevo, contactado, propuesta…) junto al contacto
    const ids = results.map((r) => /^lead:(\d+)$/.exec(r.ref || '')?.[1]).filter(Boolean);
    if (ids.length) {
      const st = Object.fromEntries((await all(env, `SELECT id, status FROM leads WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)).map((l) => [`lead:${l.id}`, l.status]));
      results.forEach((r) => { if (r.ref) r.lead_status = st[r.ref] || null; });
    }
  }
  return results;
}
async function getRow(env, def, org, id) {
  const r = await env.DB.prepare(`SELECT * FROM ${def.table} WHERE id = ? AND org_id = ?`).bind(id, org).first();
  if (!r) throw new HubError(404, 'No encontrado');
  return r;
}
/* ---------------- dólares: TRM oficial (Banco de la República vía datos.gov.co) ---------------- */
// Gastos en dólares (Claude, OpenAI, Cloudflare…): se guarda el valor en USD y se convierte a pesos con la TRM del día del cobro.
let fxReady = false;
async function ensureFx(env) {
  if (fxReady) return;
  for (const t of ['fin_movements', 'fin_recurring']) {
    for (const c of ["currency TEXT NOT NULL DEFAULT 'COP'", 'amount_usd REAL', 'fx_rate REAL']) await env.DB.prepare(`ALTER TABLE ${t} ADD COLUMN ${c}`).run().catch(() => {});
  }
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS fx_trm (date TEXT PRIMARY KEY, rate REAL NOT NULL, source TEXT)').run();
  fxReady = true;
}
export async function trm(env, date) {
  await ensureFx(env);
  const d = DATE.test(String(date || '')) ? String(date) : today();
  const hit = await one(env, 'SELECT rate FROM fx_trm WHERE date = ?', d);
  if (hit) return hit.rate;
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
    const q = `$where=${encodeURIComponent(`vigenciadesde <= '${d}T00:00:00.000'`)}&$order=${encodeURIComponent('vigenciadesde DESC')}&$limit=1`;
    const r = await fetch(`https://www.datos.gov.co/resource/32sa-8pi3.json?${q}`, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    const rate = Number((await r.json())?.[0]?.valor);
    if (rate > 1000) {
      // Solo se guarda en caché si el día ya pasó (la TRM de hoy o de fechas futuras puede cambiar)
      if (d < today()) await env.DB.prepare('INSERT OR REPLACE INTO fx_trm (date, rate, source) VALUES (?, ?, ?)').bind(d, rate, 'trm').run();
      return rate;
    }
  } catch {}
  const s = await one(env, "SELECT v FROM ai_usage_settings WHERE k = 'usd_cop'").catch(() => null);
  return Number(s?.v) || 4000; // respaldo: la tasa configurada en Consumo de IA
}
// Si el registro está en dólares, calcula el monto en pesos con la TRM de su fecha.
async function applyFx(env, entity, row, before = {}) {
  if (!['movements', 'recurring'].includes(entity)) return;
  await ensureFx(env);
  const cur = row.currency ?? before.currency ?? 'COP';
  if (cur !== 'USD') { if ('currency' in row) { row.amount_usd = null; row.fx_rate = null; } return; }
  const usd = row.amount_usd ?? before.amount_usd;
  if (!(usd > 0)) throw new HubError(400, 'Escribe el valor en dólares');
  const date = entity === 'movements' ? (row.date ?? before.date) : (row.next_date ?? before.next_date);
  row.fx_rate = await trm(env, date);
  row.amount = Math.round(usd * row.fx_rate);
}

async function create(env, org, entity, def, body, hooks) {
  if (['movements', 'recurring'].includes(entity) && body.currency === 'USD' && !body.amount) body = { ...body, amount: 1 }; // se recalcula con la TRM
  const row = pick(def, body, true);
  await applyFx(env, entity, row);
  if (entity === 'invoices') {
    row.total = row.total || (row.subtotal || 0) + (row.tax || 0);
    if (!(row.total > 0)) throw new HubError(400, 'La factura necesita un total (o subtotal e impuestos)');
  }
  if (entity === 'deals' && ['ganado', 'perdido'].includes(row.stage)) row.closed_at = now();
  if (entity === 'campaigns') row.utm_campaign = await uniqueUtm(env, row.utm_campaign || row.name);
  for (const k of Object.keys(row)) if (row[k] === null) delete row[k]; // vacío: que aplique el valor por defecto de la tabla
  const t = now(), cols = Object.keys(row);
  const r = await env.DB.prepare(`INSERT INTO ${def.table} (org_id, ${cols.join(', ')}, created_at, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`)
    .bind(org, ...cols.map((c) => row[c]), t, t).run();
  const id = r.meta.last_row_id;
  if (entity === 'contacts' && row.stage === 'lead') await hooks.onNewContact(env, org, { id, ...row });
  if (entity === 'movements' && row.invoice_id) await recomputeInvoice(env, org, row.invoice_id);
  return { id };
}
async function update(env, org, entity, def, id, body) {
  const before = await getRow(env, def, org, id);
  const row = pick(def, body, false);
  if (['currency', 'amount_usd', 'date', 'next_date'].some((k) => k in row)) await applyFx(env, entity, row, before);
  for (const [k, type] of Object.entries(def.fields)) if (row[k] === null && type === 'money' && typeof before[k] === 'number') row[k] = 0;
  if (entity === 'deals' && row.stage && row.stage !== before.stage) row.closed_at = ['ganado', 'perdido'].includes(row.stage) ? now() : null;
  if (entity === 'campaigns' && 'utm_campaign' in row) row.utm_campaign = await uniqueUtm(env, row.utm_campaign || before.name, id);
  const cols = Object.keys(row);
  if (cols.length) {
    await env.DB.prepare(`UPDATE ${def.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND org_id = ?`)
      .bind(...cols.map((c) => row[c]), now(), id, org).run();
  }
  if (entity === 'contacts' && /^lead:\d+$/.test(before.ref || '')) {
    const leadId = Number(before.ref.slice(5));
    const stage = row.stage || before.stage;
    const status = stage === 'cliente' ? 'ganado' : stage === 'perdido' ? 'perdido' : row.last_contact_at ? 'contactado' : null;
    if (status) await env.DB.prepare(`UPDATE leads SET status = ? WHERE id = ? AND (? <> 'contactado' OR status = 'nuevo')`).bind(status, leadId, status).run().catch(() => {});
  }
  if (entity === 'tasks' && 'done' in row) await env.DB.prepare('UPDATE mk_tasks SET done_at = ? WHERE id = ?').bind(row.done ? now() : null, id).run();
  if (entity === 'movements') for (const inv of new Set([before.invoice_id, row.invoice_id].filter(Boolean))) await recomputeInvoice(env, org, inv);
  if (entity === 'invoices') await recomputeInvoice(env, org, id);
  return { ok: true };
}
async function remove(env, org, entity, def, id) {
  const before = await getRow(env, def, org, id);
  await env.DB.prepare(`DELETE FROM ${def.table} WHERE id = ? AND org_id = ?`).bind(id, org).run();
  if (entity === 'movements' && before.invoice_id) await recomputeInvoice(env, org, before.invoice_id);
  if (entity === 'movements') await env.DB.prepare('UPDATE fin_bank_lines SET movement_id = NULL WHERE movement_id = ? AND org_id = ?').bind(id, org).run();
  if (entity === 'lists') await env.DB.prepare('DELETE FROM mk_list_items WHERE list_id = ? AND org_id = ?').bind(id, org).run();
  return { ok: true };
}

/* ---------------- listas ---------------- */
// Tablas: se crean solas la primera vez (y también están en worker/hubs.sql).
let listsReady = false;
export async function ensureListTables(env) {
  if (listsReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mk_lists (id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL, name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'otra', description TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mk_list_items (id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL, list_id INTEGER NOT NULL,
      title TEXT NOT NULL, url TEXT, feed_url TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'activo', score INTEGER, data TEXT,
      last_checked_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mk_list_items ON mk_list_items(org_id, list_id, updated_at)'),
  ]);
  listsReady = true;
}
// Revisa los sitios/feeds de una lista: guarda las últimas publicaciones de cada uno (y su feed si lo encuentra).
export async function checkList(env, org, listId) {
  await ensureListTables(env);
  const list = await getRow(env, ENTITIES.lists, org, listId);
  const items = await all(env, "SELECT * FROM mk_list_items WHERE org_id = ? AND list_id = ? AND status <> 'descartado' AND (url IS NOT NULL OR feed_url IS NOT NULL) ORDER BY updated_at DESC LIMIT 15", org, listId);
  const out = [];
  await Promise.all(items.map(async (it) => {
    try {
      const f = await readFeed(it.feed_url || it.url, 6);
      const latest = f.items.length ? f.items.map(({ titulo, url, fecha }) => ({ titulo, url, fecha })) : (f.articulos_en_pagina || []).map(({ titulo, url }) => ({ titulo, url }));
      await env.DB.prepare('UPDATE mk_list_items SET data = ?, feed_url = COALESCE(feed_url, ?), last_checked_at = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify({ ultimas: latest.slice(0, 6) }), f.items.length ? f.url : null, now(), now(), it.id).run();
      out.push({ nombre: it.title, sitio: it.url, ultimas: latest.slice(0, 6) });
    } catch (e) { out.push({ nombre: it.title, sitio: it.url, error: e.message }); }
  }));
  return { lista: list.name, revisados: out.length, sitios: out };
}

/* ---------------- links de rastreo por campaña ---------------- */
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
// utm_campaign único entre todas las campañas (los links de rastreo y los leads se asocian por él).
async function uniqueUtm(env, wanted, exceptId = 0) {
  const base = slugify(wanted) || 'campana';
  for (let i = 1; i < 50; i++) {
    const u = i === 1 ? base : `${base}-${i}`;
    if (!(await one(env, 'SELECT 1 FROM mk_campaigns WHERE utm_campaign = ? AND id <> ?', u, exceptId))) return u;
  }
  return `${base}-${Date.now().toString(36)}`;
}
// Plataforma -> nombre, utm_source, utm_medium
export const PLATFORMS = {
  instagram: ['Instagram', 'instagram', 'social'], facebook: ['Facebook', 'facebook', 'social'], tiktok: ['TikTok', 'tiktok', 'social'],
  whatsapp: ['WhatsApp', 'whatsapp', 'mensajeria'], google: ['Google Ads', 'google', 'cpc'], youtube: ['YouTube', 'youtube', 'video'],
  linkedin: ['LinkedIn', 'linkedin', 'social'], correo: ['Correo', 'email', 'email'], qr: ['QR impreso', 'qr', 'offline'], otro: ['Otro', 'otro', 'referido'],
};
async function campaignLinks(env, org, id) {
  const c = await getRow(env, ENTITIES.campaigns, org, id);
  if (!c.utm_campaign) {
    c.utm_campaign = await uniqueUtm(env, c.name, c.id);
    await env.DB.prepare('UPDATE mk_campaigns SET utm_campaign = ? WHERE id = ?').bind(c.utm_campaign, c.id).run();
  }
  const links = await all(env, 'SELECT id, slug, title, target, utm_source, utm_medium, utm_campaign, clicks, created_at FROM links WHERE utm_campaign = ? ORDER BY created_at', c.utm_campaign);
  return { campaign: { id: c.id, name: c.name, utm_campaign: c.utm_campaign }, links };
}
async function createCampaignLink(env, org, id, body) {
  const { campaign } = await campaignLinks(env, org, id);
  const p = PLATFORMS[body.platform] || PLATFORMS.otro;
  const target = String(body.target || '').trim();
  try { if (!/^https?:$/.test(new URL(target).protocol)) throw 0; } catch { throw new HubError(400, 'La dirección de destino debe empezar por https://'); }
  const base = slugify(`${campaign.utm_campaign}-${p[1]}`).slice(0, 60);
  let slug = base;
  for (let i = 2; await one(env, 'SELECT 1 FROM links WHERE slug = ?', slug); i++) slug = `${base}-${i}`;
  const r = await env.DB.prepare('INSERT INTO links (slug, title, target, utm_source, utm_medium, utm_campaign, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(slug, String(body.title || `${campaign.name} · ${p[0]}`).slice(0, 200), target.slice(0, 1000), p[1], p[2], campaign.utm_campaign, now()).run();
  return { id: r.meta.last_row_id, slug };
}

/* ---------------- facturas ---------------- */
// Pagado = suma de los movimientos ligados. Estado: pagada si cubre el total (anulada se respeta).
async function recomputeInvoice(env, org, invoiceId) {
  const inv = await env.DB.prepare('SELECT total, status FROM fin_invoices WHERE id = ? AND org_id = ?').bind(invoiceId, org).first();
  if (!inv) return;
  const s = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) n FROM fin_movements WHERE invoice_id = ? AND org_id = ?').bind(invoiceId, org).first();
  const status = inv.status === 'anulada' ? 'anulada' : s.n >= inv.total && inv.total > 0 ? 'pagada' : 'pendiente';
  await env.DB.prepare('UPDATE fin_invoices SET paid = ?, status = ?, updated_at = ? WHERE id = ?').bind(s.n, status, now(), invoiceId).run();
}
async function payInvoice(env, org, id, body) {
  const inv = await getRow(env, ENTITIES.invoices, org, id);
  if (inv.status === 'anulada') throw new HubError(409, 'La factura está anulada');
  const amount = cast('monto', 'money!', body.amount ?? inv.total - inv.paid);
  if (amount <= 0) throw new HubError(400, 'El monto debe ser mayor que cero');
  const date = cast('fecha', 'date', body.date) || today();
  const t = now();
  await env.DB.prepare(`INSERT INTO fin_movements (org_id, kind, date, amount, category, description, counterparty, cost_center_id, account_id, invoice_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(org, inv.kind === 'emitida' ? 'ingreso' : 'gasto', date, amount, inv.category || 'Facturas',
    `Pago factura ${inv.number || '#' + inv.id}`, inv.counterparty, inv.cost_center_id, cast('cuenta', 'int', body.account_id), inv.id, t, t).run();
  await recomputeInvoice(env, org, id);
  return { ok: true };
}
const invoiceState = (i, t = today()) => i.status === 'anulada' ? 'anulada' : i.status === 'pagada' ? 'pagada' : i.due_date && i.due_date < t ? 'vencida' : 'pendiente';

/* ---------------- resúmenes ---------------- */
const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();

async function marketingSummary(env, org, url) {
  const to = DATE.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : today();
  const from = DATE.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : addDays(to, -29);
  const fromMs = Date.parse(from + 'T05:00:00Z'), toMs = Date.parse(to + 'T05:00:00Z') + 86400000;
  const [contacts, newContacts, bySource, pipeline, won, lost, camps, spendRows, contactsByCamp, wonByCamp, tasks, tools] = await Promise.all([
    all(env, 'SELECT stage, COUNT(*) n FROM mk_contacts WHERE org_id = ? GROUP BY stage', org),
    one(env, 'SELECT COUNT(*) n FROM mk_contacts WHERE org_id = ? AND created_at >= ? AND created_at < ?', org, fromMs, toMs),
    all(env, "SELECT COALESCE(NULLIF(source, ''), '(sin dato)') k, COUNT(*) n FROM mk_contacts WHERE org_id = ? AND created_at >= ? AND created_at < ? GROUP BY k ORDER BY n DESC LIMIT 8", org, fromMs, toMs),
    all(env, "SELECT stage, COUNT(*) n, COALESCE(SUM(value), 0) v FROM mk_deals WHERE org_id = ? AND stage NOT IN ('ganado', 'perdido') GROUP BY stage", org),
    one(env, "SELECT COUNT(*) n, COALESCE(SUM(value), 0) v FROM mk_deals WHERE org_id = ? AND stage = 'ganado' AND closed_at >= ? AND closed_at < ?", org, fromMs, toMs),
    one(env, "SELECT COUNT(*) n FROM mk_deals WHERE org_id = ? AND stage = 'perdido' AND closed_at >= ? AND closed_at < ?", org, fromMs, toMs),
    all(env, 'SELECT id, name, channel, status, budget, goal_leads, start_date, end_date, utm_campaign FROM mk_campaigns WHERE org_id = ?', org),
    all(env, 'SELECT campaign_id, COALESCE(SUM(amount), 0) spend, COALESCE(SUM(leads), 0) leads, COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN amount END), 0) spend_period FROM mk_spend WHERE org_id = ? GROUP BY campaign_id', from, to, org),
    all(env, 'SELECT campaign_id, COUNT(*) n FROM mk_contacts WHERE org_id = ? AND campaign_id IS NOT NULL GROUP BY campaign_id', org),
    all(env, "SELECT campaign_id, COUNT(*) n, COALESCE(SUM(value), 0) v FROM mk_deals WHERE org_id = ? AND stage = 'ganado' AND campaign_id IS NOT NULL GROUP BY campaign_id", org),
    one(env, 'SELECT COUNT(*) open, SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) overdue FROM mk_tasks WHERE org_id = ? AND done = 0', today(), org),
    one(env, "SELECT COUNT(*) n, COALESCE(SUM(CASE cycle WHEN 'anual' THEN cost / 12 WHEN 'mensual' THEN cost ELSE 0 END), 0) monthly FROM org_tools WHERE org_id = ? AND status <> 'cancelada'", org),
  ]);
  const clickRows = await all(env, `SELECT l.utm_campaign k, COUNT(*) links, COALESCE(SUM(l.clicks), 0) clicks FROM links l
    JOIN mk_campaigns c ON c.utm_campaign = l.utm_campaign AND c.org_id = ? GROUP BY l.utm_campaign`, org).catch(() => []);
  const clicksBy = Object.fromEntries(clickRows.map((r) => [r.k, r]));
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.campaign_id, r]));
  const sp = by(spendRows), cc = by(contactsByCamp), wc = by(wonByCamp);
  const campaigns = camps.map((c) => {
    const spend = sp[c.id]?.spend || 0, leads = Math.max(sp[c.id]?.leads || 0, cc[c.id]?.n || 0), revenue = wc[c.id]?.v || 0;
    return { ...c, spend, spend_period: sp[c.id]?.spend_period || 0, leads, won: wc[c.id]?.n || 0, revenue,
      links: clicksBy[c.utm_campaign]?.links || 0, clicks: clicksBy[c.utm_campaign]?.clicks || 0,
      cpl: leads ? Math.round(spend / leads) : null, roi: spend ? Math.round(((revenue - spend) / spend) * 100) : null,
      budget_used: c.budget ? Math.round((spend / c.budget) * 100) : null };
  });
  const channels = {};
  for (const c of campaigns) { const k = c.channel; channels[k] ||= { channel: k, spend: 0, leads: 0, revenue: 0 }; channels[k].spend += c.spend; channels[k].leads += c.leads; channels[k].revenue += c.revenue; }
  const totals = campaigns.reduce((a, c) => ({ budget: a.budget + (c.budget || 0), spend: a.spend + c.spend, spend_period: a.spend_period + c.spend_period, leads: a.leads + c.leads, revenue: a.revenue + c.revenue }), { budget: 0, spend: 0, spend_period: 0, leads: 0, revenue: 0 });
  let site = null;
  if (org === DIWILO) site = await one(env, 'SELECT COUNT(*) leads FROM leads WHERE ts >= ? AND ts < ?', fromMs, toMs).catch(() => null);
  return {
    from, to,
    contacts: { by_stage: Object.fromEntries(contacts.map((r) => [r.stage, r.n])), new: newContacts.n, by_source: bySource },
    deals: { pipeline: STAGES_DEAL.slice(0, 4).map((s) => ({ stage: s, n: pipeline.find((p) => p.stage === s)?.n || 0, value: pipeline.find((p) => p.stage === s)?.v || 0 })),
      won: won.n, won_value: won.v, lost: lost.n, win_rate: won.n + lost.n ? Math.round((won.n / (won.n + lost.n)) * 100) : null },
    campaigns, channels: Object.values(channels),
    totals: { ...totals, cpl: totals.leads ? Math.round(totals.spend / totals.leads) : null, roi: totals.spend ? Math.round(((totals.revenue - totals.spend) / totals.spend) * 100) : null },
    tasks: { open: tasks.open || 0, overdue: tasks.overdue || 0 },
    tools: { active: tools.n, monthly: Math.round(tools.monthly) },
    site,
  };
}

async function financeSummary(env, org, url) {
  const month = MONTH.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : today().slice(0, 7);
  const t = today();
  const first = `${month}-01`, next = addMonths(first, 1);
  const [mov, byCat, byCc, budgets, invoices, recurring, accounts, accMov, unrec, ccs] = await Promise.all([
    one(env, "SELECT COALESCE(SUM(CASE WHEN kind = 'ingreso' THEN amount END), 0) income, COALESCE(SUM(CASE WHEN kind = 'gasto' THEN amount END), 0) expense FROM fin_movements WHERE org_id = ? AND date >= ? AND date < ?", org, first, next),
    all(env, "SELECT kind, COALESCE(NULLIF(category, ''), 'Sin categoría') k, SUM(amount) n FROM fin_movements WHERE org_id = ? AND date >= ? AND date < ? GROUP BY kind, k ORDER BY n DESC", org, first, next),
    all(env, "SELECT cost_center_id id, SUM(CASE WHEN kind = 'gasto' THEN amount ELSE 0 END) expense, SUM(CASE WHEN kind = 'ingreso' THEN amount ELSE 0 END) income FROM fin_movements WHERE org_id = ? AND date >= ? AND date < ? GROUP BY cost_center_id", org, first, next),
    all(env, 'SELECT cost_center_id id, category, SUM(amount) amount FROM fin_budgets WHERE org_id = ? AND month = ? GROUP BY cost_center_id, category', org, month),
    all(env, "SELECT id, kind, number, counterparty, issue_date, due_date, total, paid, status FROM fin_invoices WHERE org_id = ? AND status <> 'anulada' AND status <> 'pagada'", org),
    all(env, 'SELECT id, name, category, amount, cycle, next_date FROM fin_recurring WHERE org_id = ? AND active = 1', org),
    all(env, 'SELECT id, name, kind, opening_balance FROM fin_accounts WHERE org_id = ?', org),
    all(env, "SELECT account_id id, SUM(CASE WHEN kind = 'ingreso' THEN amount ELSE -amount END) n FROM fin_movements WHERE org_id = ? AND account_id IS NOT NULL GROUP BY account_id", org),
    one(env, 'SELECT COUNT(*) n FROM fin_bank_lines WHERE org_id = ? AND movement_id IS NULL', org),
    all(env, 'SELECT id, name, kind FROM fin_cost_centers WHERE org_id = ?', org),
  ]);
  // Cartera: por cobrar (emitidas) y por pagar (recibidas), por antigüedad del vencimiento
  const aging = (kind) => {
    const out = { total: 0, overdue: 0, buckets: { al_dia: 0, d30: 0, d60: 0, d90: 0, mas90: 0 }, items: [] };
    for (const i of invoices.filter((x) => x.kind === kind)) {
      const due = i.total - i.paid; if (due <= 0) continue;
      const late = i.due_date && i.due_date < t ? Math.round((Date.parse(t) - Date.parse(i.due_date)) / 86400000) : 0;
      out.total += due; if (late > 0) out.overdue += due;
      out.buckets[late <= 0 ? 'al_dia' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'mas90'] += due;
      out.items.push({ ...i, due, late, state: invoiceState(i, t) });
    }
    out.items.sort((a, b) => b.late - a.late || b.due - a.due);
    out.items = out.items.slice(0, 8);
    return out;
  };
  // Flujo de caja: 6 meses reales + 3 proyectados (recurrentes + facturas por vencer)
  const curFirst = `${t.slice(0, 7)}-01`;
  const past = await all(env, "SELECT substr(date, 1, 7) m, SUM(CASE WHEN kind = 'ingreso' THEN amount ELSE 0 END) income, SUM(CASE WHEN kind = 'gasto' THEN amount ELSE 0 END) expense FROM fin_movements WHERE org_id = ? AND date >= ? GROUP BY m", org, addMonths(curFirst, -5));
  const flow = [];
  for (let k = -5; k <= 3; k++) {
    const m = addMonths(curFirst, k).slice(0, 7);
    const real = past.find((p) => p.m === m);
    const row = { month: m, income: real?.income || 0, expense: real?.expense || 0, projected: k > 0 };
    if (k >= 0) {
      const mFirst = `${m}-01`, mNext = addMonths(mFirst, 1);
      for (const r of recurring) {
        let d = r.next_date, guard = 0;
        while (d < mNext && guard++ < 40) { if (d >= mFirst && (k > 0 || d >= t)) row.expense += r.amount; d = addMonths(d, r.cycle === 'anual' ? 12 : 1); }
      }
      for (const i of invoices) {
        const due = i.total - i.paid; if (due <= 0 || !i.due_date) continue;
        if (i.due_date >= mFirst && i.due_date < mNext && (k > 0 || i.due_date >= t)) row[i.kind === 'emitida' ? 'income' : 'expense'] += due;
      }
      if (k === 0) row.partial = true;
    }
    row.net = row.income - row.expense;
    flow.push(row);
  }
  const ccName = Object.fromEntries(ccs.map((c) => [c.id, c.name]));
  const centers = {};
  for (const r of byCc) centers[r.id ?? 0] = { id: r.id, name: r.id ? ccName[r.id] || `#${r.id}` : 'Sin centro de costo', expense: r.expense, income: r.income, budget: 0 };
  for (const b of budgets) { const k = b.id ?? 0; centers[k] ||= { id: b.id, name: b.id ? ccName[b.id] || `#${b.id}` : 'General', expense: 0, income: 0, budget: 0 }; centers[k].budget += b.amount; }
  const recurringMonthly = {};
  for (const r of recurring) recurringMonthly[r.category] = (recurringMonthly[r.category] || 0) + (r.cycle === 'anual' ? Math.round(r.amount / 12) : r.amount);
  const bal = Object.fromEntries(accMov.map((a) => [a.id, a.n]));
  return {
    month, today: t,
    totals: { income: mov.income, expense: mov.expense, net: mov.income - mov.expense,
      budget: budgets.reduce((n, b) => n + b.amount, 0) },
    expense_by_category: byCat.filter((r) => r.kind === 'gasto').map(({ k, n }) => ({ k, n })),
    income_by_category: byCat.filter((r) => r.kind === 'ingreso').map(({ k, n }) => ({ k, n })),
    cost_centers: Object.values(centers).sort((a, b) => b.expense - a.expense),
    receivable: aging('emitida'), payable: aging('recibida'),
    cash_flow: flow,
    recurring_monthly: recurringMonthly,
    recurring_total: Object.values(recurringMonthly).reduce((a, b) => a + b, 0),
    accounts: accounts.map((a) => ({ ...a, balance: a.opening_balance + (bal[a.id] || 0) })),
    bank_pending: unrec.n,
  };
}

/* ---------------- banco: importar extracto y conciliar ---------------- */
async function bankImport(env, org, body) {
  const accountId = cast('cuenta', 'int!', body.account_id);
  await getRow(env, ENTITIES.accounts, org, accountId);
  const lines = Array.isArray(body.lines) ? body.lines.slice(0, 2000) : [];
  if (!lines.length) throw new HubError(400, 'El extracto no trae movimientos');
  const t = now(), stmts = [];
  for (const l of lines) {
    const date = cast('fecha', 'date!', l.date), amount = Math.round(Number(l.amount));
    if (!Number.isFinite(amount) || amount === 0) continue;
    stmts.push(env.DB.prepare('INSERT INTO fin_bank_lines (org_id, account_id, date, description, amount, ref, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(org, accountId, date, String(l.description || '').slice(0, 300), amount, l.ref ? String(l.ref).slice(0, 100) : null, t));
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return { imported: stmts.length, matched: await autoMatch(env, org, accountId) };
}
// Concilia solo lo inequívoco: mismo valor, mismo sentido, ±3 días y un único movimiento candidato.
async function autoMatch(env, org, accountId) {
  const lines = await all(env, 'SELECT * FROM fin_bank_lines WHERE org_id = ? AND account_id = ? AND movement_id IS NULL', org, accountId);
  let matched = 0;
  for (const l of lines) {
    const cands = await all(env, `SELECT id FROM fin_movements WHERE org_id = ? AND reconciled = 0 AND kind = ? AND amount = ? AND date BETWEEN ? AND ?
      AND (account_id IS NULL OR account_id = ?)`, org, l.amount > 0 ? 'ingreso' : 'gasto', Math.abs(l.amount), addDays(l.date, -3), addDays(l.date, 3), accountId);
    if (cands.length !== 1) continue;
    await link(env, org, l.id, cands[0].id, accountId);
    matched++;
  }
  return matched;
}
async function link(env, org, lineId, movementId, accountId) {
  await env.DB.batch([
    env.DB.prepare('UPDATE fin_bank_lines SET movement_id = ? WHERE id = ? AND org_id = ?').bind(movementId, lineId, org),
    env.DB.prepare('UPDATE fin_movements SET reconciled = 1, account_id = COALESCE(account_id, ?), updated_at = ? WHERE id = ? AND org_id = ?').bind(accountId, now(), movementId, org),
  ]);
}
async function bankLines(env, org, url) {
  const acc = Number(url.searchParams.get('account_id')) || null;
  const lines = await all(env, `SELECT b.*, m.description AS m_description, m.category AS m_category FROM fin_bank_lines b
    LEFT JOIN fin_movements m ON m.id = b.movement_id WHERE b.org_id = ? ${acc ? 'AND b.account_id = ?' : ''} ORDER BY b.movement_id IS NOT NULL, b.date DESC LIMIT 500`, org, ...(acc ? [acc] : []));
  // Candidatos para las pendientes (mismo valor y sentido, ±7 días)
  for (const l of lines.filter((x) => !x.movement_id).slice(0, 100)) {
    l.candidates = await all(env, `SELECT id, date, description, counterparty, amount FROM fin_movements WHERE org_id = ? AND reconciled = 0 AND kind = ? AND amount = ?
      AND date BETWEEN ? AND ? LIMIT 5`, org, l.amount > 0 ? 'ingreso' : 'gasto', Math.abs(l.amount), addDays(l.date, -7), addDays(l.date, 7));
  }
  return { lines };
}
async function matchLine(env, org, lineId, body) {
  const l = await one(env, 'SELECT * FROM fin_bank_lines WHERE id = ? AND org_id = ?', lineId, org);
  if (!l) throw new HubError(404, 'Línea no encontrada');
  if (body.unlink) {
    if (l.movement_id) await env.DB.batch([
      env.DB.prepare('UPDATE fin_bank_lines SET movement_id = NULL WHERE id = ?').bind(lineId),
      env.DB.prepare('UPDATE fin_movements SET reconciled = 0 WHERE id = ? AND org_id = ?').bind(l.movement_id, org),
    ]);
    return { ok: true };
  }
  let movementId = body.movement_id ? cast('movimiento', 'int', body.movement_id) : null;
  if (movementId) await getRow(env, ENTITIES.movements, org, movementId);
  else if (body.create) {
    const t = now();
    const r = await env.DB.prepare(`INSERT INTO fin_movements (org_id, kind, date, amount, category, description, cost_center_id, account_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(org, l.amount > 0 ? 'ingreso' : 'gasto', l.date, Math.abs(l.amount), cast('categoría', 'text', body.create.category),
      l.description, cast('centro', 'int', body.create.cost_center_id), l.account_id, t, t).run();
    movementId = r.meta.last_row_id;
  } else throw new HubError(400, 'Elige un movimiento o crea uno');
  await link(env, org, lineId, movementId, l.account_id);
  return { ok: true, movement_id: movementId };
}

/* ---------------- exportar para el contador ---------------- */
const csvCell = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function exportCsv(env, org, url) {
  const kind = url.searchParams.get('kind') === 'invoices' ? 'invoices' : 'movements';
  const from = DATE.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : '0000-01-01';
  const to = DATE.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : '9999-12-31';
  let header, rows;
  if (kind === 'movements') {
    header = ['Fecha', 'Tipo', 'Monto', 'Categoría', 'Descripción', 'Tercero', 'Centro de costo', 'Cuenta', 'Factura', 'Conciliado'];
    rows = (await all(env, `SELECT m.*, c.name cc, a.name acc, i.number inv FROM fin_movements m LEFT JOIN fin_cost_centers c ON c.id = m.cost_center_id
      LEFT JOIN fin_accounts a ON a.id = m.account_id LEFT JOIN fin_invoices i ON i.id = m.invoice_id WHERE m.org_id = ? AND m.date BETWEEN ? AND ? ORDER BY m.date, m.id`, org, from, to))
      .map((m) => [m.date, m.kind, m.kind === 'gasto' ? -m.amount : m.amount, m.category, m.description, m.counterparty, m.cc, m.acc, m.inv, m.reconciled ? 'sí' : 'no']);
  } else {
    header = ['Tipo', 'Número', 'Tercero', 'NIT/CC', 'Emisión', 'Vencimiento', 'Subtotal', 'Impuestos', 'Total', 'Pagado', 'Saldo', 'Estado', 'Centro de costo', 'Categoría'];
    rows = (await all(env, `SELECT i.*, c.name cc FROM fin_invoices i LEFT JOIN fin_cost_centers c ON c.id = i.cost_center_id WHERE i.org_id = ? AND i.issue_date BETWEEN ? AND ? ORDER BY i.issue_date, i.id`, org, from, to))
      .map((i) => [i.kind === 'emitida' ? 'Por cobrar' : 'Por pagar', i.number, i.counterparty, i.tax_id, i.issue_date, i.due_date, i.subtotal, i.tax, i.total, i.paid, i.total - i.paid, invoiceState(i), i.cc, i.category]);
  }
  const body = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  const name = `${kind === 'invoices' ? 'facturas' : 'movimientos'}-${org.replace(/[^a-z0-9]+/gi, '-')}-${from.startsWith('0000') ? 'todo' : from}.csv`;
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
}

/* ---------------- integraciones con lo que ya existe ---------------- */
// Lead del formulario del sitio -> contacto de Diwilo (y automatizaciones de "lead nuevo").
export async function hubLeadCreated(env, lead, callAI) {
  try {
    await ensureOrg(env, DIWILO, 'Diwilo');
    const camp = lead.utm_campaign ? await one(env, 'SELECT id FROM mk_campaigns WHERE org_id = ? AND utm_campaign = ?', DIWILO, lead.utm_campaign) : null;
    const t = now();
    const source = lead.utm_source ? `Sitio web · ${lead.utm_source}` : 'Sitio web';
    const r = await env.DB.prepare(`INSERT OR IGNORE INTO mk_contacts (org_id, name, email, phone, stage, source, campaign_id, notes, ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?)`).bind(DIWILO, lead.name || lead.email || 'Lead', lead.email || null, lead.phone || null, source, camp?.id || null,
      [lead.topics, lead.message].filter(Boolean).join(' — ').slice(0, 2000) || null, `lead:${lead.id}`, lead.ts || t, t).run();
    if (r.meta.changes) await onNewContact(env, DIWILO, { id: r.meta.last_row_id, name: lead.name, campaign_id: camp?.id || null }, callAI);
  } catch (e) { console.error('hub lead', e.message); }
}
// Pago de suscripción registrado en Negocios -> ingreso de Diwilo en el centro de costo de la app.
export async function hubPaymentRecorded(env, p) {
  try {
    if (!(p.amount > 0)) return;
    await ensureOrg(env, DIWILO, 'Diwilo');
    const cc = await appCostCenter(env, p.app);
    const t = now();
    await env.DB.prepare(`INSERT OR IGNORE INTO fin_movements (org_id, kind, date, amount, category, description, counterparty, cost_center_id, ref, created_at, updated_at)
      VALUES (?, 'ingreso', ?, ?, 'Suscripciones apps', ?, ?, ?, ?, ?, ?)`).bind(DIWILO, p.date || today(), p.amount,
      `${APPS[p.app]?.name || p.app}: ${p.months} ${p.months === 1 ? 'mes' : 'meses'}${p.note ? ' · ' + p.note : ''}`.slice(0, 300), p.business_name || null, cc, `pago:${p.id}`, t, t).run();
  } catch (e) { console.error('hub pago', e.message); }
}
async function appCostCenter(env, app) {
  const code = `app:${app}`;
  const t = now();
  await env.DB.prepare(`INSERT OR IGNORE INTO fin_cost_centers (org_id, name, kind, code, active, created_at, updated_at) VALUES (?, ?, 'app', ?, 1, ?, ?)`)
    .bind(DIWILO, `App ${APPS[app]?.name || app}`, code, t, t).run();
  return (await one(env, 'SELECT id FROM fin_cost_centers WHERE org_id = ? AND code = ?', DIWILO, code)).id;
}
// Trae a Marketing los leads del formulario que aún no están (los nuevos desde la última vez).
async function syncLeads(env) {
  const last = Number((await one(env, "SELECT value FROM settings WHERE key = 'hub_leads_last'"))?.value || 0);
  const max = (await one(env, 'SELECT MAX(id) n FROM leads'))?.n || 0;
  if (max <= last) return { imported: 0 };
  const r = await importLeads(env, last);
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('hub_leads_last', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(max)).run();
  return r;
}
const LEAD_STAGE = (status) => (status === 'ganado' ? 'cliente' : status === 'perdido' ? 'perdido' : 'lead');
// Estado cambiado en la pestaña Leads -> etapa del contacto en Marketing.
export async function hubLeadStatus(env, leadId, status) {
  try { await env.DB.prepare("UPDATE mk_contacts SET stage = ?, updated_at = ? WHERE org_id = 'diwilo' AND ref = ?").bind(LEAD_STAGE(status), now(), `lead:${leadId}`).run(); }
  catch (e) { console.error('hub lead estado', e.message); }
}
async function importLeads(env, afterId = 0) {
  await ensureOrg(env, DIWILO, 'Diwilo');
  const { results } = await env.DB.prepare('SELECT * FROM leads WHERE id > ? ORDER BY id').bind(afterId).all();
  let n = 0;
  for (const l of results) {
    const camp = l.utm_campaign ? await one(env, 'SELECT id FROM mk_campaigns WHERE org_id = ? AND utm_campaign = ?', DIWILO, l.utm_campaign) : null;
    const r = await env.DB.prepare(`INSERT OR IGNORE INTO mk_contacts (org_id, name, email, phone, stage, source, campaign_id, notes, ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(DIWILO, l.name || l.email || 'Lead', l.email || null, l.phone || null, LEAD_STAGE(l.status),
      l.utm_source ? `Sitio web · ${l.utm_source}` : 'Sitio web', camp?.id || null, [l.topics, l.message].filter(Boolean).join(' — ').slice(0, 2000) || null, `lead:${l.id}`, l.ts, now()).run();
    n += r.meta.changes;
  }
  return { imported: n, total: results.length };
}
async function importPayments(env) {
  const { results } = await env.DB.prepare('SELECT * FROM sub_payments ORDER BY ts').all();
  let n = 0;
  for (const p of results) {
    const before = await one(env, 'SELECT 1 FROM fin_movements WHERE org_id = ? AND ref = ?', DIWILO, `pago:${p.id}`);
    if (before || !(p.amount > 0)) continue;
    await hubPaymentRecorded(env, { id: p.id, app: p.app, amount: p.amount, months: p.months, note: p.note, business_name: p.business_name, date: new Date(p.ts - 5 * 3600000).toISOString().slice(0, 10) });
    n++;
  }
  return { imported: n, total: results.length };
}

/* ---------------- automatizaciones y agente ---------------- */
const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
// Pasos de una automatización: varias tareas, cada una a N días. task_title = JSON [{ t, d }] o un título suelto.
function stepsOf(a, fallback) {
  try { const v = JSON.parse(a.task_title); if (Array.isArray(v) && v.length) return v.slice(0, 20).map((x) => ({ t: String(x.t || '').slice(0, 300), d: Math.max(0, Math.min(365, Number(x.d) || 0)) })).filter((x) => x.t); } catch {}
  return [{ t: a.task_title || fallback, d: a.trigger === 'lead_nuevo' ? a.days || 0 : 0 }];
}
// Crea las tareas de todos los pasos (sin repetir las que siguen abiertas).
async function addSteps(env, a, fallback, vars, link, key) {
  let did = false;
  for (const [i, st] of stepsOf(a, fallback).entries()) {
    did = (await addTask(env, a.org_id, fill(st.t, vars), { due: addDays(today(), st.d), ...link, source: `auto:${a.id}:${key}:${i}` })) || did;
  }
  return did;
}
async function addTask(env, org, title, { due, contact_id = null, deal_id = null, source }) {
  if (source && await one(env, 'SELECT 1 FROM mk_tasks WHERE org_id = ? AND source = ? AND done = 0', org, source)) return false; // no duplicar
  const t = now();
  await env.DB.prepare('INSERT INTO mk_tasks (org_id, title, due_date, contact_id, deal_id, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(org, title.slice(0, 300), due || today(), contact_id, deal_id, source || 'manual', t, t).run();
  return true;
}
async function bump(env, a) { await env.DB.prepare('UPDATE mk_automations SET runs = runs + 1, last_run_at = ? WHERE id = ?').bind(now(), a.id).run(); }

async function onNewContact(env, org, contact, callAI) {
  const autos = await all(env, "SELECT * FROM mk_automations WHERE org_id = ? AND active = 1 AND trigger = 'lead_nuevo'", org);
  for (const a of autos) {
    const vars = { nombre: contact.name || 'el lead' };
    if (a.action === 'crear_oportunidad') {
      const t = now();
      await env.DB.prepare("INSERT INTO mk_deals (org_id, title, contact_id, campaign_id, value, stage, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'nuevo', ?, ?)")
        .bind(org, fill(stepsOf(a, 'Oportunidad: {nombre}')[0].t, vars).slice(0, 300), contact.id, contact.campaign_id || null, t, t).run();
    } else if (a.action === 'crear_tarea') {
      await addSteps(env, a, 'Contactar a {nombre}', vars, { contact_id: contact.id }, `c${contact.id}`);
    }
    await bump(env, a);
  }
}

async function runAutomations(env, callAI) {
  const autos = await all(env, "SELECT * FROM mk_automations WHERE active = 1 AND trigger <> 'lead_nuevo'");
  const t = today(), isMonday = new Date(Date.now() - 5 * 3600000).getUTCDay() === 1;
  for (const a of autos) {
    let did = false;
    if (a.trigger === 'sin_contacto') {
      const days = a.days || 3, limitMs = now() - days * 86400000;
      const rows = await all(env, `SELECT id, name FROM mk_contacts WHERE org_id = ? AND stage = 'lead' AND created_at < ?
        AND (last_contact_at IS NULL OR last_contact_at < ?) LIMIT 50`, a.org_id, limitMs, addDays(t, -days));
      for (const c of rows) did = (await addSteps(env, a, 'Hacer seguimiento a {nombre}', { nombre: c.name }, { contact_id: c.id }, `c${c.id}`)) || did;
    } else if (a.trigger === 'presupuesto_campana') {
      const pct = a.percent || 80;
      const rows = await all(env, `SELECT c.id, c.name, c.budget, COALESCE(SUM(s.amount), 0) spend FROM mk_campaigns c LEFT JOIN mk_spend s ON s.campaign_id = c.id
        WHERE c.org_id = ? AND c.status = 'activa' AND c.budget > 0 GROUP BY c.id HAVING spend * 100 >= c.budget * ?`, a.org_id, pct);
      for (const c of rows) did = (await addSteps(env, a, 'La campaña {campana} va en {porcentaje}% del presupuesto', { campana: c.name, porcentaje: Math.round(c.spend * 100 / c.budget) }, {}, `k${c.id}`)) || did;
    } else if (a.trigger === 'factura_vencida') {
      const rows = await all(env, "SELECT id, number, counterparty, kind FROM fin_invoices WHERE org_id = ? AND status = 'pendiente' AND due_date < ? LIMIT 50", a.org_id, t);
      for (const i of rows) did = (await addSteps(env, a, i.kind === 'emitida' ? 'Cobrar factura {factura} a {tercero}' : 'Pagar factura {factura} de {tercero}', { factura: i.number || '#' + i.id, tercero: i.counterparty }, {}, `f${i.id}`)) || did;
    } else if (a.trigger === 'semanal' && isMonday && a.action === 'informe_ia') {
      const last = a.last_run_at ? new Date(a.last_run_at - 5 * 3600000).toISOString().slice(0, 10) : null;
      if (last !== t) { await writeReport(env, a.org_id, 'marketing', callAI); did = true; }
    }
    if (did) await bump(env, a);
  }
}

// Gastos recurrentes que vencen: crea el movimiento y corre la próxima fecha.
async function runRecurring(env) {
  const t = today();
  await ensureFx(env);
  const due = await all(env, 'SELECT * FROM fin_recurring WHERE active = 1 AND next_date <= ?', t);
  for (const r of due) {
    let d = r.next_date, guard = 0;
    while (d <= t && guard++ < 24) {
      const ts = now();
      // En dólares: cada cobro se convierte con la TRM de su día
      const usd = r.currency === 'USD' && r.amount_usd > 0, rate = usd ? await trm(env, d) : null;
      await env.DB.prepare(`INSERT OR IGNORE INTO fin_movements (org_id, kind, date, amount, currency, amount_usd, fx_rate, category, description, counterparty, cost_center_id, account_id, recurring_id, ref, created_at, updated_at)
        VALUES (?, 'gasto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(r.org_id, d, usd ? Math.round(r.amount_usd * rate) : r.amount, usd ? 'USD' : 'COP', usd ? r.amount_usd : null, rate,
        r.category, r.name, r.vendor, r.cost_center_id, r.account_id, r.id, `rec:${r.id}:${d}`, ts, ts).run();
      d = addMonths(d, r.cycle === 'anual' ? 12 : 1);
    }
    await env.DB.prepare('UPDATE fin_recurring SET next_date = ?, updated_at = ? WHERE id = ?').bind(d, now(), r.id).run();
  }
  return due.length;
}

export async function runHubsDaily(env, callAI) {
  try { await runRecurring(env); } catch (e) { console.error('hubs recurrentes', e.message); }
  try { await runAutomations(env, callAI); } catch (e) { console.error('hubs automatizaciones', e.message); }
}

// Agente: informe en lenguaje claro a partir de los números del hub.
async function writeReport(env, org, kind, callAI) {
  const fake = new URL('https://x/?');
  const data = kind === 'finanzas' ? await financeSummary(env, org, fake) : await marketingSummary(env, org, fake);
  const name = (await one(env, 'SELECT name FROM orgs WHERE id = ?', org))?.name || org;
  const system = `Eres el analista de ${kind === 'finanzas' ? 'finanzas' : 'marketing'} de ${name}. Escribe en español de Colombia un informe breve para el dueño:
1) qué pasó (con cifras en pesos colombianos), 2) qué preocupa, 3) tres acciones concretas para esta semana.
Usa solo los datos que te doy; si faltan datos, dilo y sugiere qué registrar. Máximo 220 palabras, con títulos cortos y viñetas.`;
  let content;
  try { content = await callAI(env, system, [{ role: 'user', content: 'Datos (JSON):\n' + JSON.stringify(data).slice(0, 12000) }], { source: 'informes' }); } catch (e) { content = null; }
  if (!content) throw new HubError(502, 'La IA no respondió. Intenta de nuevo en un momento.');
  const title = `${kind === 'finanzas' ? 'Finanzas' : 'Marketing'} · ${new Date(Date.now() - 5 * 3600000).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const r = await env.DB.prepare('INSERT INTO hub_reports (org_id, kind, title, content, created_at) VALUES (?, ?, ?, ?, ?)').bind(org, kind, title, content, now()).run();
  return { id: r.meta.last_row_id, title, content };
}

/* ---------------- ruteo ---------------- */
export async function hubsApi(req, env, path, url, adminEmail, callAI) {
  try {
    await ensureFx(env);
    return await route(req, env, path, url, callAI);
  } catch (e) {
    if (e instanceof HubError) return json({ error: e.message }, e.status);
    if (/UNIQUE/i.test(String(e.message))) return json({ error: 'Ya existe un registro con ese mismo código o referencia' }, 409);
    if (/no such table/i.test(String(e.message))) return json({ error: 'Faltan las tablas de los hubs. Corre: npx wrangler d1 execute diwilo-admin-db --remote --file=worker/hubs.sql' }, 503);
    throw e;
  }
}

async function route(req, env, path, url, callAI) {
  const M = req.method;
  const parts = path.split('/').filter(Boolean).slice(3).map(decodeURIComponent); // tras /admin/api/hub
  if (parts[0] === 'orgs' && M === 'GET') return json(await listOrgs(env));
  const [org, a, b, c] = parts;
  if (!org || !ORG_RE.test(org)) return json({ error: 'Organización no válida' }, 400);
  if (!(await orgExists(env, org))) return json({ error: 'Organización no encontrada: recarga la lista' }, 404);
  const body = M === 'GET' || M === 'DELETE' ? {} : await req.json().catch(() => ({}));
  const hooks = { onNewContact: (e, o, ct) => onNewContact(e, o, ct, callAI) };

  // Diwilo: los leads del formulario se sincronizan solos al abrir Clientes y leads o el Resumen.
  if (org === DIWILO && M === 'GET' && ((a === 'marketing' && b === 'summary') || (a === 'contacts' && !b))) await syncLeads(env).catch((e) => console.error('sync leads', e.message));
  if (a === 'campaigns' && b && c === 'links' && M === 'GET') return json(await campaignLinks(env, org, Number(b)));
  if (a === 'campaigns' && b && c === 'links' && M === 'POST') return json(await createCampaignLink(env, org, Number(b), body), 201);
  if (a === 'marketing' && b === 'summary' && M === 'GET') return json(await marketingSummary(env, org, url));
  if (a === 'marketing' && b === 'import-leads' && M === 'POST') { if (org !== DIWILO) return json({ error: 'Solo para Diwilo' }, 400); return json(await importLeads(env, 0)); }
  if (a === 'finance' && b === 'summary' && M === 'GET') return json(await financeSummary(env, org, url));
  if (a === 'finance' && b === 'import-payments' && M === 'POST') { if (org !== DIWILO) return json({ error: 'Solo para Diwilo' }, 400); return json(await importPayments(env)); }
  if (a === 'finance' && b === 'bank-lines' && !c && M === 'GET') return json(await bankLines(env, org, url));
  if (a === 'finance' && b === 'bank-import' && M === 'POST') return json(await bankImport(env, org, body));
  if (a === 'finance' && b === 'bank-lines' && c && parts[4] === 'match' && M === 'POST') return json(await matchLine(env, org, Number(c), body));
  if (a === 'finance' && b === 'export' && M === 'GET') return exportCsv(env, org, url);
  if (a === 'invoices' && b && c === 'pay' && M === 'POST') return json(await payInvoice(env, org, Number(b), body));
  if (a === 'lists' || a === 'list_items') await ensureListTables(env);
  if (a === 'lists' && b && c === 'check' && M === 'POST') return json(await checkList(env, org, Number(b)));
  if (a === 'reports' && !b && M === 'POST') return json(await writeReport(env, org, body.kind === 'finanzas' ? 'finanzas' : 'marketing', callAI), 201);

  const def = ENTITIES[a];
  if (!def) return json({ error: 'no encontrado' }, 404);
  if (!b && M === 'GET') {
    const rows = await list(env, org, def, url);
    if (a === 'invoices') { const t = today(); rows.forEach((r) => { r.state = invoiceState(r, t); }); }
    return json({ rows });
  }
  if (def.readOnly && M !== 'DELETE') return json({ error: 'Solo lectura' }, 405);
  if (!b && M === 'POST') return json(await create(env, org, a, def, body, hooks), 201);
  const id = Number(b);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Id no válido' }, 400);
  if (M === 'PATCH') return json(await update(env, org, a, def, id, body));
  if (M === 'DELETE') return json(await remove(env, org, a, def, id));
  return json({ error: 'no encontrado' }, 404);
}

// ---- Para el asistente IA del panel (assistant.js): mismas reglas que la API del panel ----
export const hubSummary = (env, org, kind, params = {}) => {
  const url = new URL('https://x/'); for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return kind === 'finanzas' ? financeSummary(env, org, url) : marketingSummary(env, org, url);
};
export async function hubCreate(env, org, entity, body, callAI) {
  await ensureFx(env);
  if (!(await orgExists(env, org))) throw new HubError(404, 'Organización no encontrada');
  return create(env, org, entity, ENTITIES[entity], body, { onNewContact: (e, o, ct) => onNewContact(e, o, ct, callAI) });
}
export async function hubUpdate(env, org, entity, id, body) {
  return update(env, org, entity, ENTITIES[entity], id, body);
}
export const hubOrgs = (env) => listOrgs(env);
// Registra cobros ya hechos de un gasto recurrente (fechas pasadas) como gastos, sin duplicar.
export async function hubRecurringCharges(env, org, recurringId, dates) {
  await ensureFx(env);
  const r = await one(env, 'SELECT * FROM fin_recurring WHERE id = ? AND org_id = ?', recurringId, org);
  if (!r) throw new HubError(404, 'No encontré ese gasto recurrente');
  const out = [];
  for (const d of [...new Set(dates)].filter((x) => DATE.test(x) && x <= today()).sort()) {
    const usd = r.currency === 'USD' && r.amount_usd > 0, rate = usd ? await trm(env, d) : null, amount = usd ? Math.round(r.amount_usd * rate) : r.amount, ts = now();
    const res = await env.DB.prepare(`INSERT OR IGNORE INTO fin_movements (org_id, kind, date, amount, currency, amount_usd, fx_rate, category, description, counterparty, cost_center_id, account_id, recurring_id, ref, created_at, updated_at)
      VALUES (?, 'gasto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(org, d, amount, usd ? 'USD' : 'COP', usd ? r.amount_usd : null, rate, r.category, r.name, r.vendor, r.cost_center_id, r.account_id, r.id, `rec:${r.id}:${d}`, ts, ts).run();
    out.push({ fecha: d, pesos: amount, ...(usd ? { usd: r.amount_usd, trm: rate } : {}), nuevo: !!res.meta.changes });
  }
  return out;
}
