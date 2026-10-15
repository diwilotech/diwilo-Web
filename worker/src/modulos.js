/**
 * Módulos por negocio: Diwilo es la fuente de verdad de qué módulos tiene cada negocio de cada app.
 *
 *   Catálogo:   se lee solo de cada app (GET /api/platform/modules por RPC): propios y compartidos con su versión.
 *   Planes:     qué módulos trae cada plan de una app y su precio mensual («todos» = cualquier módulo nuevo entra solo).
 *   Negocio:    plan + excepciones (agregar o quitar un módulo, con fechas y motivo).
 *   Efectivos = módulos del plan + agregados − quitados, con sus dependencias revisadas antes de guardar.
 *   Envío:      PUT /api/platform/businesses/:id/modules { modules, version }. `version` es la huella de la lista:
 *               la app la guarda y la revisión diaria (o el botón «Sincronizar») reenvía solo a los que no coinciden.
 *   Las apps que aún no tienen módulos (las de antes de la plantilla) quedan «sin soporte»: tienen todo activo.
 *
 *   GET    /admin/api/modulos                                   apps con su estado de módulos
 *   GET    /admin/api/modulos/bitacora?app=                     quién cambió qué y por qué
 *   GET    /admin/api/modulos/:app                              catálogo, planes y negocios con su estado de sincronización
 *   POST   /admin/api/modulos/:app/sincronizar                  lee el catálogo y reenvía a los negocios desactualizados
 *   PATCH  /admin/api/modulos/:app/catalogo/:modulo             { activo_catalogo }  retirar (no se asigna nuevo) o volver a ofrecer
 *   POST   /admin/api/modulos/:app/planes                       { nombre, precio, todos, por_defecto, descripcion, modulos: [] }
 *   PATCH  /admin/api/modulos/:app/planes/:id                   lo mismo; se reenvía a todos los negocios del plan
 *   DELETE /admin/api/modulos/:app/planes/:id                   solo si ningún negocio lo usa
 *   GET    /admin/api/modulos/:app/negocios/:id                 plan, excepciones, módulos efectivos con su origen y registros por módulo
 *   PUT    /admin/api/modulos/:app/negocios/:id                 { plan_id }
 *   POST   /admin/api/modulos/:app/negocios/:id/excepciones     { modulo, modo: agregar|quitar, desde?, hasta?, nota }
 *   DELETE /admin/api/modulos/:app/negocios/:id/excepciones/:eid
 * Lo usan también: platform.js (al crear un negocio se le asigna el plan y se le envían sus módulos; la lista de negocios
 * trae su plan y su precio) y el cron diario (runModulosDaily).
 */
import { APPS, AppError, callApp, listAppBusinesses } from './platform.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const now = () => Date.now();
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); // Colombia
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n));

let ready = false;
export async function ensureModulos(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mod_catalog (app TEXT NOT NULL, modulo TEXT NOT NULL, nombre TEXT NOT NULL, tipo TEXT, version TEXT, icono TEXT, descripcion TEXT,
      depende_de TEXT, orden INTEGER, en_app INTEGER NOT NULL DEFAULT 1, activo_catalogo INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, PRIMARY KEY (app, modulo))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mod_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, app TEXT NOT NULL, nombre TEXT NOT NULL, descripcion TEXT, precio INTEGER NOT NULL DEFAULT 0,
      todos INTEGER NOT NULL DEFAULT 0, por_defecto INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mod_plan_items (plan_id INTEGER NOT NULL, modulo TEXT NOT NULL, PRIMARY KEY (plan_id, modulo))'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mod_business (app TEXT NOT NULL, business_id TEXT NOT NULL, business_name TEXT, plan_id INTEGER, version TEXT, activos INTEGER, estado TEXT NOT NULL DEFAULT 'pendiente',
      error TEXT, synced_at INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (app, business_id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mod_exceptions (id INTEGER PRIMARY KEY AUTOINCREMENT, app TEXT NOT NULL, business_id TEXT NOT NULL, modulo TEXT NOT NULL, modo TEXT NOT NULL,
      desde TEXT, hasta TEXT, nota TEXT, por TEXT, created_at INTEGER NOT NULL)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mod_exceptions ON mod_exceptions (app, business_id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mod_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, app TEXT NOT NULL, business_id TEXT, por TEXT, accion TEXT NOT NULL, detalle TEXT)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mod_log ON mod_log (app, ts)'),
  ]);
  ready = true;
}

