/**
 * Claude (Anthropic) para la IA de Diwilo Admin: chat del sitio, IA Diwilo del panel y agentes.
 * Qué modelo se usa lo elige el propio panel (Integraciones e IA → Modelo de IA) y se guarda en Diwilo Modulos, igual para todas las apps;
 * aquí solo se consulta (con caché corta). La clave es el secreto ANTHROPIC_API_KEY de ESTE Worker (y otra igual en el de Diwilo Modulos).
 */
import { ccall } from './central.js';

let cache = { at: 0, v: null };
// { proveedor: 'auto'|'claude'|'gemini'|'workers-ai', modelo: <modelo de Claude> }
export async function seleccionIA(env) {
  if (cache.v && Date.now() - cache.at < 30000) return cache.v;
  let v = { proveedor: 'auto', modelo: 'claude-sonnet-5-5' };
  try {
    const r = await ccall(env, 'diwilo', null, 'GET', '/api/ai/proveedor');
    const d = JSON.parse(r.body);
    if (r.status < 300 && d.proveedor) v = { proveedor: d.proveedor, modelo: d.proveedores?.claude?.modelo || v.modelo };
  } catch (_) {}
  cache = { at: Date.now(), v };
  return v;
}
export const olvidarSeleccion = () => { cache = { at: 0, v: null }; };

// Claude por la API de mensajes. Los turnos seguidos del mismo rol se juntan y siempre empieza un turno del usuario.
export async function viaClaude(env, { system, history, maxTokens, temperature, modelo }) {
  const msgs = [];
  for (const m of history) { const role = m.role === 'assistant' ? 'assistant' : 'user', c = String(m.content ?? ''); if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n\n${c}`; else msgs.push({ role, content: c }); }
  if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '.' });
  const pedir = (conTemp) => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system, messages: msgs, ...(conTemp ? { temperature } : {}) }) });
  let r = await pedir(true);
  if (r.status === 400 && /temperature/i.test(await r.clone().text())) r = await pedir(false);
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json(), text = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error('Claude no respondió');
  return { text, tin: d.usage?.input_tokens ?? 0, tout: d.usage?.output_tokens ?? 0 };
}

// Panel: GET/PUT /admin/api/ia-model y POST /admin/api/ia-model/probar. Se pasa tal cual al módulo central (solo responde al negocio «diwilo»).
export async function iaModelApi(req, env, path, email) {
  const sub = path.replace('/admin/api/ia-model', '');
  const body = req.method === 'GET' ? undefined : await req.json().catch(() => ({}));
  const r = await ccall(env, 'diwilo', email, req.method, sub === '/probar' ? '/api/ai/proveedor/probar' : '/api/ai/proveedor', { body });
  olvidarSeleccion();
  let d = {}; try { d = JSON.parse(r.body); } catch (_) {}
  // Este Worker tiene sus propias claves (la IA del sitio y del panel corre aquí): se informa si están puestas
  if (r.status < 300 && req.method === 'GET') d.este_worker = { claude: !!env.ANTHROPIC_API_KEY, gemini: !!env.GEMINI_API_KEY, 'workers-ai': !!env.AI };
  return new Response(JSON.stringify(d), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
