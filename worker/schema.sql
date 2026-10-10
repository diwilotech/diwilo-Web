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

-- Marketing Hub y Finance Hub (módulos horizontales del panel). Todo dato pertenece a una organización:
-- 'diwilo' (la operación de Diwilo) o '<app>:<id del negocio>' (cada negocio de las apps).
-- Montos en pesos colombianos, enteros. Fechas 'YYYY-MM-DD'; marcas de tiempo en milisegundos.
-- Se puede correr las veces que haga falta:  npx wrangler d1 execute diwilo-admin-db --remote --file=worker/hubs.sql

CREATE TABLE IF NOT EXISTS orgs (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,              -- diwilo | negocio
  app         TEXT,                       -- pedidos | nutricion | citas | residentes | academia ...
  business_id TEXT,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- ---------- Marketing ----------
CREATE TABLE IF NOT EXISTS mk_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT, phone TEXT, company TEXT,
  stage TEXT NOT NULL DEFAULT 'lead',     -- lead | cliente | perdido
  source TEXT,                            -- sitio web, Meta Ads, referido...
  campaign_id INTEGER,
  owner TEXT,                             -- responsable
  tags TEXT, notes TEXT,
  last_contact_at TEXT,
  ref TEXT,                               -- origen externo, p. ej. 'lead:123' (formulario del sitio)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mk_contacts_org ON mk_contacts(org_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mk_contacts_ref ON mk_contacts(org_id, ref);

CREATE TABLE IF NOT EXISTS mk_deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  title TEXT NOT NULL,
  contact_id INTEGER, campaign_id INTEGER,
  value INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'nuevo',    -- nuevo | calificado | propuesta | negociacion | ganado | perdido
  expected_close TEXT, closed_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mk_deals_org ON mk_deals(org_id, stage);

CREATE TABLE IF NOT EXISTS mk_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'meta_ads', -- meta_ads | google_ads | whatsapp | correo | organico | otro
  status TEXT NOT NULL DEFAULT 'activa',    -- activa | pausada | terminada
  start_date TEXT, end_date TEXT,
  budget INTEGER NOT NULL DEFAULT 0,
  goal_leads INTEGER,
  utm_campaign TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mk_campaigns_org ON mk_campaigns(org_id, status);

-- Gasto real por día/semana de cada campaña (a mano o importado; luego desde Meta/Google Ads).
CREATE TABLE IF NOT EXISTS mk_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  campaign_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0, clicks INTEGER, impressions INTEGER,
  note TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mk_spend_campaign ON mk_spend(org_id, campaign_id, date);

CREATE TABLE IF NOT EXISTS mk_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT, done INTEGER NOT NULL DEFAULT 0, done_at INTEGER,
  contact_id INTEGER, deal_id INTEGER,
  assignee TEXT, notes TEXT,
  source TEXT,                            -- manual | automatizacion:<id> | agente
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mk_tasks_org ON mk_tasks(org_id, done, due_date);

-- Reglas que se ejecutan solas (al llegar un lead y en el cron diario).
CREATE TABLE IF NOT EXISTS mk_automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,                  -- lead_nuevo | sin_contacto | presupuesto_campana | factura_vencida | semanal
  action TEXT NOT NULL,                   -- crear_tarea | crear_oportunidad | informe_ia
  days INTEGER, percent INTEGER,          -- parámetros del disparador
  task_title TEXT,                        -- título de la tarea que crea ({nombre}, {campana}, {factura})
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER, runs INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- Informes (los escribe el agente de IA o se piden desde el panel).
CREATE TABLE IF NOT EXISTS hub_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- marketing | finanzas
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hub_reports_org ON hub_reports(org_id, kind, created_at);

-- Suscripciones y herramientas externas de cada organización (Meta Business, Google Ads, CRM, hosting, APIs, IA...).
CREATE TABLE IF NOT EXISTS org_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'software', -- marketing | crm | infraestructura | software | api | ia | otro
  vendor TEXT, plan TEXT,
  cost INTEGER NOT NULL DEFAULT 0,
  cycle TEXT NOT NULL DEFAULT 'mensual',  -- mensual | anual | por uso
  renews_on TEXT,
  url TEXT, account_email TEXT,
  status TEXT NOT NULL DEFAULT 'activa',  -- activa | prueba | cancelada
  cost_center_id INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_org_tools_org ON org_tools(org_id, status);

-- ---------- Finanzas ----------
CREATE TABLE IF NOT EXISTS fin_cost_centers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'proyecto',  -- app | cliente | proyecto | departamento
  code TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_cc_code ON fin_cost_centers(org_id, code);

CREATE TABLE IF NOT EXISTS fin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'banco',     -- banco | efectivo | tarjeta | billetera
  bank TEXT, last4 TEXT,
  opening_balance INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fin_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- emitida (por cobrar) | recibida (por pagar)
  number TEXT,
  counterparty TEXT NOT NULL, tax_id TEXT,
  issue_date TEXT NOT NULL, due_date TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,        -- suma de los movimientos ligados
  status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | pagada | anulada (vencida se calcula)
  cost_center_id INTEGER, category TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_invoices_org ON fin_invoices(org_id, kind, status, due_date);

CREATE TABLE IF NOT EXISTS fin_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- ingreso | gasto
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category TEXT, description TEXT, counterparty TEXT,
  cost_center_id INTEGER, account_id INTEGER, invoice_id INTEGER, recurring_id INTEGER,
  reconciled INTEGER NOT NULL DEFAULT 0,
  ref TEXT,                               -- origen, p. ej. 'pago:12' (pago de suscripción registrado en Negocios)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_mov_org ON fin_movements(org_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_mov_ref ON fin_movements(org_id, ref);

-- Gastos recurrentes (infraestructura, software, API, IA...): el cron diario crea el movimiento cuando vence.
CREATE TABLE IF NOT EXISTS fin_recurring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL, vendor TEXT,
  category TEXT NOT NULL DEFAULT 'software', -- infraestructura | software | api | ia | marketing | otro
  amount INTEGER NOT NULL,
  cycle TEXT NOT NULL DEFAULT 'mensual',  -- mensual | anual
  next_date TEXT NOT NULL,
  cost_center_id INTEGER, account_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fin_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  month TEXT NOT NULL,                    -- 'YYYY-MM'
  cost_center_id INTEGER, category TEXT,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_budgets_org ON fin_budgets(org_id, month);

-- Extracto bancario importado (CSV) para conciliar contra los movimientos.
CREATE TABLE IF NOT EXISTS fin_bank_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  amount INTEGER NOT NULL,                -- positivo = entra, negativo = sale
  ref TEXT,
  movement_id INTEGER,                    -- conciliada con este movimiento
  imported_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_bank_org ON fin_bank_lines(org_id, account_id, date);