const log = (env, app, por, accion, { business_id = null, detalle = null } = {}) =>
  env.DB.prepare('INSERT INTO mod_log (ts, app, business_id, por, accion, detalle) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(now(), app, business_id, por || 'sistema', String(accion).slice(0, 300), detalle == null ? null : JSON.stringify(detalle).slice(0, 4000)).run().catch(() => {});

// La app aún no tiene las rutas de módulos (apps de antes de la plantilla).
const noSupport = (e) => e?.status === 404 && /ruta no encontrada|no encontrad/i.test(e.message) && !/negocio/i.test(e.message);

async function setState(env, app, patch) {
  const k = `mod_app_${app}`;
  const cur = JSON.parse((await one(env, 'SELECT value FROM settings WHERE key = ?', k))?.value || '{}');
  const v = { ...cur, ...patch };
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, JSON.stringify(v)).run();
  return v;
}
const appState = async (env, app) => JSON.parse((await one(env, 'SELECT value FROM settings WHERE key = ?', `mod_app_${app}`))?.value || '{}');

/* ---------------- catálogo ---------------- */
// Lee el catálogo de la app y lo guarda. Crea el plan «Completo» (todos los módulos, por defecto) la primera vez.
export async function refreshCatalog(env, app) {
  await ensureModulos(env);
  let data;
  try { data = await callApp(env, app, 'GET', '/modules'); }
  catch (e) {
    // Sin la ruta del catálogo (404/405, aunque la app lo diga a su manera, p. ej. «Negocio no encontrado» en Citas) = app sin módulos
    if (e?.status === 404 || e?.status === 405) return { soporta: false, ...(await setState(env, app, { soporta: false, error: null, at: now() })) };
    await setState(env, app, { error: e.message, at: now() });
    throw e;
  }
  const t = now(), ids = (data.modulos || []).map((m) => m.id);
  await env.DB.batch([
    env.DB.prepare(`UPDATE mod_catalog SET en_app = 0, updated_at = ? WHERE app = ? ${ids.length ? `AND modulo NOT IN (${ids.map(() => '?').join(',')})` : ''}`).bind(t, app, ...ids),
    ...(data.modulos || []).map((m) => env.DB.prepare(`INSERT INTO mod_catalog (app, modulo, nombre, tipo, version, icono, descripcion, depende_de, orden, en_app, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(app, modulo) DO UPDATE SET nombre = excluded.nombre, tipo = excluded.tipo, version = excluded.version, icono = excluded.icono,
      descripcion = excluded.descripcion, depende_de = excluded.depende_de, orden = excluded.orden, en_app = 1, updated_at = excluded.updated_at`)
      .bind(app, m.id, clip(m.nombre, 80) || m.id, m.tipo || 'propio', m.version || null, m.icono || null, clip(m.descripcion, 400), JSON.stringify(m.depende_de || []), m.orden ?? 99, t)),
  ]);
  if (!(await one(env, 'SELECT 1 FROM mod_plans WHERE app = ?', app))) {
    const price = Number((await one(env, 'SELECT value FROM settings WHERE key = ?', `platform_price_${app}`))?.value || 0);
    await env.DB.prepare("INSERT INTO mod_plans (app, nombre, descripcion, precio, todos, por_defecto, created_at, updated_at) VALUES (?, 'Completo', 'Todos los módulos de la app, también los nuevos', ?, 1, 1, ?, ?)").bind(app, price, t, t).run();
    await log(env, app, 'sistema', 'Creó el plan «Completo» (todos los módulos) como plan por defecto');
  }
  return { soporta: true, ...(await setState(env, app, { soporta: true, error: null, at: t, nombre: data.nombre })) };
}
const catalog = (env, app) => all(env, 'SELECT * FROM mod_catalog WHERE app = ? ORDER BY orden, nombre', app)
  .then((r) => r.map((m) => ({ ...m, depende_de: JSON.parse(m.depende_de || '[]') })));

