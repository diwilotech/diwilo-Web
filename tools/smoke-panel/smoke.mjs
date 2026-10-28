// Prueba de humo del panel /admin. Levanta un servidor local con public/ y respuestas de /admin/api/* de mentira
// (Cloudflare Access no permite abrir el panel en local), abre Chrome y revisa lo que debe cumplir el shell común.
//   cd tools/smoke-panel && npm i && npm test          (CHROME=/ruta/a/chrome si no está en la ruta de macOS)
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const today = new Date().toISOString().slice(0, 10);
const prefs = { saved: null };
const APPS = ['pedidos', 'nutricion', 'citas', 'residentes', 'academia'].map((key) => ({ key, name: 'CD ' + key, connected: true, slug: 'required' }));
const stub = (p, method, body) => {
  if (p === 'me') return { email: 'prueba@diwilo.com', owner: true, modules: ['resumen', 'negocios', 'modulos', 'marketing', 'finanzas', 'blog', 'ia'], prefs: prefs.saved };
  if (p === 'prefs') { prefs.saved = JSON.parse(body || '{}'); return { ok: true }; }
  if (p.startsWith('stats')) return { live: 3, kpi: { views: 120, visitors: 80, leads: 4, chats: 9, whatsapp: 5, link_clicks: 7 }, series: [{ date: today, views: 20, visitors: 10 }], pages: [{ k: '/', n: 50 }], refs: [], utm: [], countries: [{ k: 'CO', n: 40 }], devices: [] };
  if (p === 'live') return { live: [1], events: [] };
  if (p === 'platform') return { apps: APPS, prices: {}, trial_days: 15, today };
  if (/^platform\/.+\/businesses/.test(p)) return { businesses: [{ id: 'b1', name: 'Demo', slug: 'demo', users: [{ id: 'u1', email: 'o@d.co', role: 'owner', status: 'active' }], paid_until: today, read_only: 0, created_at: today + 'T00:00:00Z', total_paid: 0 }], today, month_income: 0 };
  if (p === 'leads') return [{ id: 1, status: 'nuevo', name: 'Ana', email: 'a@b.co', ts: Date.now() }];
  if (p === 'team') return { modules: { resumen: 'En vivo' }, defaults: [], members: [] };
  if (p === 'blog') return [];
  if (p === 'agents') return { agents: [], templates: [], tools: [] };
  if (p === 'hub/orgs') return { orgs: [{ id: 'diwilo', name: 'Diwilo', kind: 'diwilo' }] };
  if (p === 'modulos') return { apps: APPS };
  if (/^modulos\/[a-z]+$/.test(p)) return { soporta: true, nombre: 'App', catalogo: [], planes: [{ id: 1, nombre: 'Básico', precio: 50000, modulos: [], todos: 1, negocios: 1 }], negocios: [] };
  return {};
};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/admin/api/')) {
    let b = ''; req.on('data', (d) => (b += d)).on('end', () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(stub(u.pathname.slice(11) + u.search, req.method, b))); });
    return;
  }
  let f = u.pathname === '/admin' ? '/admin.html' : u.pathname;
  if (f.startsWith('/admin/tabs/') && !path.extname(f)) f += '.html';
  const fp = path.join(root, f);
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('content-type', MIME[path.extname(fp)] || 'application/octet-stream'); res.end(fs.readFileSync(fp));
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const fails = []; let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TABS = [['resumen', 'En vivo'], ['negocios', 'Negocios'], ['marketing', 'Marketing'], ['finanzas', 'Finanzas'], ['blog', 'Blog'], ['ia', 'IA']];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  for (const [vista, vp] of [['escritorio', { width: 1280, height: 800 }], ['celular', { width: 390, height: 800, isMobile: true }]]) {
    for (const modo of ['light', 'dark']) {
      const tag = `${vista}/${modo}`;
      prefs.saved = { tema: 'verde', modo };
      const p = await browser.newPage(); await p.setViewport(vp);
      const uncaught = [], pedidos = [];
      p.on('pageerror', (e) => uncaught.push(String(e.stack || e.message).split('\n').slice(0, 2).join(' @ ')));
      p.on('request', (r) => pedidos.push(r.url()));
      await p.goto(`${base}/admin`, { waitUntil: 'networkidle0' });
      ok(await p.evaluate(() => !!document.querySelector('.dw-top') && !!document.querySelector('.dw-bottom') && !!document.querySelector('#dwSide')), `${tag}: el shell no se pintó`);
      ok(await p.evaluate(() => document.documentElement.dataset.dwTema) === 'verde', `${tag}: no aplicó el tema guardado por persona`);
      ok(await p.evaluate(() => document.documentElement.getAttribute('data-bs-theme')) === modo, `${tag}: modo ${modo} no aplicado`);
      for (const [id, nombre] of TABS) {
        await p.evaluate((id) => document.querySelector(`.dw-nav a[data-mod="${id}"], .dw-bottom a[data-mod="${id}"]`).click(), id);
        await wait(500);
        const r = await p.evaluate((id) => ({ titulo: document.querySelector('[data-top-title]').textContent, visible: !document.querySelector(`[data-section="${id}"]`).hidden, activo: !!document.querySelector(`.dw-nav a[data-mod="${id}"].active`), desborde: document.documentElement.scrollWidth - innerWidth }), id);
        ok(r.titulo === nombre, `${tag}/${id}: título «${r.titulo}»`);
        ok(r.visible && r.activo, `${tag}/${id}: sección o menú sin marcar`);
        ok(r.desborde <= 0, `${tag}/${id}: desborde horizontal de ${r.desborde}px`);
      }
      // Negocios: Precios y pruebas en un modal
      await p.evaluate(() => document.querySelector('.dw-nav a[data-mod="negocios"]').click()); await wait(500);
      await p.evaluate(() => document.querySelector('#priceBtn').click()); await wait(900);
      ok(await p.evaluate(() => !!document.querySelector('dialog.pricedlg[open] input[name^="price_"]') && !!document.querySelector('dialog.pricedlg [data-csv]')), `${tag}: el modal de precios y pruebas no abrió`);
      await p.evaluate(() => document.querySelector('dialog.pricedlg [data-no]').click());
      ok(await p.evaluate(() => !!document.querySelector('#bizBody .estado-fecha')), `${tag}: Estado sin la fecha debajo`);
      // Finanzas y Marketing: la página del módulo ocupa el espacio como en las apps, sin título repetido
      for (const t of ['finanzas', 'marketing']) {
        await p.evaluate((t) => document.querySelector(`.dw-nav a[data-mod="${t}"]`).click(), t); await wait(500);
        const m = await p.evaluate((t) => { const f = document.querySelector(`[data-section="${t}"] iframe`); return { h: f.getBoundingClientRect().height, h1: !!document.querySelector(`[data-section="${t}"] h1`) }; }, t);
        ok(m.h > 300 && !m.h1, `${tag}/${t}: marco ${Math.round(m.h)}px, h1 repetido: ${m.h1}`);
      }
      // aviso de la campana (lead nuevo + negocio por vencer) y toast de Bootstrap
      ok(await p.evaluate(() => document.querySelectorAll('[data-notifs] a').length) >= 1, `${tag}: la campana no muestra avisos`);
      ok(await p.evaluate(() => { document.querySelector('[data-bs-toggle=dropdown][aria-label="Menú de usuario"]'); return true; }), `${tag}: menú de usuario`);
      // la apariencia ya no está en el menú de usuario (la maneja Marca); el panel sigue el tema que Marca guarda (mensaje del marco)
      ok(await p.evaluate(() => !document.querySelector('[data-tema]') && !/Apariencia/.test(document.querySelector('.dw-top').innerText + document.querySelector('.dw-top .dropdown-menu.dropdown-menu-end.shadow-sm')?.innerHTML)), `${tag}: el menú de usuario aún trae Apariencia`);
      await p.evaluate(() => window.postMessage({ dw: 'tema-guardado', tema: 'rosa', modo: 'light' }, location.origin));
      await wait(300);
      ok(await p.evaluate(() => document.documentElement.dataset.dwTema) === 'rosa', `${tag}: no siguió el tema guardado por Marca`);
      // Inicio es la primera pestaña y sus alertas llegan a la campana
      ok(await p.evaluate(() => document.querySelector('.dw-nav a[data-mod]')?.dataset.mod) === 'dashboard', `${tag}: el Dashboard no es la primera pestaña`);
      await p.evaluate(() => window.postMessage({ dw: 'avisos', origen: 'dashboard', alertas: [{ icono: 'bi-alarm', texto: 'Alerta de prueba', mod: 'marketing' }] }, location.origin));
      await wait(200);
      ok(await p.evaluate(() => /Alerta de prueba/.test(document.querySelector('[data-notifs]').innerText)), `${tag}: la alerta del Dashboard no llegó a la campana`);
      ok(!pedidos.some((u) => /phosphor/i.test(u)), `${tag}: sigue cargando Phosphor`);
      ok(await p.evaluate(() => !document.querySelector('[class*="ph-"]')), `${tag}: quedan íconos ph-*`);
      ok(uncaught.length === 0, `${tag}: errores sin capturar: ${[...new Set(uncaught)].join(' | ')}`);
      await p.close();
    }
  }
} finally { await browser.close(); server.close(); }
console.log(fails.length ? `FALLÓ (${fails.length} de ${checks}):\n- ${fails.join('\n- ')}` : `Todo bien (${checks} comprobaciones)`);
process.exit(fails.length ? 1 : 0);
