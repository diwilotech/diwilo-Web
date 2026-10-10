/**
 * Plataforma Diwilo: desde /admin se crean los negocios de cada app, se invita a sus usuarios y se
 * manejan las suscripciones. Cada app expone el mismo contrato en /api/platform/* y lo publica solo
 * por RPC: `export class Platform` con call(method, path, body, origin). Diwilo la llama por un service
 * binding con "entrypoint": "Platform"; desde internet esas rutas dan 401, y no hay clave compartida.
 *
 * La app guarda solo `paid_until` ('YYYY-MM-DD', inclusive; null = sin límite) y queda en solo
 * lectura cuando vence. El historial de pagos vive aquí, en la tabla sub_payments.
 *
 *   GET    /admin/api/platform                                   apps + precios + días de prueba
 *   POST   /admin/api/platform/config                            { trial_days, price_<app> }
 *   GET    /admin/api/platform/:app/businesses
 *   POST   /admin/api/platform/:app/businesses                   { name, slug?, owner_email, owner_name?, trial_days? }
 *   PATCH  /admin/api/platform/:app/businesses/:id               { name?, slug?, paid_until? }  slug = dirección (la vieja redirige)
 *   GET    /admin/api/platform/:app/businesses/:id/payments
 *   POST   /admin/api/platform/:app/businesses/:id/payments      { months, amount, note? }
 *   POST   /admin/api/platform/:app/businesses/:id/users         { email, name?, role }
 *   PATCH  /admin/api/platform/:app/businesses/:id/users/:userId { role?, email? }  permisos y/o correo
 *   DELETE /admin/api/platform/:app/businesses/:id/users/:userId
 *   GET    /admin/api/platform/:app/businesses?archived=1         archivados (se borran a los 20 días)
 *   DELETE /admin/api/platform/:app/businesses/:id                archivar
 *   POST   /admin/api/platform/:app/businesses/:id/restore        sacar del archivo
 *   POST   /admin/api/platform/:app/businesses/:id/sso            entrar como el dueño -> { url } (pase de un solo uso)
 * purgeArchived(env) la corre el cron diario: cada app borra por lotes sus negocios archivados hace más de 20 días.
 */
export const APPS = {
  pedidos: { name: 'Pedidos', binding: 'PEDIDOS', url: 'PEDIDOS_URL', roles: ['owner', 'staff'], slug: false },
  nutricion: { name: 'Nutrición', binding: 'NUTRICION', url: 'NUTRICION_URL', roles: ['owner', 'admin', 'staff'], slug: 'optional' },
  citas: { name: 'Citas', binding: 'CITAS', url: 'CITAS_URL', roles: ['owner', 'staff'], slug: 'required' },
  residentes: { name: 'Residentes', binding: 'RESIDENTES', url: 'RESIDENTES_URL', roles: ['owner', 'admin', 'staff'], slug: 'optional' },
  academia: { name: 'Academia', binding: 'ACADEMIA', url: 'ACADEMIA_URL', roles: ['owner', 'admin', 'staff'], slug: false },
};
const DEFAULT_TRIAL_DAYS = 15;
export const ARCHIVE_DAYS = 20; // días que un negocio archivado se puede restaurar antes de borrarse

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
  const svc = env[cfg.binding];
  if (!svc) throw new AppError(503, `${cfg.name} no está conectada (falta el service binding ${cfg.binding})`);
  let res;
  try {
    // origin: la URL pública de la app, con la que arma los links que devuelve (admin_url, logo_url...)
    res = await svc.call(method, path, body, env[cfg.url]);
  } catch (e) {
    throw new AppError(502, `${cfg.name} no responde: ${e.message}`);
  }
  const { status, data = {} } = res || {};
  if (status === 401) throw new AppError(502, `${cfg.name} rechazó la llamada: revisa que su Worker exporte "Platform" y que el binding ${cfg.binding} tenga "entrypoint": "Platform"`);
  if (!(status >= 200 && status < 300)) throw new AppError(status >= 500 ? 502 : status || 502, data.error || `${cfg.name} respondió ${status}`);
  return data;
}

