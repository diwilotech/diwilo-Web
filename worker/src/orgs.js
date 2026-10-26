/**
 * Organizaciones del panel: 'diwilo' (la operación de Diwilo) y '<app>:<id del negocio>' (cada negocio de las apps).
 * Se listan desde las apps (binding de cada una) y se recuerdan en la tabla «orgs».
 */
import { APPS, listAppBusinesses } from './platform.js';

const now = () => Date.now();
const DIWILO = 'diwilo';

/* ---------------- organizaciones ---------------- */
async function ensureOrg(env, id, name, extra = {}) {
  const t = now();
  await env.DB.prepare(`INSERT INTO orgs (id, kind, app, business_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`)
    .bind(id, extra.kind || (id === DIWILO ? 'diwilo' : 'negocio'), extra.app || null, extra.business_id || null, name, t, t).run();
}
export async function listOrgs(env) {
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
