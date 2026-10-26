/**
 * Videos para redes con Higgsfield (Kling 2.6 texto → video). La clave («id:secreto») se pega en IA → Modelo de IA → Claves de IA (queda cifrada en Diwilo Modulos); el secreto HIGGSFIELD_API_KEY de este Worker sirve de respaldo.
 * Los crea una persona (pestaña Contenido) o un agente de IA (herramienta crear_video, que lee antes la marca). Se guardan en la tabla social_videos.
 *   GET    /admin/api/videos        últimos videos (los que siguen en proceso se actualizan al consultar)
 *   POST   /admin/api/videos        { prompt, duration: 5|10, aspect_ratio: '16:9'|'9:16'|'1:1', sound: 'on'|'off' }
 *   DELETE /admin/api/videos/<id>   quita el video de la lista
 * Docs: https://docs.higgsfield.ai (estados: queued, in_progress, completed, failed, nsfw, canceled; los enlaces de salida caducan).
 */
import { seleccionIA } from './claude.js';

const BASE = 'https://api.higgsfield.ai';
const MODELO = '/kling-video/v2.6/pro/text-to-video';
const FINAL = ['completed', 'failed', 'nsfw', 'canceled'];
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const now = () => Date.now();

let ready = false;
async function ensureTable(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL, prompt TEXT NOT NULL, duration INTEGER NOT NULL, aspect_ratio TEXT NOT NULL, sound TEXT NOT NULL,
    status TEXT NOT NULL, url TEXT, error TEXT, source TEXT NOT NULL DEFAULT 'manual', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
  ready = true;
}
// Claves de Higgsfield: las guardadas en Modelo de IA primero y el secreto del Worker de última opción
const claveHF = async (env) => [...((await seleccionIA(env)).claves?.higgsfield || []), env.HIGGSFIELD_API_KEY].filter(Boolean)[0] || null;
const headers = (clave) => ({ authorization: `Key ${clave}`, 'content-type': 'application/json' });
const fail = (d, r) => (typeof d.error === 'string' ? d.error : typeof d.detail === 'string' ? d.detail : `Higgsfield respondió ${r.status}`);

// Envía el video a Higgsfield y lo deja registrado. Lo usan la pestaña y la herramienta crear_video de los agentes.
export async function submitVideo(env, { prompt, duration, aspect_ratio, sound, source = 'manual' }) {
  const clave = await claveHF(env);
  if (!clave) throw new Error('Falta la clave de Higgsfield: pégala en IA → Modelo de IA → Claves de IA');
  await ensureTable(env);
  const body = {
    prompt: String(prompt || '').trim().slice(0, 2500),
    duration: Number(duration) === 10 ? 10 : 5,
    aspect_ratio: ['16:9', '9:16', '1:1'].includes(aspect_ratio) ? aspect_ratio : '9:16',
    sound: sound === 'off' ? 'off' : 'on',
  };
  if (!body.prompt) throw new Error('Escribe qué video quieres');
  const r = await fetch(BASE + MODELO, { method: 'POST', headers: headers(clave), body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.request_id) throw new Error(fail(d, r));
  const t = now();
  const ins = await env.DB.prepare('INSERT INTO social_videos (request_id, prompt, duration, aspect_ratio, sound, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(d.request_id, body.prompt, body.duration, body.aspect_ratio, body.sound, d.status || 'queued', String(source).slice(0, 80), t, t).run();
  return { id: ins.meta.last_row_id, estado: d.status || 'queued', ...body };
}

async function refresh(env, v, clave) {
  const r = await fetch(`${BASE}/requests/${encodeURIComponent(v.request_id)}/status`, { headers: headers(clave) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return v;
  const error = d.error ? (typeof d.error === 'string' ? d.error : JSON.stringify(d.error)) : v.error;
  const up = { status: d.status || v.status, url: d.video?.url || v.url || null, error: error || null };
  await env.DB.prepare('UPDATE social_videos SET status = ?, url = ?, error = ?, updated_at = ? WHERE id = ?').bind(up.status, up.url, up.error, now(), v.id).run();
  return { ...v, ...up };
}

export async function videosApi(req, env, path, email) {
  await ensureTable(env);
  const id = Number(path.split('/')[4]) || 0;
  if (req.method === 'GET' && !id) {
    const { results } = await env.DB.prepare('SELECT * FROM social_videos ORDER BY created_at DESC LIMIT 40').all();
    const clave = await claveHF(env);
    const rows = clave ? await Promise.all(results.map((v) => (FINAL.includes(v.status) ? v : refresh(env, v, clave).catch(() => v)))) : results;
    return json({ configured: !!clave, rows });
  }
  if (req.method === 'POST' && !id) {
    if (req.headers.get('x-app') !== '1') return json({ error: 'Falta la cabecera x-app' }, 403);
    const b = await req.json().catch(() => ({}));
    try { const v = await submitVideo(env, { ...b, source: `manual:${email}` }); console.log('video', email, v.id); return json(v, 201); }
    catch (e) { return json({ error: e.message }, /^Falta|^Escribe/.test(e.message) ? 400 : 502); }
  }
  if (req.method === 'DELETE' && id) {
    if (req.headers.get('x-app') !== '1') return json({ error: 'Falta la cabecera x-app' }, 403);
    await env.DB.prepare('DELETE FROM social_videos WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: 'No encontrado' }, 404);
}
