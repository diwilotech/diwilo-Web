/**
 * MCP de administración de Diwilo: un asistente (Claude Code u otro) maneja los NEGOCIOS de las apps como en /admin → Negocios.
 *   GET/POST/DELETE /admin/api/mcp-admin[/:id]   conexiones (solo el dueño del panel, con Cloudflare Access; el token se ve una vez)
 *   POST /mcp  con  Authorization: Bearer dwa_…  servidor MCP de administración
 * Las herramientas llaman a las MISMAS rutas del panel (platform.js y modulos.js), con sus validaciones y bitácora; quedan a nombre
 * de quien creó la conexión. No hay entrar como el dueño (SSO), pagos ni borrar negocios. Se guarda solo el SHA-256 del token.
 */
import { platformApi } from './platform.js';
import { modulosApi } from './modulos.js';

const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (t) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS mcp_admin_tokens (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER)').run();
  ready = true;
}

export async function mcpAdminTokens(req, env, path, email, origin) {
  await ensure(env);
  const id = path.split('/')[4];
  if (req.method === 'GET') return json({ tokens: (await env.DB.prepare('SELECT id, name, created_by AS email, created_at, last_used_at, revoked_at FROM mcp_admin_tokens ORDER BY created_at DESC').all()).results, url: `${origin}/mcp` });
  if (req.method === 'POST') {
    const b = await req.json().catch(() => ({})), name = String(b.name || '').trim().slice(0, 60);
    if (!name) return json({ error: 'Ponle un nombre a la conexión' }, 400);
    const token = `dwa_${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
    await env.DB.prepare('INSERT INTO mcp_admin_tokens (id, name, token_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), name, await sha(token), email, Date.now()).run();
    return json({ token, url: `${origin}/mcp` }, 201);
  }
  if (req.method === 'DELETE' && id) {
    await env.DB.prepare('UPDATE mcp_admin_tokens SET revoked_at = ? WHERE id = ?').bind(Date.now(), id).run();
    return json({ ok: true });
  }
  return json({ error: 'Método no permitido' }, 405);
}

const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const app = { type: 'string', description: 'Clave de la app (ver apps_listar), p. ej. rotaract (CD Rotary), academia, citas…' };
const neg = { type: 'string', description: 'id del negocio (ver negocios_listar)' };
// [nombre, descripción, esquema, escribe, (args) => [método, ruta del panel tras /admin/api/, cuerpo]]
const TOOLS = [
  ['apps_listar', 'Apps de la plataforma con su clave, nombre, dirección, precio y días de prueba.', S({}), false, () => ['GET', 'platform']],
  ['negocios_listar', 'Negocios de una app con dueño, plan, estado de pago y fecha de vencimiento. archivados=true para ver los archivados.', S({ app, archivados: { type: 'boolean' } }, ['app']), false,
    (a) => ['GET', `platform/${a.app}/businesses${a.archivados ? '?archived=1' : ''}`]],
  ['negocio_crear', 'Crea un negocio en una app y envía la invitación al correo del dueño (queda con los días de prueba de la app). Escribe: confirma antes con la persona.',
    S({ app, name: { type: 'string', description: 'Nombre del negocio' }, owner_email: { type: 'string', description: 'Correo del dueño (recibe la invitación)' }, owner_name: { type: 'string' },
      slug: { type: 'string', description: 'Dirección (opcional en algunas apps): minúsculas, números y guiones' }, trial_days: { type: 'integer' }, plan_id: { type: 'integer', description: 'Plan de módulos (ver modulos_app)' } }, ['app', 'name', 'owner_email']), true,
    (a) => ['POST', `platform/${a.app}/businesses`, { name: a.name, owner_email: a.owner_email, owner_name: a.owner_name, slug: a.slug, trial_days: a.trial_days, plan_id: a.plan_id }]],
  ['negocio_editar', 'Cambia nombre, dirección (slug; la vieja redirige) o la fecha hasta la que está pago (paid_until YYYY-MM-DD, null = sin límite). Escribe.',
    S({ app, id: neg, name: { type: 'string' }, slug: { type: 'string' }, paid_until: { type: ['string', 'null'] } }, ['app', 'id']), true,
    (a) => ['PATCH', `platform/${a.app}/businesses/${encodeURIComponent(a.id)}`, Object.fromEntries(['name', 'slug', 'paid_until'].filter((k) => k in a).map((k) => [k, a[k]]))]],
  ['negocio_dueno', 'Asigna el dueño de un negocio (o le reenvía el enlace de invitación). Escribe.', S({ app, id: neg, email: { type: 'string' }, name: { type: 'string' } }, ['app', 'id', 'email']), true,
    (a) => ['POST', `platform/${a.app}/businesses/${encodeURIComponent(a.id)}/users`, { email: a.email, name: a.name }]],
  ['negocio_restaurar', 'Saca un negocio del archivo (antes de 20 días). Escribe.', S({ app, id: neg }, ['app', 'id']), true, (a) => ['POST', `platform/${a.app}/businesses/${encodeURIComponent(a.id)}/restore`, {}]],
  ['modulos_app', 'Catálogo de módulos de una app y sus planes (id, nombre, precio, módulos).', S({ app }, ['app']), false, (a) => ['GET', `modulos/${a.app}`]],
  ['modulos_sincronizar', 'Trae a Módulos los negocios nuevos de la app (hazlo después de crear un negocio si modulos_negocio dice que no está). Escribe.', S({ app }, ['app']), true, (a) => ['POST', `modulos/${a.app}/sincronizar`, {}]],
  ['modulos_negocio', 'Módulos de un negocio: plan, cuáles están activos y sus excepciones.', S({ app, id: neg }, ['app', 'id']), false, (a) => ['GET', `modulos/${a.app}/negocios/${encodeURIComponent(a.id)}`]],
  ['modulos_plan', 'Pone un negocio en un plan de módulos. Escribe.', S({ app, id: neg, plan_id: { type: 'integer' }, nota: { type: 'string' } }, ['app', 'id', 'plan_id']), true,
    (a) => ['PUT', `modulos/${a.app}/negocios/${encodeURIComponent(a.id)}`, { plan_id: a.plan_id, nota: a.nota }]],
  ['modulos_excepcion', 'Agrega o quita un módulo a un negocio fuera de su plan (desde/hasta opcionales, YYYY-MM-DD). La nota (motivo) es obligatoria y queda en la bitácora. Escribe.',
    S({ app, id: neg, modulo: { type: 'string' }, modo: { type: 'string', enum: ['agregar', 'quitar'] }, nota: { type: 'string' }, desde: { type: 'string' }, hasta: { type: 'string' } }, ['app', 'id', 'modulo', 'modo', 'nota']), true,
    (a) => ['POST', `modulos/${a.app}/negocios/${encodeURIComponent(a.id)}/excepciones`, { modulo: a.modulo, modo: a.modo, nota: a.nota, desde: a.desde, hasta: a.hasta }]],
].map(([name, description, inputSchema, escribe, ruta]) => ({ name, description, inputSchema, escribe, ruta }));

async function ejecutar(env, t, args, email, origin) {
  const [method, ruta, body] = t.ruta(args || {});
  const path = `/admin/api/${ruta.split('?')[0]}`, url = new URL(`${origin}/admin/api/${ruta}`);
  const req = new Request(url, { method, headers: { 'content-type': 'application/json', 'x-app': '1' }, body: body && method !== 'GET' ? JSON.stringify(body) : undefined });
  const res = path.startsWith('/admin/api/modulos') ? await modulosApi(req, env, path, url, email) : await platformApi(req, env, path, url, email);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export async function mcpAdmin(req, env) {
  await ensure(env);
  const m = /^Bearer\s+(dwa_[0-9a-f]{64})$/i.exec(req.headers.get('authorization') || '');
  const fail = (id, code, message, status = 200) => json({ jsonrpc: '2.0', id, error: { code, message } }, status, status === 401 ? { 'www-authenticate': 'Bearer' } : {});
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const tk = m && await env.DB.prepare('SELECT id, created_by FROM mcp_admin_tokens WHERE token_hash = ? AND revoked_at IS NULL').bind(await sha(m[1])).first();
  if (!tk) return fail(null, -32001, 'Token no válido o revocado', 401);
  await env.DB.prepare('UPDATE mcp_admin_tokens SET last_used_at = ? WHERE id = ?').bind(Date.now(), tk.id).run();
  let msg; try { msg = await req.json(); } catch { return fail(null, -32700, 'JSON inválido', 400); }
  const { id = null, method, params = {} } = msg || {};
  const ok = (result) => json({ jsonrpc: '2.0', id, result });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(id, -32600, 'Petición no válida');
  if (method.startsWith('notifications/')) return new Response(null, { status: 202 });
  if (method === 'initialize') return ok({ protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'diwilo-admin', title: 'Diwilo Admin', version: '1.0.0' },
    instructions: 'Administración de los negocios de las apps de Diwilo (como /admin → Negocios). Las herramientas que escriben crean negocios, envían invitaciones y cambian módulos: confirma siempre con la persona antes de usarlas. Después de crear un negocio, si sus módulos no aparecen, usa modulos_sincronizar.' });
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.description, readOnlyHint: !t.escribe, destructiveHint: t.escribe } })) });
  if (method === 'tools/call') {
    const t = TOOLS.find((x) => x.name === params.name);
    if (!t) return fail(id, -32602, 'Herramienta no disponible');
    try {
      const r = await ejecutar(env, t, params.arguments, `${tk.created_by || 'mcp'} (MCP)`, new URL(req.url).origin);
      if (!r.ok) return ok({ isError: true, content: [{ type: 'text', text: r.data?.error || 'No se pudo' }] });
      return ok({ content: [{ type: 'text', text: JSON.stringify(r.data) }], structuredContent: Array.isArray(r.data) ? { rows: r.data } : r.data });
    } catch (e) { return ok({ isError: true, content: [{ type: 'text', text: `Error al ejecutar: ${e.message || e}` }] }); }
  }
  return fail(id, -32601, `Método no soportado: ${method}`);
}
