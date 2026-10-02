/**
 * diwilo — Worker de Cloudflare: sitio + gestión de diwilo.com
 *
 * Público (CORS para el sitio):
 *   /*                     sitio estático (archivos de la raíz del repo)
 *   POST /api/track        eventos y visitas
 *   POST /api/lead         formulario de contacto
 *   POST /api/chat         chat de IA del sitio
 *   GET  /l/:slug          link de rastreo (redirige y cuenta el clic)
 *   GET  /c/:slug          tarjeta de presentación   (/c/:slug.vcf descarga el contacto)
 * Integraciones (Authorization: Bearer dwl_...):
 *   GET  /v1/leads  /v1/events  /v1/chats  /v1/stats   POST /v1/links
 * Panel:
 *   GET  /admin            panel de gestión (contraseña ADMIN_PASSWORD)
 *   /admin/api/*           API interna del panel
 */
import ADMIN_HTML from './admin.html';
import { renderCard, renderVcf } from './card.js';

const DAY = 86400000;
const DEFAULT_PROMPT = `Eres el asistente virtual de Diwilo, una empresa de Medellín (Colombia) que diseña, construye y opera software de datos, automatización y agentes de IA para empresas, fundaciones y equipos de producto.

Servicios: analítica y ciencia de datos (Python, SQL, modelos predictivos); automatización de flujos (n8n, APIs, webhooks); agentes de IA y chatbots integrados a WhatsApp (Chatwoot, WhatsApp Business); extracción de datos (OCR, scraping, ETL); dashboards y tableros (Supabase, web dashboards); sitios y apps web.
Formas de trabajo: diagnóstico de automatización (1 a 2 semanas, primera sesión de 45 minutos sin costo); proyecto cerrado (4 a 12 semanas, sprints de dos semanas con demo); operación y soporte mensual.
Metodologías: Scrum, Kanban, CRISP-DM, MLOps, PMI. Datos tratados conforme a la Ley 1581 de 2012; se firma NDA si se necesita.
Casos: Dashboards PMO para construcción, automatizaciones con n8n, plataforma de Becas del Centenario Rotario, sitios para Madetableros, Fundación Amor por Medellín y Rotary Club Medellín.
Contacto: hola@diwilo.com · WhatsApp +57 305 384 0193 · https://wa.me/573053840193

Reglas: responde en español, breve (máximo 4 frases), cálido y concreto. No inventes precios: explica que dependen del alcance y ofrece el diagnóstico sin costo. Si la persona quiere avanzar, pídele nombre, empresa y correo o invítala a escribir por WhatsApp. Si no sabes algo, dilo y ofrece contacto humano. No hables de temas ajenos a Diwilo y sus servicios.`;

/* ---------------- utilidades ---------------- */
const now = () => Date.now();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const clip = (v, n = 500) => (v == null ? null : String(v).slice(0, n));
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function device(ua = '') {
  if (/bot|crawl|spider|slurp|preview/i.test(ua)) return 'bot';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'móvil';
  return 'escritorio';
}
function geo(req) {
  const cf = req.cf || {};
  return { country: cf.country || null, city: cf.city || null, device: device(req.headers.get('user-agent') || '') };
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes = 24) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(a || ''), sha256(b || '')]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
async function readJson(req, max = 20000) {
  const text = await req.text();
  if (text.length > max) throw new Error('too large');
  return text ? JSON.parse(text) : {};
}

/* ---------------- CORS ---------------- */
function allowedOrigin(env, origin) {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : null;
}
function cors(env, req, res) {
  const origin = allowedOrigin(env, req.headers.get('origin'));
  if (!origin) return res;
  const r = new Response(res.body, res);
  r.headers.set('access-control-allow-origin', origin);
  r.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  r.headers.set('access-control-allow-headers', 'content-type');
  r.headers.set('vary', 'origin');
  return r;
}

/* ---------------- ajustes ---------------- */
async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return { chat_prompt: s.chat_prompt || DEFAULT_PROMPT, webhook_url: s.webhook_url || '', chat_enabled: s.chat_enabled !== '0' };
}

