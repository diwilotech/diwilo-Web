/**
 * Conexión MCP de Diwilo (IA → Conexiones y API): el equipo conecta su propio asistente (Claude u otro) a los módulos de Diwilo
 * (Marketing, Finanzas, Marca…) igual que cada app lo hace con su negocio.
 *   GET/POST/DELETE /api/ia/tokens[/:id]   crear, ver y revocar conexiones (solo con Cloudflare Access; el token se muestra una vez)
 *   POST /mcp  con  Authorization: Bearer dwm_…   servidor MCP con las herramientas y guías de los módulos para el negocio «diwilo»
 * Se guarda solo el SHA-256 del token. Las herramientas que escriben se marcan para que el asistente pida confirmación.
 */
import { ctxFor } from './central.js';

const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
const wire = (n) => String(n).replace(/\./g, '_');
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (t) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mcp_tokens (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER)`).run();
  ready = true;
}
const need = (env) => { if (!env.MODULOS) throw new Error('Falta la conexión con Diwilo Modulos'); return env.MODULOS; };

export async function tokensApi(req, env, path, email, origin) {
  await ensure(env);
  const id = path.split('/')[4];
  if (req.method === 'GET') {
    const rows = (await env.DB.prepare('SELECT id, name, created_by AS email, created_at, last_used_at, revoked_at FROM mcp_tokens ORDER BY created_at DESC').all()).results;
    return json({ tokens: rows, url: `${origin}/mcp` });
  }
  if (req.method === 'POST') {
    const b = await req.json().catch(() => ({})), name = String(b.name || '').trim().slice(0, 60);
    if (!name) return json({ error: 'Ponle un nombre a la conexión' }, 400);
    const token = `dwm_${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
    await env.DB.prepare('INSERT INTO mcp_tokens (id, name, token_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), name, await sha(token), email, Date.now()).run();
    return json({ token, url: `${origin}/mcp` }, 201);
  }
  if (req.method === 'DELETE' && id) {
    await env.DB.prepare('UPDATE mcp_tokens SET revoked_at = ? WHERE id = ?').bind(Date.now(), id).run();
    return json({ ok: true });
  }
  return json({ error: 'Método no permitido' }, 405);
}

// Herramientas de los módulos para el negocio de Diwilo: lo que lee, y lo que escribe (marcado para confirmar). La IA de la plataforma (ai) solo en lectura.
async function herramientas(env) {
  return (await need(env).tools()).filter((t) => ['finanzas', 'marketing', 'nomina', 'marca', 'whatsapp'].includes(t.modulo) || (t.modulo === 'ai' && t.tipo !== 'escritura'));
}
const describe = (t) => ({ name: wire(t.name), description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: t.tipo !== 'escritura', destructiveHint: t.tipo === 'escritura', title: t.description } });

export async function mcpNegocio(req, env) {
  await ensure(env);
  const m = /^Bearer\s+(dwm_[0-9a-f]{64})$/i.exec(req.headers.get('authorization') || '');
  const fail = (id, code, message, status = 200) => json({ jsonrpc: '2.0', id, error: { code, message } }, status, status === 401 ? { 'www-authenticate': 'Bearer' } : {});
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const t = m && await env.DB.prepare('SELECT id, created_by FROM mcp_tokens WHERE token_hash = ? AND revoked_at IS NULL').bind(await sha(m[1])).first();
  if (!t) return fail(null, -32001, 'Token no válido o revocado', 401);
  await env.DB.prepare('UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?').bind(Date.now(), t.id).run();
  let msg; try { msg = await req.json(); } catch { return fail(null, -32700, 'JSON inválido', 400); }
  const { id = null, method, params = {} } = msg || {};
  const ok = (result) => json({ jsonrpc: '2.0', id, result });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(id, -32600, 'Petición no válida');
  if (method.startsWith('notifications/')) return new Response(null, { status: 202 });
  const ctx = { ...(await ctxFor(env, 'diwilo', t.created_by)), via: 'mcp' };
  if (method === 'initialize') return ok({ protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'diwilo', title: 'Diwilo', version: '1.0.0' },
    instructions: 'Herramientas de los módulos de Diwilo (Marketing, Finanzas, Marca). Pide confirmación antes de usar herramientas que escriben. Cada módulo tiene su guía: lee el recurso diwilo://<módulo>/guia.' });
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: (await herramientas(env)).map(describe) });
  const guias = async () => (await need(env).guias({ ...ctx, origin: new URL(req.url).origin })).filter((g) => g.modulo !== 'ai');
  if (method === 'resources/list') return ok({ resources: (await guias()).map((d) => ({ uri: `diwilo://${d.modulo}/guia`, name: `Guía de ${d.nombre}`, description: `Cómo usar el módulo ${d.nombre}`, mimeType: 'text/markdown' })) });
  if (method === 'resources/read') {
    const mid = /^diwilo:\/\/([a-z]+)\/guia$/.exec(String(params.uri || ''))?.[1], d = mid && (await guias()).find((x) => x.modulo === mid);
    return d ? ok({ contents: [{ uri: params.uri, mimeType: 'text/markdown', text: d.markdown }] }) : fail(id, -32002, 'Recurso no encontrado');
  }
  if (method === 'prompts/list') return ok({ prompts: (await guias()).flatMap((d) => d.flujos.map((f) => ({ name: `${d.modulo}_${f.id}`, title: f.nombre, description: f.descripcion || f.nombre }))) });
  if (method === 'prompts/get') {
    const [mid, ...rest] = String(params.name || '').split('_'), d = (await guias()).find((x) => x.modulo === mid), f = d?.flujos.find((x) => x.id === rest.join('_'));
    return f ? ok({ description: f.descripcion || f.nombre, messages: [{ role: 'user', content: { type: 'text', text: f.prompt } }] }) : fail(id, -32602, 'Prompt no encontrado');
  }
  if (method === 'tools/call') {
    const tool = (await herramientas(env)).find((x) => wire(x.name) === params.name || x.name === params.name);
    if (!tool) return fail(id, -32602, 'Herramienta no disponible');
    try {
      const r = await need(env).tool(ctx, tool.name, params.arguments || {});
      if (!r.ok) return ok({ isError: true, content: [{ type: 'text', text: r.error || 'No se pudo' }] });
      return ok({ content: [{ type: 'text', text: JSON.stringify(r.result) }], structuredContent: r.result });
    } catch (e) { return ok({ isError: true, content: [{ type: 'text', text: 'Error al ejecutar la herramienta' }] }); }
  }
  return fail(id, -32601, `Método no soportado: ${method}`);
}