/* ---------------- planes ---------------- */
async function plans(env, app) {
  const ps = await all(env, `SELECT p.*, (SELECT COUNT(*) FROM mod_business b WHERE b.app = p.app AND b.plan_id = p.id) negocios FROM mod_plans p WHERE p.app = ? ORDER BY p.precio, p.nombre`, app);
  const items = ps.length ? await all(env, `SELECT plan_id, modulo FROM mod_plan_items WHERE plan_id IN (${ps.map(() => '?').join(',')})`, ...ps.map((p) => p.id)) : [];
  return ps.map((p) => ({ ...p, modulos: items.filter((i) => i.plan_id === p.id).map((i) => i.modulo) }));
}
const defaultPlan = async (env, app) => (await one(env, 'SELECT id FROM mod_plans WHERE app = ? ORDER BY por_defecto DESC, id LIMIT 1', app))?.id || null;

/* ---------------- módulos efectivos ---------------- */
// Devuelve la lista para la app, el detalle con el origen de cada módulo y la huella.
async function effective(env, app, businessId, override = {}) {
  const cat = await catalog(env, app);
  const live = cat.filter((m) => m.en_app);
  const biz = await one(env, 'SELECT * FROM mod_business WHERE app = ? AND business_id = ?', app, businessId);
  const planId = override.plan_id !== undefined ? override.plan_id : biz?.plan_id ?? (await defaultPlan(env, app));
  const plan = planId ? (await plans(env, app)).find((p) => p.id === planId) : null;
  const exc = override.excepciones || await all(env, 'SELECT * FROM mod_exceptions WHERE app = ? AND business_id = ? ORDER BY created_at', app, businessId);
  const t = today();
  const base = new Set(plan ? (plan.todos ? live.filter((m) => m.activo_catalogo).map((m) => m.modulo) : plan.modulos.filter((id) => live.some((m) => m.modulo === id))) : []);
  const out = new Map([...base].map((id) => [id, { modulo: id, origen: 'plan' }]));
  for (const e of exc) {
    if (!live.some((m) => m.modulo === e.modulo)) continue;
    if (e.modo === 'agregar' && !(e.hasta && e.hasta < t)) out.set(e.modulo, { modulo: e.modulo, origen: base.has(e.modulo) ? 'plan' : 'agregado', desde: e.desde || null, hasta: e.hasta || null });
    if (e.modo === 'quitar' && !(e.desde && e.desde > t) && !(e.hasta && e.hasta < t)) out.delete(e.modulo);
  }
  const rows = [...out.values()].sort((a, b) => a.modulo.localeCompare(b.modulo));
  // Dependencias: lo que falta para que cada módulo funcione
  const on = new Set(rows.map((r) => r.modulo)), faltan = [];
  for (const r of rows) for (const dep of live.find((m) => m.modulo === r.modulo)?.depende_de || []) if (!on.has(dep)) faltan.push({ modulo: r.modulo, necesita: dep });
  const payload = rows.map(({ modulo, desde, hasta }) => ({ modulo, activo: true, ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) }));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))));
  const version = [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { plan, planId, rows, payload, version, faltan, cat, quitados: exc.filter((e) => e.modo === 'quitar' && base.has(e.modulo)).map((e) => e.modulo) };
}
const depsError = (cat, faltan) => new AppError(409, faltan.map((f) => `${cat.find((m) => m.modulo === f.modulo)?.nombre || f.modulo} necesita ${cat.find((m) => m.modulo === f.necesita)?.nombre || f.necesita}`).join('; '));