/* Reenvía un evento a un webhook (n8n, Zapier, Make…) si está configurado */
async function fireWebhook(env, type, payload) {
  const { webhook_url } = await getSettings(env);
  if (!webhook_url) return;
  try {
    await fetch(webhook_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, at: new Date().toISOString(), data: payload }) });
  } catch (_) { /* el webhook no debe romper la respuesta */ }
}

/* ================= API PÚBLICA ================= */
async function apiTrack(req, env) {
  const b = await readJson(req, 4000);
  const g = geo(req);
  if (g.device === 'bot') return json({ ok: true });
  await env.DB.prepare(`INSERT INTO events (ts, type, path, label, ref, utm_source, utm_medium, utm_campaign, sid, country, city, device)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    now(), clip(b.type || 'pageview', 40), clip(b.path, 300), clip(b.label, 200), clip(b.ref, 300),
    clip(b.utm_source, 100), clip(b.utm_medium, 100), clip(b.utm_campaign, 100), clip(b.sid, 64),
    g.country, g.city, g.device).run();
  return json({ ok: true });
}

async function apiLead(req, env, ctx) {
  const b = await readJson(req, 10000);
  if (b.website) return json({ ok: true }); // campo trampa anti-spam
  if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return json({ ok: false, error: 'correo inválido' }, 400);
  const g = geo(req);
  const lead = {
    name: clip(b.name, 200), email: clip(b.email, 200), phone: clip(b.phone, 60), topics: clip(b.topics, 300),
    message: clip(b.message, 4000), page: clip(b.page, 300),
    utm_source: clip(b.utm_source, 100), utm_medium: clip(b.utm_medium, 100), utm_campaign: clip(b.utm_campaign, 100), country: g.country
  };
  const r = await env.DB.prepare(`INSERT INTO leads (ts, name, email, phone, topics, message, page, utm_source, utm_medium, utm_campaign, country)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(now(), lead.name, lead.email, lead.phone, lead.topics, lead.message, lead.page,
    lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.country).run();
  await env.DB.prepare('INSERT INTO events (ts, type, path, sid, country, city, device) VALUES (?,?,?,?,?,?,?)')
    .bind(now(), 'lead', lead.page, clip(b.sid, 64), g.country, g.city, g.device).run();
  ctx.waitUntil(fireWebhook(env, 'lead', { id: r.meta.last_row_id, ...lead }));
  return json({ ok: true, id: r.meta.last_row_id });
}

async function callAI(env, system, history) {
  // Gemini si hay clave configurada como secreto; si no, Workers AI de Cloudflare
  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 400, temperature: 0.5 }
      })
    });
    if (r.ok) {
      const d = await r.json();
      const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
      if (text) return text;
    }
    // si Gemini falla, seguimos con Workers AI
  }
  const out = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [{ role: 'system', content: system }, ...history],
    max_tokens: 400, temperature: 0.5
  });
  return String(out?.response ?? out?.choices?.[0]?.message?.content ?? '').trim();
}

async function apiChat(req, env, ctx) {
  const b = await readJson(req, 30000);
  const settings = await getSettings(env);
  if (!settings.chat_enabled) return json({ reply: 'El chat está en pausa. Escríbenos por WhatsApp al +57 305 384 0193 y te respondemos enseguida.' });
  const sid = clip(b.sid, 64);
  const text = clip((b.message || '').trim(), 1000);
  if (!sid || !text) return json({ error: 'mensaje vacío' }, 400);

  // límite: 20 mensajes por conversación cada 10 minutos
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM messages WHERE chat_id = ? AND role = 'user' AND ts > ?").bind(sid, now() - 10 * 60000).first();
  if (recent.n >= 20) return json({ reply: 'Has enviado muchos mensajes seguidos. Para seguir, escríbenos por WhatsApp: https://wa.me/573053840193' });

  const g = geo(req);
  await env.DB.prepare(`INSERT INTO chats (id, started_at, last_at, page, country, city, device, msg_count) VALUES (?,?,?,?,?,?,?,0)
    ON CONFLICT(id) DO UPDATE SET last_at = excluded.last_at`).bind(sid, now(), now(), clip(b.page, 300), g.country, g.city, g.device).run();
  await env.DB.prepare("INSERT INTO messages (chat_id, ts, role, content) VALUES (?,?,'user',?)").bind(sid, now(), text).run();

  const { results } = await env.DB.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY ts DESC, id DESC LIMIT 16').bind(sid).all();
  const history = results.reverse();

  let reply;
  try {
    reply = await callAI(env, settings.chat_prompt, history);
  } catch (e) {
    console.error('chat error', e);
  }
  if (!reply) reply = 'Ahora mismo no puedo responder. Escríbenos por WhatsApp al +57 305 384 0193 o a hola@diwilo.com.';
  await env.DB.batch([
    env.DB.prepare("INSERT INTO messages (chat_id, ts, role, content) VALUES (?,?,'assistant',?)").bind(sid, now() + 1, reply),
    env.DB.prepare('UPDATE chats SET msg_count = msg_count + 2, last_at = ? WHERE id = ?').bind(now(), sid)
  ]);
  if (history.length <= 1) ctx.waitUntil(fireWebhook(env, 'chat_started', { chat_id: sid, first_message: text, page: b.page, country: g.country }));
  return json({ reply });
}

