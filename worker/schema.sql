-- Esquema D1 de diwilo-admin

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,            -- pageview | click_whatsapp | chat_open | lead | ...
  path TEXT,
  label TEXT,
  ref TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  sid TEXT,
  country TEXT, city TEXT, device TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  target TEXT NOT NULL,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  country TEXT, city TEXT, device TEXT, ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_clicks_link ON clicks(link_id, ts);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT, company TEXT, bio TEXT,
  phone TEXT, whatsapp TEXT, email TEXT, website TEXT,
  instagram TEXT, linkedin TEXT, photo_url TEXT,
  photo_data TEXT,               -- foto subida desde el panel (data URL JPEG, ~30 KB)
  accent TEXT,                   -- color de la tarjeta: violeta | azul | verde | ambar | rosa
  icon_192 TEXT, icon_512 TEXT,  -- íconos de la app instalable (PNG en data URL, los genera el panel)
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,           -- id de sesión del visitante
  started_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  page TEXT, country TEXT, city TEXT, device TEXT,
  msg_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chats_last ON chats(last_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  role TEXT NOT NULL,            -- user | assistant
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, ts);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  name TEXT, email TEXT, phone TEXT, topics TEXT, message TEXT,
  page TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo'   -- nuevo | contactado | propuesta | ganado | perdido
);
CREATE INDEX IF NOT EXISTS idx_leads_ts ON leads(ts);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- Pagos de suscripción de los negocios de Pedidos, Nutrición y Citas (panel → Negocios).
-- Cada pago extiende paid_until en la app; aquí queda el historial.
CREATE TABLE IF NOT EXISTS sub_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,                 -- pedidos | nutricion | citas
  business_id TEXT NOT NULL,
  business_name TEXT,
  ts INTEGER NOT NULL,
  months INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0, -- COP
  paid_until_before TEXT,
  paid_until_after TEXT NOT NULL,
  note TEXT,
  by_email TEXT                      -- quién lo registró (correo de Cloudflare Access)
);
CREATE INDEX IF NOT EXISTS idx_sub_payments_biz ON sub_payments(app, business_id, ts);

-- ---------- Blog ----------
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,                  -- resumen corto (tarjetas, meta description por defecto)
  content TEXT NOT NULL DEFAULT '',  -- Markdown
  category TEXT,
  tags TEXT,                     -- separadas por coma
  author TEXT,
  cover_data TEXT,               -- portada (data URL JPEG/WebP), se sirve en /blog/img/portada-<id>
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | published
  featured INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,          -- ms; si es futura, la entrada queda programada
  seo_title TEXT, seo_desc TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_pub ON posts(status, published_at);

CREATE TABLE IF NOT EXISTS blog_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,
  data TEXT NOT NULL,            -- data URL de la imagen (reducida en el navegador antes de subir)
  created_at INTEGER NOT NULL
);
