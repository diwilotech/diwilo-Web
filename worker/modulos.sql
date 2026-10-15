-- Módulos de las apps (worker/src/modulos.js las crea solas; este archivo es para consultarlas o crearlas a mano):
--   npx wrangler d1 execute diwilo-admin-db --remote --file=worker/modulos.sql
CREATE TABLE IF NOT EXISTS mod_catalog (app TEXT NOT NULL, modulo TEXT NOT NULL, nombre TEXT NOT NULL, tipo TEXT, version TEXT, icono TEXT, descripcion TEXT, depende_de TEXT, orden INTEGER, en_app INTEGER NOT NULL DEFAULT 1, activo_catalogo INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, PRIMARY KEY (app, modulo));
CREATE TABLE IF NOT EXISTS mod_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, app TEXT NOT NULL, nombre TEXT NOT NULL, descripcion TEXT, precio INTEGER NOT NULL DEFAULT 0, todos INTEGER NOT NULL DEFAULT 0, por_defecto INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mod_plan_items (plan_id INTEGER NOT NULL, modulo TEXT NOT NULL, PRIMARY KEY (plan_id, modulo));
CREATE TABLE IF NOT EXISTS mod_business (app TEXT NOT NULL, business_id TEXT NOT NULL, business_name TEXT, plan_id INTEGER, version TEXT, activos INTEGER, estado TEXT NOT NULL DEFAULT 'pendiente', error TEXT, synced_at INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (app, business_id));
CREATE TABLE IF NOT EXISTS mod_exceptions (id INTEGER PRIMARY KEY AUTOINCREMENT, app TEXT NOT NULL, business_id TEXT NOT NULL, modulo TEXT NOT NULL, modo TEXT NOT NULL, desde TEXT, hasta TEXT, nota TEXT, por TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_mod_exceptions ON mod_exceptions (app, business_id);
CREATE TABLE IF NOT EXISTS mod_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, app TEXT NOT NULL, business_id TEXT, por TEXT, accion TEXT NOT NULL, detalle TEXT);
CREATE INDEX IF NOT EXISTS idx_mod_log ON mod_log (app, ts);