/* ---------------- links y tarjetas ---------------- */
async function trackLink(req, env, ctx, slug) {
  const link = await env.DB.prepare('SELECT * FROM links WHERE slug = ?').bind(slug).first();
  if (!link) return Response.redirect(new URL(req.url).origin + '/', 302);
  let target;
  try { target = new URL(link.target, req.url); } catch { return Response.redirect(new URL(req.url).origin + '/', 302); }
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) if (link[k] && !target.searchParams.has(k)) target.searchParams.set(k, link[k]);
  const g = geo(req);
  if (g.device !== 'bot') {
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('INSERT INTO clicks (link_id, ts, country, city, device, ref) VALUES (?,?,?,?,?,?)').bind(link.id, now(), g.country, g.city, g.device, clip(req.headers.get('referer'), 300)),
      env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').bind(link.id)
    ]));
  }
  return new Response(null, { status: 302, headers: { location: target.toString(), 'cache-control': 'no-store' } });
}

async function showCard(req, env, ctx, slug) {
  const vcf = slug.endsWith('.vcf');
  const card = await env.DB.prepare('SELECT * FROM cards WHERE slug = ?').bind(vcf ? slug.slice(0, -4) : slug).first();
  if (!card) return new Response('Tarjeta no encontrada', { status: 404 });
  if (vcf) {
    return new Response(renderVcf(card), { headers: { 'content-type': 'text/vcard; charset=utf-8', 'content-disposition': `attachment; filename="${card.slug}.vcf"` } });
  }
  if (geo(req).device !== 'bot') ctx.waitUntil(env.DB.prepare('UPDATE cards SET views = views + 1 WHERE id = ?').bind(card.id).run());
  return new Response(renderCard(card, new URL(req.url).origin), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/* ================= ESTADÍSTICAS ================= */
async function stats(env, days = 7) {
  const since = now() - days * DAY, today = now() - DAY, live = now() - 5 * 60000;
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const [kpi, series, pages, refs, countries, devices, utm, liveRow] = await env.DB.batch([
    q(`SELECT
        (SELECT COUNT(*) FROM events WHERE type='pageview' AND ts > ?) views,
        (SELECT COUNT(DISTINCT sid) FROM events WHERE type='pageview' AND ts > ?) visitors,
        (SELECT COUNT(*) FROM events WHERE type='pageview' AND ts > ?) views_today,
        (SELECT COUNT(*) FROM leads WHERE ts > ?) leads,
        (SELECT COUNT(*) FROM chats WHERE started_at > ?) chats,
        (SELECT COUNT(*) FROM events WHERE type='click_whatsapp' AND ts > ?) whatsapp,
        (SELECT COUNT(*) FROM clicks WHERE ts > ?) link_clicks`, since, since, today, since, since, since, since),
    q(`SELECT (ts / 86400000) d, COUNT(*) views, COUNT(DISTINCT sid) visitors FROM events WHERE type='pageview' AND ts > ? GROUP BY d ORDER BY d`, since),
    q(`SELECT path k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? GROUP BY path ORDER BY n DESC LIMIT 8`, since),
    q(`SELECT ref k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? AND ref IS NOT NULL AND ref != '' GROUP BY ref ORDER BY n DESC LIMIT 8`, since),
    q(`SELECT country k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? GROUP BY country ORDER BY n DESC LIMIT 8`, since),
    q(`SELECT device k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? GROUP BY device ORDER BY n DESC`, since),
    q(`SELECT COALESCE(utm_source,'(directo)') || ' / ' || COALESCE(utm_campaign,'-') k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? GROUP BY k ORDER BY n DESC LIMIT 8`, since),
    q(`SELECT COUNT(DISTINCT sid) n FROM events WHERE ts > ?`, live)
  ]);
  return {
    days, kpi: kpi.results[0], live: liveRow.results[0].n,
    series: series.results.map((r) => ({ date: new Date(r.d * DAY).toISOString().slice(0, 10), views: r.views, visitors: r.visitors })),
    pages: pages.results, refs: refs.results, countries: countries.results, devices: devices.results, utm: utm.results
  };
}

/* ================= API EXTERNA (claves) ================= */
async function checkApiKey(req, env) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(dwl_[a-f0-9]+)$/i);
  if (!m) return false;
  const row = await env.DB.prepare('SELECT id FROM api_keys WHERE hash = ? AND revoked = 0').bind(await sha256(m[1])).first();
  if (!row) return false;
  await env.DB.prepare('UPDATE api_keys SET last_used = ? WHERE id = ?').bind(now(), row.id).run();
  return true;
}