async function ensureBusiness(env, app, businessId, name) {
  if (await one(env, 'SELECT 1 FROM mod_business WHERE app = ? AND business_id = ?', app, businessId)) {
    if (name) await env.DB.prepare('UPDATE mod_business SET business_name = ? WHERE app = ? AND business_id = ?').bind(name, app, businessId).run();
    return;
  }
  await env.DB.prepare("INSERT INTO mod_business (app, business_id, business_name, plan_id, estado, updated_at) VALUES (?, ?, ?, ?, 'pendiente', ?)")
    .bind(app, businessId, name || null, await defaultPlan(env, app), now()).run();
}

// Envía los módulos efectivos a la app. Nunca lanza: deja el estado (ok / error / sin_soporte) en mod_business.
export async function pushBusiness(env, app, businessId) {
  const ef = await effective(env, app, businessId);
  let estado = 'ok', error = null;
  try {
    if (ef.faltan.length) throw depsError(ef.cat, ef.faltan);
    await callApp(env, app, 'PUT', `/businesses/${encodeURIComponent(businessId)}/modules`, { modules: ef.payload, version: ef.version });
  } catch (e) { estado = noSupport(e) ? 'sin_soporte' : 'error'; error = estado === 'error' ? String(e.message).slice(0, 300) : null; }
  await env.DB.prepare('UPDATE mod_business SET version = ?, activos = ?, estado = ?, error = ?, synced_at = ?, updated_at = ? WHERE app = ? AND business_id = ?')
    .bind(ef.version, ef.rows.length, estado, error, estado === 'ok' ? now() : null, now(), app, businessId).run();
  return { estado, error, version: ef.version };
}

// Revisa todos los negocios de la app: los que no tienen la huella correcta se reenvían.
export async function reconcile(env, app) {
  const st = await refreshCatalog(env, app);
  if (!st.soporta) return { soporta: false, revisados: 0, enviados: 0, errores: 0 };
  const [businesses, sync] = await Promise.all([listAppBusinesses(env, app), callApp(env, app, 'GET', '/modules/sync').then((d) => d.rows || []).catch(() => [])]);
  const appVersion = Object.fromEntries(sync.map((r) => [r.business_id, r.version]));
  let enviados = 0, errores = 0;
  for (const b of businesses) {
    await ensureBusiness(env, app, b.id, b.name);
    const ef = await effective(env, app, b.id);
    if (appVersion[b.id] === ef.version) {
      await env.DB.prepare("UPDATE mod_business SET version = ?, activos = ?, estado = 'ok', error = NULL, updated_at = ? WHERE app = ? AND business_id = ?").bind(ef.version, ef.rows.length, now(), app, b.id).run();
      continue;
    }
    const r = await pushBusiness(env, app, b.id);
    if (r.estado === 'ok') enviados++; else errores++;
  }
  await setState(env, app, { revisado_at: now() });
  return { soporta: true, revisados: businesses.length, enviados, errores };
}

// Cron diario: fechas que empiezan o terminan, cambios que no llegaron, módulos nuevos en las apps.
export async function runModulosDaily(env) {
  await ensureModulos(env);
  const out = {};
  for (const [app, cfg] of Object.entries(APPS)) {
    if (!env[cfg.binding]) continue;
    try { out[app] = await reconcile(env, app); } catch (e) { out[app] = { error: e.message }; }
  }
  return out;
}

