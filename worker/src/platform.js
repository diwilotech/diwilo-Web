/**
 * Plataforma Diwilo: desde /admin se crean los negocios de cada app, se invita a sus usuarios y se
 * manejan las suscripciones. Cada app expone el mismo contrato en /api/platform/* (Bearer
 * PLATFORM_KEY); Diwilo la llama por service binding (o por su URL pública si no hay binding).
 *
 * La app guarda solo `paid_until` ('YYYY-MM-DD', inclusive; null = sin límite) y queda en solo
 * lectura cuando vence. El historial de pagos vive aquí, en la tabla sub_payments.
 *
 *   GET    /admin/api/platform                                   apps + precios + días de prueba
 *   POST   /admin/api/platform/config                            { trial_days, price_<app> }
 *   GET    /admin/api/platform/:app/businesses
 *   POST   /admin/api/platform/:app/businesses                   { name, slug?, owner_email, owner_name?, trial_days? }
 *   PATCH  /admin/api/platform/:app/businesses/:id               { name?, paid_until? }
 *   GET    /admin/api/platform/:app/businesses/:id/payments
 *   POST   /admin/api/platform/:app/businesses/:id/payments      { months, amount, note? }
 *   POST   /admin/api/platform/:app/businesses/:id/users         { email, name?, role }
 *   DELETE /admin/api/platform/:app/businesses/:id/users/:userId
 */
export const APPS = {
  pedidos: { name: 'Pedidos', binding: 'PEDIDOS', url: 'PEDIDOS_URL', roles: ['owner', 'staff'], slug: false },
  nutricion: { name: 'Nutrición', binding: 'NUTRICION', url: 'NUTRICION_URL', roles: ['owner', 'admin', 'staff'], slug: 'optional' },
  citas: { name: 'Citas', binding: 'CITAS', url: 'CITAS_URL', roles: ['owner', 'staff'], slug: 'required' },
  residentes: { name: 'Residentes', binding: 'RESIDENTES', url: 'RESIDENTES_URL', roles: ['owner', 'admin', 'staff'], slug: 'optional' },
};
const DEFAULT_TRIAL_DAYS = 15;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Fechas en hora de Colombia (UTC-5, sin horario de verano).
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// 2026-01-31 + 1 mes = 2026-02-28 (no se desborda al mes siguiente).
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

