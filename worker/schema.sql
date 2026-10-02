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

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);