// Deja constancia de lo que hace un administrador sobre un negocio (tipo 'admin' en events).
const audit = (env, adminEmail, label) =>
  env.DB.prepare('INSERT INTO events (ts, type, path, label) VALUES (?, ?, ?, ?)').bind(Date.now(), 'admin', '/admin', `${adminEmail || 'admin'}: ${label}`.slice(0, 300)).run().catch(() => {});

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
    const archived = url.searchParams.get('archived') === '1';
    const [{ businesses }, pays] = await Promise.all([
      callApp(env, app, 'GET', archived ? '/businesses?archived=1' : '/businesses'),
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

  // Archivar (eliminar): la app deja de dejar entrar y lo borra por lotes a los ARCHIVE_DAYS días.
  if (!sub && M === 'DELETE') {
    const r = await callApp(env, app, 'DELETE', `/businesses/${bid}`);
    await audit(env, adminEmail, `archivó un negocio de ${APPS[app].name} (${id})`);
    return json({ ok: true, purge_on: r.purge_on || null });
  }
  if (sub === 'restore' && M === 'POST') {
    await callApp(env, app, 'POST', `/businesses/${bid}/restore`);
    await audit(env, adminEmail, `restauró un negocio de ${APPS[app].name} (${id})`);
    return json({ ok: true });
  }
  // Entrar como el dueño: la app da un pase de un solo uso (2 min) y el panel lo abre en otra pestaña.
  if (sub === 'sso' && M === 'POST') {
    const base = (env[APPS[app].url] || '').replace(/\/+$/, '');
    if (!base) throw new AppError(503, `Falta ${APPS[app].url} en wrangler.jsonc`);
    const r = await callApp(env, app, 'POST', `/businesses/${bid}/sso`);
    await audit(env, adminEmail, `entró como dueño a un negocio de ${APPS[app].name} (${id})`);
    return json({ url: base + r.path });
  }

  if (!sub && M === 'PATCH') {
    const b = await req.json().catch(() => ({}));
    const body = {};
    if (b.name !== undefined) body.name = clip(b.name, 120);
    if (b.paid_until !== undefined) body.paid_until = b.paid_until || null;
    if (b.slug !== undefined) body.slug = clip(b.slug, 50);
    await callApp(env, app, 'PATCH', `/businesses/${bid}`, body);
    if (body.slug) await audit(env, adminEmail, `cambió la dirección de un negocio de ${APPS[app].name} a /${body.slug}`);
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

  // Cambiar el rol (permisos) de un usuario. Las apps con PATCH …/users/:userId solo cambian el rol;
  // las que aún no lo tienen reciben el POST de siempre (que además genera un link nuevo).
  if (sub === 'users' && subId && M === 'PATCH') {
    const b = await req.json().catch(() => ({}));
    const body = {};
    if (b.role !== undefined) { if (!APPS[app].roles.includes(b.role)) return json({ error: 'Rol no válido' }, 400); body.role = b.role; }
    if (b.new_email !== undefined) body.email = clip(b.new_email, 254);
    if (!Object.keys(body).length) return json({ error: 'Indica el rol o el correo' }, 400);
    const path = `/businesses/${bid}/users/${encodeURIComponent(subId)}`;
    try {
      const r = await callApp(env, app, 'PATCH', path, body);
      if (body.email) await audit(env, adminEmail, `cambió el correo de un usuario de ${APPS[app].name} a ${body.email}`);
      return json({ ok: true, role: r.role || b.role, email: r.email });
    } catch (e) {
      if (body.email) throw e;
      if (!(e instanceof AppError) || ![404, 405].includes(e.status) || !b.email || /usuario no pertenece/i.test(e.message)) throw e;
      const r = await callApp(env, app, 'POST', `/businesses/${bid}/users`, { email: clip(b.email, 254), role: b.role });
      return json({ ok: true, role: b.role, invite_url: inviteUrl(env, app, r.invite_path), relinked: true });
    }
  }

  if (sub === 'users' && subId && M === 'DELETE') {
    await callApp(env, app, 'DELETE', `/businesses/${bid}/users/${encodeURIComponent(subId)}`);
    return json({ ok: true });
  }

  return json({ error: 'no encontrado' }, 404);
}

// Cron diario: cada app borra por lotes los negocios archivados hace más de ARCHIVE_DAYS días.
export async function purgeArchived(env) {
  const out = {};
  for (const [key, cfg] of Object.entries(APPS)) {
    if (!env[cfg.binding]) continue;
    try { out[key] = await callApp(env, key, 'POST', '/purge', { days: ARCHIVE_DAYS }); }
    catch (e) { out[key] = { error: e.message }; }
  }
  const purged = Object.values(out).reduce((n, r) => n + (r.purged?.length || 0), 0);
  if (purged) await audit(env, 'cron', `borró ${purged} negocio(s) archivados`);
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('platform_last_purge', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(JSON.stringify({ at: new Date().toISOString(), ...out })).run();
  return out;
}