async function externalApi(req, env, path, url) {
  if (!(await checkApiKey(req, env))) return json({ error: 'API key inválida' }, 401);
  const since = Number(url.searchParams.get('since') || 0);
  const limit = Math.min(500, Number(url.searchParams.get('limit') || 100));
  if (req.method === 'GET' && path === '/v1/leads') return json((await env.DB.prepare('SELECT * FROM leads WHERE ts > ? ORDER BY ts DESC LIMIT ?').bind(since, limit).all()).results);
  if (req.method === 'GET' && path === '/v1/events') return json((await env.DB.prepare('SELECT * FROM events WHERE ts > ? ORDER BY ts DESC LIMIT ?').bind(since, limit).all()).results);
  if (req.method === 'GET' && path === '/v1/chats') {
    const chats = (await env.DB.prepare('SELECT * FROM chats WHERE last_at > ? ORDER BY last_at DESC LIMIT ?').bind(since, limit).all()).results;
    return json(chats);
  }
  if (req.method === 'GET' && path.startsWith('/v1/chats/')) {
    return json((await env.DB.prepare('SELECT role, content, ts FROM messages WHERE chat_id = ? ORDER BY ts').bind(path.slice(10)).all()).results);
  }
  if (req.method === 'GET' && path === '/v1/stats') return json(await stats(env, Number(url.searchParams.get('days') || 7)));
  if (req.method === 'POST' && path === '/v1/links') return json(await saveLink(env, await readJson(req)), 201);
  return json({ error: 'no encontrado' }, 404);
}

