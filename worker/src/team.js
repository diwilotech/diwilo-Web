/**
 * Equipo de Diwilo: personas que entran al panel /admin y las pestañas que puede abrir cada una.
 *   GET    /admin/api/team           lista + catálogo de módulos (solo titulares)
 *   POST   /admin/api/team           crea o edita { email, name, modules[], active }
 *   DELETE /admin/api/team?email=…   quita a la persona
 * Además de aquí, el correo debe poder entrar por Cloudflare Access (política de la app del panel).
 */
import { MODULES, DEFAULT_MODULES, ensureTeam } from './access.js';

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function teamApi(req, env, access) {
  if (!access.owner) return json({ error: 'Solo el titular del panel maneja el equipo' }, 403);
  await ensureTeam(env);
  const M = req.method;
  if (M === 'GET') {
    const rows = (await env.DB.prepare('SELECT email, name, modules, active, created_at FROM team ORDER BY created_at').all()).results;
    return json({ modules: MODULES, defaults: DEFAULT_MODULES, members: rows.map((r) => ({ ...r, modules: JSON.parse(r.modules || '[]') })) });
  }
  if (M === 'POST') {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ error: 'Correo no válido' }, 400);
    const modules = (Array.isArray(b.modules) ? b.modules : DEFAULT_MODULES).filter((m) => m in MODULES);
    await env.DB.prepare(`INSERT INTO team (email, name, modules, active, created_at, created_by) VALUES (?,?,?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET name=excluded.name, modules=excluded.modules, active=excluded.active`)
      .bind(email, String(b.name || '').trim().slice(0, 80), JSON.stringify(modules), b.active === false || b.active === 0 ? 0 : 1, Date.now(), access.email).run();
    await env.DB.prepare('INSERT INTO events (ts, type, path, label) VALUES (?, ?, ?, ?)').bind(Date.now(), 'admin', '/admin', `${access.email}: equipo · ${email} (${modules.join(', ') || 'sin módulos'})`.slice(0, 300)).run().catch(() => {});
    return json({ ok: true });
  }
  if (M === 'DELETE') {
    const email = String(new URL(req.url).searchParams.get('email') || '').toLowerCase();
    await env.DB.prepare('DELETE FROM team WHERE email=?').bind(email).run();
    return json({ ok: true });
  }
  return json({ error: 'método no permitido' }, 405);
}