async function callApp(env, app, method, path, body) {
  const cfg = APPS[app];
  const base = (env[cfg.url] || 'https://app.internal').replace(/\/+$/, '');
  const svc = env[cfg.binding];
  if (!env.PLATFORM_KEY) throw new AppError(503, 'Falta el secreto PLATFORM_KEY en Diwilo Web');
  if (!svc && !env[cfg.url]) throw new AppError(503, `${cfg.name} no está conectada (falta el service binding ${cfg.binding} o ${cfg.url})`);
  const init = {
    method,
    headers: { authorization: `Bearer ${env.PLATFORM_KEY}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  let res;
  try {
    res = svc ? await svc.fetch(`${base}/api/platform${path}`, init) : await fetch(`${base}/api/platform${path}`, init);
  } catch (e) {
    throw new AppError(502, `${cfg.name} no responde: ${e.message}`);
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401) throw new AppError(502, `${cfg.name} rechazó la clave: revisa que PLATFORM_KEY sea igual en los dos proyectos`);
  if (!res.ok) throw new AppError(res.status >= 500 ? 502 : res.status, data.error || `${cfg.name} respondió ${res.status}`);
  return data;
}

async function config(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'platform_%'").all();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return {
    trial_days: Number(s.platform_trial_days ?? DEFAULT_TRIAL_DAYS),
    prices: Object.fromEntries(Object.keys(APPS).map((a) => [a, Number(s[`platform_price_${a}`] || 0)])),
  };
}

const inviteUrl = (env, app, path) => (path ? (env[APPS[app].url] || '').replace(/\/+$/, '') + path : null);
const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n));

export async function platformApi(req, env, path, url, adminEmail) {
  try {
    return await route(req, env, path, url, adminEmail);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    throw e;
  }
}

async function route(req, env, path, url, adminEmail) {
  const M = req.method;
  const db = env.DB;
  // /admin/api/platform/:app/businesses/:id/:sub/:subId
  const [, , , app, resource, id, sub, subId] = path.split('/').filter(Boolean);

  if (!app && M === 'GET') {
    return json({
      today: today(),
      ...(await config(env)),
      apps: Object.entries(APPS).map(([key, a]) => ({
        key, name: a.name, url: env[a.url] || null, roles: a.roles, slug: a.slug,
        connected: !!(env[a.binding] || env[a.url]),
      })),
    });
  }
  if (app === 'config' && M === 'POST') {
    const b = await req.json().catch(() => ({}));
    const stmts = [];
    const put = (k, v) => stmts.push(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, String(v)));
    if (b.trial_days !== undefined) put('platform_trial_days', Math.max(0, Math.min(365, parseInt(b.trial_days, 10) || 0)));
    for (const a of Object.keys(APPS)) if (b[`price_${a}`] !== undefined) put(`platform_price_${a}`, Math.max(0, parseInt(b[`price_${a}`], 10) || 0));
    if (stmts.length) await db.batch(stmts);
    return json(await config(env));
  }

  if (!APPS[app] || resource !== 'businesses') return json({ error: 'no encontrado' }, 404);

  if (!id && M === 'GET') {
    const [{ businesses }, pays] = await Promise.all([
      callApp(env, app, 'GET', '/businesses'),
      db.prepare(`SELECT business_id, MAX(ts) last_ts, SUM(amount) total FROM sub_payments WHERE app = ? GROUP BY business_id`).bind(app).all(),
    ]);
    const byId = Object.fromEntries(pays.results.map((p) => [p.business_id, p]));
    const monthStart = new Date(today().slice(0, 8) + '01T05:00:00Z').getTime();
    const month = await db.prepare('SELECT COALESCE(SUM(amount), 0) n FROM sub_payments WHERE app = ? AND ts >= ?').bind(app, monthStart).first();
    return json({
      today: today(),
      month_income: month.n,
      businesses: businesses.map((b) => ({
        ...b,
        last_payment: byId[b.id]?.last_ts || null,
        total_paid: byId[b.id]?.total || 0,
        users: b.users.map((u) => ({ ...u, invite_url: inviteUrl(env, app, u.invite_path) })),
      })),
    });
  }

  if (!id && M === 'POST') {
    const b = await req.json().catch(() => ({}));
    const trial = b.trial_days !== undefined && b.trial_days !== '' ? parseInt(b.trial_days, 10) : (await config(env)).trial_days;
    const r = await callApp(env, app, 'POST', '/businesses', {
      name: clip(b.name, 120), slug: clip(b.slug, 50) || undefined,
      owner_email: clip(b.owner_email, 254), owner_name: clip(b.owner_name, 100) || undefined,
      paid_until: addDays(today(), Math.max(0, trial || 0)),
    });
    return json({ ...r, invite_url: inviteUrl(env, app, r.invite_path) }, 201);
  }

  const bid = encodeURIComponent(id);

  if (!sub && M === 'PATCH') {
    const b = await req.json().catch(() => ({}));
    const body = {};
    if (b.name !== undefined) body.name = clip(b.name, 120);
    if (b.paid_until !== undefined) body.paid_until = b.paid_until || null;
    await callApp(env, app, 'PATCH', `/businesses/${bid}`, body);
    return json({ ok: true });
  }

  if (sub === 'payments' && M === 'GET') {
    const { results } = await db.prepare('SELECT * FROM sub_payments WHERE app = ? AND business_id = ? ORDER BY ts DESC LIMIT 100').bind(app, id).all();
    return json(results);
  }

  // Registrar un pago: extiende paid_until desde la fecha vigente (o desde hoy si ya venció).
  if (sub === 'payments' && M === 'POST') {
    const b = await req.json().catch(() => ({}));
    const months = parseInt(b.months, 10);
    if (!(months >= 1 && months <= 24)) return json({ error: 'Meses debe estar entre 1 y 24' }, 400);
    const amount = Math.max(0, parseInt(b.amount, 10) || 0);
    const biz = await callApp(env, app, 'GET', `/businesses/${bid}`);
    const before = biz.paid_until || null;
    const base = before && before >= today() ? before : today();
    const after = addMonths(base, months);
    await callApp(env, app, 'PATCH', `/businesses/${bid}`, { paid_until: after });
    await db.prepare(`INSERT INTO sub_payments (app, business_id, business_name, ts, months, amount, paid_until_before, paid_until_after, note, by_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(app, id, biz.name, Date.now(), months, amount, before, after, clip(b.note, 300), adminEmail).run();
    return json({ ok: true, paid_until: after }, 201);
  }

  if (sub === 'users' && !subId && M === 'POST') {
    const b = await req.json().catch(() => ({}));
    const role = APPS[app].roles.includes(b.role) ? b.role : 'staff';
    const r = await callApp(env, app, 'POST', `/businesses/${bid}/users`, { email: clip(b.email, 254), name: clip(b.name, 100) || undefined, role });
    return json({ ...r, invite_url: inviteUrl(env, app, r.invite_path) }, 201);
  }

  if (sub === 'users' && subId && M === 'DELETE') {
    await callApp(env, app, 'DELETE', `/businesses/${bid}/users/${encodeURIComponent(subId)}`);
    return json({ ok: true });
  }

  return json({ error: 'no encontrado' }, 404);
}