/* ================= PANEL ================= */
const COOKIE = 'dwl_session';
async function isAdmin(req, env) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([a-f0-9]+)`));
  if (!m) return false;
  const row = await env.DB.prepare('SELECT expires FROM sessions WHERE token = ?').bind(await sha256(m[1])).first();
  return !!row && row.expires > now();
}

async function saveLink(env, b) {
  const slug = slugify(b.slug || b.title || randomToken(3));
  if (!slug) throw new Error('slug requerido');
  try { new URL(b.target); } catch { throw new Error('URL de destino inválida'); }
  const vals = [clip(b.title, 200), clip(b.target, 1000), clip(b.utm_source, 100), clip(b.utm_medium, 100), clip(b.utm_campaign, 100)];
  if (b.id) {
    await env.DB.prepare('UPDATE links SET slug=?, title=?, target=?, utm_source=?, utm_medium=?, utm_campaign=? WHERE id=?').bind(slug, ...vals, b.id).run();
    return { id: b.id, slug };
  }
  const r = await env.DB.prepare('INSERT INTO links (slug, title, target, utm_source, utm_medium, utm_campaign, created_at) VALUES (?,?,?,?,?,?,?)').bind(slug, ...vals, now()).run();
  return { id: r.meta.last_row_id, slug };
}

async function saveCard(env, b) {
  const slug = slugify(b.slug || b.name);
  if (!slug || !b.name) throw new Error('nombre requerido');
  const fields = ['name', 'role', 'company', 'bio', 'phone', 'whatsapp', 'email', 'website', 'instagram', 'linkedin', 'photo_url'];
  const vals = fields.map((f) => clip(b[f], f === 'bio' ? 600 : 300));
  if (b.id) {
    await env.DB.prepare(`UPDATE cards SET slug=?, ${fields.map((f) => f + '=?').join(', ')} WHERE id=?`).bind(slug, ...vals, b.id).run();
    return { id: b.id, slug };
  }
  const r = await env.DB.prepare(`INSERT INTO cards (slug, ${fields.join(', ')}, created_at) VALUES (?, ${fields.map(() => '?').join(', ')}, ?)`).bind(slug, ...vals, now()).run();
  return { id: r.meta.last_row_id, slug };
}

async function adminApi(req, env, path, url) {
  // login / logout no requieren sesión
  if (path === '/admin/api/login' && req.method === 'POST') {
    const b = await readJson(req, 2000);
    if (!env.ADMIN_PASSWORD || !(await safeEqual(b.password, env.ADMIN_PASSWORD))) {
      await new Promise((r) => setTimeout(r, 800));
      return json({ error: 'Contraseña incorrecta' }, 401);
    }
    const token = randomToken();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()),
      env.DB.prepare('INSERT INTO sessions (token, expires) VALUES (?, ?)').bind(await sha256(token), now() + 14 * DAY)
    ]);
    return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${14 * 86400}` });
  }
  if (path === '/admin/api/logout') {
    return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }
  if (!(await isAdmin(req, env))) return json({ error: 'sesión requerida' }, 401);

  const M = req.method;
  const id = Number(url.searchParams.get('id') || 0);
  const db = env.DB;

  if (path === '/admin/api/stats') return json(await stats(env, Math.min(90, Number(url.searchParams.get('days') || 7))));
  if (path === '/admin/api/live') {
    const since = Number(url.searchParams.get('since') || now() - 30 * 60000);
    const [events, live] = await db.batch([
      db.prepare('SELECT * FROM events WHERE ts > ? ORDER BY ts DESC LIMIT 60').bind(since),
      db.prepare('SELECT path, country, device, MAX(ts) ts FROM events WHERE ts > ? GROUP BY sid ORDER BY ts DESC').bind(now() - 5 * 60000)
    ]);
    return json({ events: events.results, live: live.results, now: now() });
  }

  if (path === '/admin/api/links') {
    if (M === 'GET') return json((await db.prepare('SELECT * FROM links ORDER BY created_at DESC').all()).results);
    if (M === 'POST') return json(await saveLink(env, await readJson(req)));
    if (M === 'DELETE') { await db.batch([db.prepare('DELETE FROM clicks WHERE link_id=?').bind(id), db.prepare('DELETE FROM links WHERE id=?').bind(id)]); return json({ ok: true }); }
  }
  if (path === '/admin/api/link-clicks') {
    const [byDay, byCountry, byDevice] = await db.batch([
      db.prepare('SELECT (ts/86400000) d, COUNT(*) n FROM clicks WHERE link_id=? GROUP BY d ORDER BY d DESC LIMIT 30').bind(id),
      db.prepare('SELECT country k, COUNT(*) n FROM clicks WHERE link_id=? GROUP BY country ORDER BY n DESC LIMIT 8').bind(id),
      db.prepare('SELECT device k, COUNT(*) n FROM clicks WHERE link_id=? GROUP BY device ORDER BY n DESC').bind(id)
    ]);
    return json({ byDay: byDay.results.map((r) => ({ date: new Date(r.d * DAY).toISOString().slice(0, 10), n: r.n })), byCountry: byCountry.results, byDevice: byDevice.results });
  }

  if (path === '/admin/api/cards') {
    if (M === 'GET') return json((await db.prepare('SELECT * FROM cards ORDER BY created_at DESC').all()).results);
    if (M === 'POST') return json(await saveCard(env, await readJson(req)));
    if (M === 'DELETE') { await db.prepare('DELETE FROM cards WHERE id=?').bind(id).run(); return json({ ok: true }); }
  }

  if (path === '/admin/api/chats') {
    const chatId = url.searchParams.get('chat');
    if (M === 'GET' && chatId) return json((await db.prepare('SELECT role, content, ts FROM messages WHERE chat_id=? ORDER BY ts, id').bind(chatId).all()).results);
    if (M === 'GET') return json((await db.prepare(`SELECT c.*, (SELECT content FROM messages m WHERE m.chat_id=c.id AND role='user' ORDER BY ts LIMIT 1) first
      FROM chats c ORDER BY last_at DESC LIMIT 200`).all()).results);
    if (M === 'DELETE' && chatId) { await db.batch([db.prepare('DELETE FROM messages WHERE chat_id=?').bind(chatId), db.prepare('DELETE FROM chats WHERE id=?').bind(chatId)]); return json({ ok: true }); }
  }

  if (path === '/admin/api/leads') {
    if (M === 'GET') return json((await db.prepare('SELECT * FROM leads ORDER BY ts DESC LIMIT 500').all()).results);
    if (M === 'POST') { const b = await readJson(req); await db.prepare('UPDATE leads SET status=? WHERE id=?').bind(clip(b.status, 30), b.id).run(); return json({ ok: true }); }
    if (M === 'DELETE') { await db.prepare('DELETE FROM leads WHERE id=?').bind(id).run(); return json({ ok: true }); }
  }

  if (path === '/admin/api/settings') {
    if (M === 'GET') return json({ ...(await getSettings(env)), default_prompt: DEFAULT_PROMPT, ai_provider: env.GEMINI_API_KEY ? 'Gemini' : 'Workers AI (Cloudflare)' });
    if (M === 'POST') {
      const b = await readJson(req, 20000);
      const stmts = [];
      for (const k of ['chat_prompt', 'webhook_url', 'chat_enabled']) {
        if (k in b) stmts.push(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, clip(String(b[k]), 15000)));
      }
      if (stmts.length) await db.batch(stmts);
      return json({ ok: true });
    }
  }
  if (path === '/admin/api/webhook-test' && M === 'POST') {
    await fireWebhook(env, 'test', { message: 'Prueba desde el panel de Diwilo' });
    return json({ ok: true });
  }

  if (path === '/admin/api/keys') {
    if (M === 'GET') return json((await db.prepare('SELECT id, name, prefix, created_at, last_used, revoked FROM api_keys ORDER BY created_at DESC').all()).results);
    if (M === 'POST') {
      const b = await readJson(req);
      const key = 'dwl_' + randomToken(20);
      await db.prepare('INSERT INTO api_keys (name, prefix, hash, created_at) VALUES (?,?,?,?)').bind(clip(b.name || 'Integración', 80), key.slice(0, 10), await sha256(key), now()).run();
      return json({ key }); // se muestra una sola vez
    }
    if (M === 'DELETE') { await db.prepare('UPDATE api_keys SET revoked=1 WHERE id=?').bind(id).run(); return json({ ok: true }); }
  }

  return json({ error: 'no encontrado' }, 404);
}

/* ================= ROUTER ================= */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path.startsWith('/api/')) {
        if (req.method === 'OPTIONS') return cors(env, req, new Response(null, { status: 204 }));
        if (req.method !== 'POST') return json({ error: 'método no permitido' }, 405);
        let res;
        if (path === '/api/track') res = await apiTrack(req, env);
        else if (path === '/api/lead') res = await apiLead(req, env, ctx);
        else if (path === '/api/chat') res = await apiChat(req, env, ctx);
        else res = json({ error: 'no encontrado' }, 404);
        return cors(env, req, res);
      }
      if (path.startsWith('/l/')) return trackLink(req, env, ctx, decodeURIComponent(path.slice(3)));
      if (path.startsWith('/c/')) return showCard(req, env, ctx, decodeURIComponent(path.slice(3)));
      if (path.startsWith('/v1/')) return externalApi(req, env, path, url);
      if (path.startsWith('/admin/api/')) return adminApi(req, env, path, url);
      if (path === '/admin') {
        return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin', 'cache-control': 'no-store' } });
      }
      // Todo lo demás es el sitio estático
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);
      return json({ error: e.message || 'error' }, e.message === 'too large' ? 413 : 400);
    }
  }
};
