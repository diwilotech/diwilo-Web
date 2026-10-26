/**
 * Cloudflare Access: el panel /admin solo se abre con la identidad que entrega Access.
 * Access pone en cada petición el JWT firmado (cabecera cf-access-jwt-assertion o cookie
 * CF_Authorization); aquí se verifica firma, audiencia y vencimiento y se devuelve el correo.
 *
 * Variables: ACCESS_TEAM_DOMAIN (equipo.cloudflareaccess.com) y ACCESS_AUD (AUD tag de la app).
 * En local, sin ACCESS_AUD, se usa DEV_ADMIN_EMAIL de .dev.vars.
 * Opcional: ADMIN_EMAILS (correos separados por coma) restringe aún más quién entra.
 */
const enc = new TextEncoder();
let certCache = { keys: null, at: 0 };

function b64urlDecode(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (ch) => ch.charCodeAt(0));
}

async function accessKeys(env) {
  if (certCache.keys && Date.now() - certCache.at < 3600000) return certCache.keys;
  const res = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('No se pudo validar Cloudflare Access');
  certCache = { keys: (await res.json()).keys, at: Date.now() };
  return certCache.keys;
}

async function verify(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  } catch { return null; }
  if (header.alg !== 'RS256') return null;
  const jwk = (await accessKeys(env)).find((k) => k.kid === header.kid);
  if (!jwk) { certCache = { keys: null, at: 0 }; return null; } // rotación de llaves
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s), enc.encode(`${h}.${p}`)))) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  return payload.email ? String(payload.email).toLowerCase() : null;
}

function cookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

// Pestañas del panel que se pueden dar o quitar a cada persona del equipo.
export const MODULES = {
  dashboard: 'Inicio', resumen: 'En vivo', negocios: 'Negocios (matrículas)', modulos: 'Módulos (planes y catálogo, dentro de Negocios)', marketing: 'Marketing',
  finanzas: 'Finanzas', nomina: 'Nómina', blog: 'Blog', ia: 'IA', marca: 'Marca', contenido: 'Videos',
};
// Lo que ve una persona nueva del equipo: sin Negocios, Finanzas ni Marketing (se le pueden dar luego).
export const DEFAULT_MODULES = ['dashboard', 'resumen', 'modulos', 'blog'];

export async function ensureTeam(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS team (email TEXT PRIMARY KEY, name TEXT, modules TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, created_by TEXT)`).run();
}

// Quién es y qué puede abrir: { email, owner, modules } o null. Los correos de ADMIN_EMAILS (o todos, si no se
// definió) son titulares con todo; los demás deben estar activos en la tabla «team» con sus módulos.
export async function adminAccess(req, env) {
  let email = null;
  if (env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN) {
    const token = req.headers.get('cf-access-jwt-assertion') || cookie(req, 'CF_Authorization');
    if (token) email = await verify(token, env);
  } else if (env.DEV_ADMIN_EMAIL) {
    email = env.DEV_ADMIN_EMAIL.toLowerCase();
  }
  if (!email) return null;
  const allowed = (env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length || allowed.includes(email)) return { email, owner: true, modules: Object.keys(MODULES) };
  await ensureTeam(env);
  const row = await env.DB.prepare('SELECT modules FROM team WHERE email=? AND active=1').bind(email).first();
  if (!row) return null;
  let mods = []; try { mods = JSON.parse(row.modules); } catch {}
  return { email, owner: false, modules: mods.filter((m) => m in MODULES) };
}

// Correo de quien usa el panel, o null si no pasó por Access (o no es del equipo).
export async function adminEmail(req, env) {
  return (await adminAccess(req, env))?.email || null;
}

// Apariencia del panel por persona del equipo (tema de color y modo claro/oscuro), como en las apps CD.
export const TEMAS = ['violeta', 'azul', 'indigo', 'rosa', 'rojo', 'naranja', 'verde', 'turquesa', 'grafito'];
async function ensurePrefs(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS admin_prefs (email TEXT PRIMARY KEY, tema TEXT NOT NULL, modo TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
}
export async function getPrefs(env, email) {
  try {
    await ensurePrefs(env);
    return (await env.DB.prepare('SELECT tema, modo FROM admin_prefs WHERE email=?').bind(email).first()) || null;
  } catch { return null; }
}
export async function setPrefs(env, email, b) {
  const tema = String(b?.tema || ''), modo = String(b?.modo || '');
  if (!TEMAS.includes(tema) || !['light', 'dark'].includes(modo)) return false;
  await ensurePrefs(env);
  await env.DB.prepare('INSERT INTO admin_prefs (email, tema, modo, updated_at) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET tema=excluded.tema, modo=excluded.modo, updated_at=excluded.updated_at')
    .bind(email, tema, modo, Date.now()).run();
  return true;
}
