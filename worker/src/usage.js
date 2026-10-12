/**
 * Consumo de IA: cuenta los tokens de cada llamada (por día, origen y proveedor), estima el costo
 * y frena el gasto con un tope diario y un tope por ejecución de agente.
 *   GET   /admin/api/usage           resumen: hoy, mes, últimos 30 días, por origen, topes y precios
 *   PATCH /admin/api/usage           { daily_limit?, run_limit?, usd_cop?, prices? } cambiar topes y precios
 * Orígenes: 'chat-sitio' (chat público), 'ia-diwilo' (asistente del panel), 'agente:<nombre>', 'informes' y 'otros'.
 * Las tablas se crean solas la primera vez.
 */
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const day = (ts = Date.now()) => new Date(ts - 5 * 3600000).toISOString().slice(0, 10); // día en Colombia

// Precios por millón de tokens en USD (estimados; se pueden ajustar en el panel)
const DEFAULTS = {
  daily_limit: 1500000, // tokens por día entre todo; al llegar, la IA se pausa hasta mañana (el chat del sitio pasa a WhatsApp)
  run_limit: 150000,    // tokens por ejecución de un agente; al llegar, el agente para y entrega lo que alcanzó
  usd_cop: 4000,
  images_daily: 20,     // portadas generadas con IA por día
  image_usd: 0.0007,    // costo estimado por imagen (FLUX.1 schnell 1024×1024, 6 pasos)
  prices: { gemini: { in: 0.30, out: 2.50 }, 'workers-ai': { in: 0.29, out: 2.25 } },
};

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ai_usage (
      day TEXT NOT NULL, source TEXT NOT NULL, provider TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0,
      tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, source, provider))`),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_usage_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)'),
  ]);
  ready = true;
}

export async function usageSettings(env) {
  await ensure(env);
  const { results } = await env.DB.prepare('SELECT k, v FROM ai_usage_settings').all();
  const s = { ...DEFAULTS, prices: { ...DEFAULTS.prices } };
  for (const r of results) { try { s[r.k] = JSON.parse(r.v); } catch {} }
  return s;
}

export class BudgetError extends Error { constructor(m) { super(m); this.budget = true; } }
export const QUOTA_MSG = 'Se acabó la cuota gratis diaria de Workers AI de Cloudflare (10.000 neuronas). Se renueva a las 7:00 p. m. (hora Colombia). Para no depender de ella: plan Workers Paid de Cloudflare o una clave de Gemini.';

// Neuronas estimadas de Workers AI (la unidad con la que Cloudflare cobra y mide la cuota gratis diaria de 10.000):
// Llama 3.3 70B fp8-fast ≈ 26.668 por millón de tokens leídos y 204.805 por millón escritos; FLUX.1 schnell 1024×1024 a 6 pasos ≈ 77 por imagen.
const neurons = (rows) => Math.round(rows.reduce((t, r) => t + (r.provider === 'workers-ai' ? (r.tokens_in * 26668 + r.tokens_out * 204805) / 1e6 : r.provider === 'workers-ai-imagen' ? r.calls * 77 : 0), 0));

let cache = { at: 0, day: '', total: 0, limit: 0 };
// Lanza BudgetError si ya se gastó el tope del día (se revisa en la base cada 20 s como máximo)
export async function checkBudget(env) {
  const d = day();
  if (Date.now() - cache.at > 20000 || cache.day !== d) {
    const s = await usageSettings(env);
    const r = await env.DB.prepare('SELECT COALESCE(SUM(tokens_in + tokens_out), 0) t FROM ai_usage WHERE day = ?').bind(d).first();
    cache = { at: Date.now(), day: d, total: r.t, limit: Number(s.daily_limit) || 0 };
  }
  if (cache.limit && cache.total >= cache.limit) throw new BudgetError(`Se llegó al tope diario de IA (${cache.limit.toLocaleString('es-CO')} tokens). Se reanuda mañana o súbelo en Integraciones e IA → Consumo.`);
}

export async function recordUsage(env, { source = 'otros', provider, tin = 0, tout = 0 }) {
  try {
    await ensure(env);
    await env.DB.prepare(`INSERT INTO ai_usage (day, source, provider, calls, tokens_in, tokens_out) VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(day, source, provider) DO UPDATE SET calls = calls + 1, tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out`)
      .bind(day(), String(source).slice(0, 80), provider, Math.round(tin), Math.round(tout)).run();
    if (cache.day === day()) cache.total += tin + tout;
  } catch (e) { console.error('consumo', e.message); }
}

const cost = (rows, s) => rows.reduce((t, r) => {
  if (r.provider === 'workers-ai-imagen') return t + r.calls * (Number(s.image_usd) || 0);
  const p = s.prices[r.provider] || { in: 0, out: 0 }; return t + (r.tokens_in * p.in + r.tokens_out * p.out) / 1e6;
}, 0);

export async function usageApi(req, env) {
  await ensure(env);
  if (req.method === 'PATCH') {
    const b = await req.json().catch(() => ({}));
    const put = [];
    const num = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
    if (b.daily_limit !== undefined) { const n = num(b.daily_limit, 0, 1e9); if (n === null) return json({ error: 'Tope diario no válido' }, 400); put.push(['daily_limit', n]); }
    if (b.run_limit !== undefined) { const n = num(b.run_limit, 5000, 1e8); if (n === null) return json({ error: 'El tope por ejecución debe ser de al menos 5.000 tokens' }, 400); put.push(['run_limit', n]); }
    if (b.usd_cop !== undefined) { const n = num(b.usd_cop, 1000, 20000); if (n === null) return json({ error: 'Tasa del dólar no válida' }, 400); put.push(['usd_cop', n]); }
    if (b.images_daily !== undefined) { const n = num(b.images_daily, 0, 1000); if (n === null) return json({ error: 'Tope de imágenes no válido' }, 400); put.push(['images_daily', n]); }
    if (b.image_usd !== undefined) { const n = Number(b.image_usd); if (!(n >= 0 && n < 1)) return json({ error: 'Costo por imagen no válido' }, 400); put.push(['image_usd', n]); }
    if (b.prices && typeof b.prices === 'object') {
      const p = {};
      for (const k of Object.keys(DEFAULTS.prices)) { const x = b.prices[k] || {}; p[k] = { in: Math.max(0, Number(x.in) || 0), out: Math.max(0, Number(x.out) || 0) }; }
      put.push(['prices', p]);
    }
    if (put.length) await env.DB.batch(put.map(([k, v]) => env.DB.prepare('INSERT INTO ai_usage_settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v))));
    cache.at = 0;
    return json({ ok: true });
  }
  const s = await usageSettings(env);
  const today = day(), month = today.slice(0, 7), from = day(Date.now() - 29 * 86400000);
  const { results: rows } = await env.DB.prepare('SELECT * FROM ai_usage WHERE day >= ? OR day LIKE ? ORDER BY day').bind(from, month + '%').all();
  const sum = (list) => ({ calls: list.reduce((a, r) => a + r.calls, 0), tokens_in: list.reduce((a, r) => a + r.tokens_in, 0), tokens_out: list.reduce((a, r) => a + r.tokens_out, 0), usd: cost(list, s), images: list.filter((r) => r.provider === 'workers-ai-imagen').reduce((a, r) => a + r.calls, 0) });
  const group = (list, key) => Object.values(list.reduce((m, r) => { const k = key(r); (m[k] ||= { key: k, rows: [] }).rows.push(r); return m; }, {})).map((g) => ({ key: g.key, ...sum(g.rows) }));
  const monthRows = rows.filter((r) => r.day.startsWith(month)), todayRows = rows.filter((r) => r.day === today);
  const days = [];
  for (let i = 29; i >= 0; i--) { const d = day(Date.now() - i * 86400000); days.push({ day: d, ...sum(rows.filter((r) => r.day === d)) }); }
  const dayOfMonth = Number(today.slice(8, 10)), daysInMonth = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const m = sum(monthRows);
  return json({
    today: { ...sum(todayRows), neurons: neurons(todayRows) }, month: m, free_neurons: env.GEMINI_API_KEY ? null : 10000, projection_usd: m.usd / dayOfMonth * daysInMonth,
    days, by_source: group(monthRows, (r) => r.source).sort((a, b) => b.usd - a.usd), by_source_today: group(todayRows, (r) => r.source).sort((a, b) => (b.tokens_in + b.tokens_out) - (a.tokens_in + a.tokens_out)),
    provider: env.GEMINI_API_KEY ? `Gemini (${env.GEMINI_MODEL || 'gemini-2.5-flash'})` : 'Workers AI (Cloudflare)',
    settings: s,
  });
}