/* ---------------- ganchos para platform.js ---------------- */
// Negocio nuevo: plan elegido (o el por defecto) y envío inmediato de sus módulos.
export async function onBusinessCreated(env, app, businessId, name, planId, por) {
  try {
    await ensureModulos(env);
    const st = await refreshCatalog(env, app);
    if (!st.soporta) return;
    await ensureBusiness(env, app, businessId, name);
    if (planId && (await one(env, 'SELECT 1 FROM mod_plans WHERE id = ? AND app = ?', Number(planId), app))) {
      await env.DB.prepare('UPDATE mod_business SET plan_id = ? WHERE app = ? AND business_id = ?').bind(Number(planId), app, businessId).run();
    }
    await pushBusiness(env, app, businessId);
    const p = await one(env, 'SELECT p.nombre FROM mod_business b JOIN mod_plans p ON p.id = b.plan_id WHERE b.app = ? AND b.business_id = ?', app, businessId);
    await log(env, app, por, `Negocio nuevo «${name}» con el plan «${p?.nombre || '—'}»`, { business_id: businessId });
  } catch (e) { console.error('módulos al crear negocio', e.message); }
}
// Plan y precio de cada negocio (para la lista de Negocios y para sugerir el valor del pago).
export async function businessPlans(env, app) {
  try {
    await ensureModulos(env);
    const rows = await all(env, 'SELECT b.business_id, b.estado, p.id plan_id, p.nombre, p.precio FROM mod_business b LEFT JOIN mod_plans p ON p.id = b.plan_id WHERE b.app = ?', app);
    return Object.fromEntries(rows.map((r) => [r.business_id, r.plan_id ? { id: r.plan_id, nombre: r.nombre, precio: r.precio, estado: r.estado } : { estado: r.estado }]));
  } catch { return {}; }
}
export async function plansFor(env, app) {
  try { await ensureModulos(env); return (await plans(env, app)).map(({ id, nombre, precio, por_defecto }) => ({ id, nombre, precio, por_defecto })); } catch { return []; }
}

/* ---------------- API del panel ---------------- */
export async function modulosApi(req, env, path, url, por) {
  try {
    await ensureModulos(env);
    return await route(req, env, path, url, por);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    throw e;
  }
}

async function businessDetail(env, app, id) {
  const biz = await one(env, 'SELECT * FROM mod_business WHERE app = ? AND business_id = ?', app, id);
  if (!biz) throw new AppError(404, 'Ese negocio aún no está en módulos: pulsa «Sincronizar»');
  const ef = await effective(env, app, id);
  const exc = await all(env, 'SELECT * FROM mod_exceptions WHERE app = ? AND business_id = ? ORDER BY created_at DESC', app, id);
  const enApp = await callApp(env, app, 'GET', `/businesses/${encodeURIComponent(id)}/modules`).catch(() => null);
  const t = today();
  return {
    negocio: { id, nombre: biz.business_name, estado: biz.estado, error: biz.error, synced_at: biz.synced_at, version: biz.version, version_app: enApp?.version || null },
    plan_id: ef.planId, plan: ef.plan ? { id: ef.plan.id, nombre: ef.plan.nombre, precio: ef.plan.precio } : null,
    modulos: ef.cat.filter((m) => m.en_app).map((m) => {
      const r = ef.rows.find((x) => x.modulo === m.modulo);
      return { modulo: m.modulo, nombre: m.nombre, icono: m.icono, tipo: m.tipo, activo: !!r, origen: r ? r.origen : ef.quitados.includes(m.modulo) ? 'quitado' : 'fuera', desde: r?.desde || null, hasta: r?.hasta || null,
        registros: enApp?.uso?.[m.modulo] ?? null, depende_de: m.depende_de, activo_catalogo: m.activo_catalogo };
    }),
    excepciones: exc.map((e) => ({ ...e, vigente: !(e.hasta && e.hasta < t) && !(e.modo === 'quitar' && e.desde && e.desde > t) })),
    faltan: ef.faltan,
  };
}

