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

// Correo de quien usa el panel, o null si no pasó por Access.
export async function adminEmail(req, env) {
  let email = null;
  if (env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN) {
    const token = req.headers.get('cf-access-jwt-assertion') || cookie(req, 'CF_Authorization');
    if (token) email = await verify(token, env);
  } else if (env.DEV_ADMIN_EMAIL) {
    email = env.DEV_ADMIN_EMAIL.toLowerCase();
  }
  if (!email) return null;
  const allowed = (env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !allowed.length || allowed.includes(email) ? email : null;
}