async function route(req, env, path, url, por) {
  const M = req.method;
  const [, , , app, a, b, c, d] = path.split('/').filter(Boolean).map(decodeURIComponent); // tras /admin/api/modulos
  const body = M === 'GET' || M === 'DELETE' ? {} : await req.json().catch(() => ({}));

  if (!app && M === 'GET') {
    const out = [];
    for (const [key, cfg] of Object.entries(APPS)) {
      const st = await appState(env, key);
      const n = await one(env, `SELECT COUNT(*) negocios, SUM(estado = 'ok') ok, SUM(estado = 'error') errores, SUM(estado = 'pendiente') pendientes FROM mod_business WHERE app = ?`, key);
      const m = await one(env, 'SELECT COUNT(*) n FROM mod_catalog WHERE app = ? AND en_app = 1', key);
      out.push({ key, name: cfg.name, connected: !!env[cfg.binding], soporta: st.soporta ?? null, error: st.error || null, revisado_at: st.revisado_at || null, modulos: m.n, ...n });
    }
    return json({ apps: out });
  }
  if (app === 'bitacora' && M === 'GET') {
    const f = url.searchParams.get('app');
    return json({ rows: await all(env, `SELECT l.*, b.business_name FROM mod_log l LEFT JOIN mod_business b ON b.app = l.app AND b.business_id = l.business_id ${f ? 'WHERE l.app = ?' : ''} ORDER BY l.ts DESC LIMIT 300`, ...(f ? [f] : [])) });
  }
  if (!APPS[app]) return json({ error: 'App no encontrada' }, 404);
  const name = APPS[app].name;

  if (!a && M === 'GET') {
    const st = await appState(env, app);
    const [cat, ps, negocios] = await Promise.all([catalog(env, app), plans(env, app), all(env, 'SELECT b.*, p.nombre plan FROM mod_business b LEFT JOIN mod_plans p ON p.id = b.plan_id WHERE b.app = ? ORDER BY b.business_name', app)]);
    return json({ app, nombre: name, soporta: st.soporta ?? null, error: st.error || null, revisado_at: st.revisado_at || null, catalogo: cat, planes: ps, negocios });
  }
  if (a === 'sincronizar' && M === 'POST') {
    const r = await reconcile(env, app);
    await log(env, app, por, `Sincronizó ${name}: ${r.revisados} negocios revisados, ${r.enviados} actualizados${r.errores ? `, ${r.errores} con error` : ''}`);
    return json(r);
  }

  if (a === 'catalogo' && b && M === 'PATCH') {
    const m = await one(env, 'SELECT nombre FROM mod_catalog WHERE app = ? AND modulo = ?', app, b);
    if (!m) throw new AppError(404, 'Módulo no encontrado');
    const on = body.activo_catalogo ? 1 : 0;
    await env.DB.prepare('UPDATE mod_catalog SET activo_catalogo = ?, updated_at = ? WHERE app = ? AND modulo = ?').bind(on, now(), app, b).run();
    await log(env, app, por, `${on ? 'Volvió a ofrecer' : 'Retiró del catálogo'} el módulo «${m.nombre}»`);
    return json({ ok: true });
  }

  if (a === 'planes') {
    const cat = await catalog(env, app);
    const read = () => {
      const p = { nombre: clip(body.nombre, 60), descripcion: clip(body.descripcion, 300), precio: Math.max(0, parseInt(body.precio, 10) || 0), todos: body.todos ? 1 : 0, por_defecto: body.por_defecto ? 1 : 0 };
      if (!p.nombre) throw new AppError(400, 'Falta el nombre del plan');
      const mods = p.todos ? [] : [...new Set(Array.isArray(body.modulos) ? body.modulos : [])];
      for (const id of mods) { const m = cat.find((x) => x.modulo === id); if (!m) throw new AppError(400, `Módulo desconocido: ${id}`); }
      const set = new Set(p.todos ? cat.filter((m) => m.en_app && m.activo_catalogo).map((m) => m.modulo) : mods);
      const faltan = [];
      for (const id of set) for (const dep of cat.find((m) => m.modulo === id)?.depende_de || []) if (!set.has(dep)) faltan.push({ modulo: id, necesita: dep });
      if (faltan.length) throw depsError(cat, faltan);
      return { p, mods };
    };
    const saveItems = (id, mods) => env.DB.batch([env.DB.prepare('DELETE FROM mod_plan_items WHERE plan_id = ?').bind(id), ...mods.map((m) => env.DB.prepare('INSERT INTO mod_plan_items (plan_id, modulo) VALUES (?, ?)').bind(id, m))]);
    const onlyDefault = (id) => env.DB.prepare('UPDATE mod_plans SET por_defecto = 0 WHERE app = ? AND id <> ?').bind(app, id).run();
    if (!b && M === 'POST') {
      const { p, mods } = read(), t = now();
      const r = await env.DB.prepare('INSERT INTO mod_plans (app, nombre, descripcion, precio, todos, por_defecto, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(app, p.nombre, p.descripcion, p.precio, p.todos, p.por_defecto, t, t).run();
      const id = r.meta.last_row_id;
      await saveItems(id, mods);
      if (p.por_defecto) await onlyDefault(id);
      await log(env, app, por, `Creó el plan «${p.nombre}» (${p.todos ? 'todos los módulos' : `${mods.length} módulos`}, $${p.precio.toLocaleString('es-CO')}/mes)`, { detalle: mods });
      return json({ id }, 201);
    }
    const plan = await one(env, 'SELECT * FROM mod_plans WHERE id = ? AND app = ?', Number(b), app);
    if (!plan) throw new AppError(404, 'Plan no encontrado');
    if (M === 'PATCH') {
      const { p, mods } = read();
      await env.DB.prepare('UPDATE mod_plans SET nombre = ?, descripcion = ?, precio = ?, todos = ?, por_defecto = ?, updated_at = ? WHERE id = ?').bind(p.nombre, p.descripcion, p.precio, p.todos, p.por_defecto, now(), plan.id).run();
      await saveItems(plan.id, mods);
      if (p.por_defecto) await onlyDefault(plan.id);
      const bizs = await all(env, 'SELECT business_id FROM mod_business WHERE app = ? AND plan_id = ?', app, plan.id);
      let errores = 0;
      for (const x of bizs) if ((await pushBusiness(env, app, x.business_id)).estado === 'error') errores++;
      await log(env, app, por, `Editó el plan «${p.nombre}» y lo aplicó a ${bizs.length} negocio(s)`, { detalle: { todos: !!p.todos, modulos: mods, precio: p.precio } });
      return json({ ok: true, afectados: bizs.length, errores });
    }
    if (M === 'DELETE') {
      const n = (await one(env, 'SELECT COUNT(*) n FROM mod_business WHERE app = ? AND plan_id = ?', app, plan.id)).n;
      if (n) throw new AppError(409, `${n} negocio(s) usan este plan: pásalos a otro antes de borrarlo`);
      await env.DB.batch([env.DB.prepare('DELETE FROM mod_plan_items WHERE plan_id = ?').bind(plan.id), env.DB.prepare('DELETE FROM mod_plans WHERE id = ?').bind(plan.id)]);
      await log(env, app, por, `Borró el plan «${plan.nombre}»`);
      return json({ ok: true });
    }
  }

  if (a === 'negocios' && b) {
    if (!c && M === 'GET') return json(await businessDetail(env, app, b));
    const biz = await one(env, 'SELECT * FROM mod_business WHERE app = ? AND business_id = ?', app, b);
    if (!biz) throw new AppError(404, 'Ese negocio aún no está en módulos: pulsa «Sincronizar»');
    if (!c && M === 'PUT') {
      const plan = await one(env, 'SELECT * FROM mod_plans WHERE id = ? AND app = ?', Number(body.plan_id), app);
      if (!plan) throw new AppError(400, 'Plan no válido');
      const ef = await effective(env, app, b, { plan_id: plan.id });
      if (ef.faltan.length) throw depsError(ef.cat, ef.faltan);
      await env.DB.prepare('UPDATE mod_business SET plan_id = ?, updated_at = ? WHERE app = ? AND business_id = ?').bind(plan.id, now(), app, b).run();
      const r = await pushBusiness(env, app, b);
      await log(env, app, por, `Pasó a «${biz.business_name}» al plan «${plan.nombre}»`, { business_id: b, detalle: { nota: clip(body.nota, 300) } });
      return json({ ok: true, ...r });
    }
    if (c === 'excepciones' && !d && M === 'POST') {
      const cat = await catalog(env, app), m = cat.find((x) => x.modulo === body.modulo && x.en_app);
      if (!m) throw new AppError(400, 'Módulo no válido');
      const modo = body.modo === 'quitar' ? 'quitar' : 'agregar';
      if (modo === 'agregar' && !m.activo_catalogo) throw new AppError(400, `«${m.nombre}» está retirado del catálogo: no se asigna a negocios nuevos`);
      const desde = DATE.test(body.desde || '') ? body.desde : null, hasta = DATE.test(body.hasta || '') ? body.hasta : null;
      if (desde && hasta && hasta < desde) throw new AppError(400, 'La fecha final es antes de la inicial');
      const nota = clip(body.nota, 300);
      if (!nota) throw new AppError(400, 'Escribe el motivo (queda en la bitácora)');
      const nueva = { id: 0, app, business_id: b, modulo: m.modulo, modo, desde, hasta, nota };
      const prev = await all(env, 'SELECT * FROM mod_exceptions WHERE app = ? AND business_id = ? AND modulo <> ? ORDER BY created_at', app, b, m.modulo);
      const ef = await effective(env, app, b, { excepciones: [...prev, nueva] });
      if (ef.faltan.length) throw depsError(ef.cat, ef.faltan);
      // Una sola excepción por módulo: la nueva reemplaza la anterior
      await env.DB.batch([
        env.DB.prepare('DELETE FROM mod_exceptions WHERE app = ? AND business_id = ? AND modulo = ?').bind(app, b, m.modulo),
        env.DB.prepare('INSERT INTO mod_exceptions (app, business_id, modulo, modo, desde, hasta, nota, por, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(app, b, m.modulo, modo, desde, hasta, nota, por, now()),
      ]);
      const r = await pushBusiness(env, app, b);
      await log(env, app, por, `${modo === 'agregar' ? 'Agregó' : 'Quitó'} «${m.nombre}» a «${biz.business_name}»${desde || hasta ? ` (${desde || '…'} a ${hasta || '…'})` : ''}: ${nota}`, { business_id: b });
      return json({ ok: true, ...r }, 201);
    }
    if (c === 'excepciones' && d && M === 'DELETE') {
      const e = await one(env, 'SELECT * FROM mod_exceptions WHERE id = ? AND app = ? AND business_id = ?', Number(d), app, b);
      if (!e) throw new AppError(404, 'Excepción no encontrada');
      const rest = await all(env, 'SELECT * FROM mod_exceptions WHERE app = ? AND business_id = ? AND id <> ?', app, b, e.id);
      const ef = await effective(env, app, b, { excepciones: rest });
      if (ef.faltan.length) throw depsError(ef.cat, ef.faltan);
      await env.DB.prepare('DELETE FROM mod_exceptions WHERE id = ?').bind(e.id).run();
      const r = await pushBusiness(env, app, b);
      await log(env, app, por, `Quitó la excepción de «${e.modulo}» (${e.modo}) en «${biz.business_name}»: vuelve a lo del plan`, { business_id: b });
      return json({ ok: true, ...r });
    }
  }
  return json({ error: 'no encontrado' }, 404);
}
