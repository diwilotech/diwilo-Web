/**
 * Cuentas de cobro (y facturas) en PDF desde Finanzas.
 *   GET  /admin/api/hub/:org/billing/profile        datos de quien cobra (nombre, documento, banco, notas, consecutivo)
 *   PUT  /admin/api/hub/:org/billing/profile
 *   GET  /admin/api/hub/:org/billing/fx?date=…       TRM oficial de una fecha
 *   GET  /admin/api/hub/:org/invoices/:id/pdf        documento listo para imprimir o guardar como PDF
 * Las líneas de cada cuenta se guardan en fin_invoices.items (JSON): [{ concepto, detalle?, cantidad, moneda, valor, trm? }]
 * El documento se arma en HTML con diseño de impresión (A4); el navegador lo guarda como PDF con texto real (nítido y buscable).
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const usdTxt = (n) => 'USD ' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (d) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// Datos de quien cobra. Diwilo arranca con los de las cuentas de cobro que ya usabas; cada negocio tiene los suyos.
const DIWILO_PROFILE = {
  title: 'Cuenta de cobro', prefix: 'DW-', next_number: 1, due_days: 15,
  issuer_name: 'Yomar Alejandro Echavarría Castaño', issuer_doc_label: 'NIT', issuer_doc: '1.000.746.320', issuer_doc_city: 'Medellín (Antioquia)',
  signer_doc_label: 'Cédula de ciudadanía',
  brand: 'Diwilo', tagline: 'Datos, automatización e inteligencia artificial', web: 'diwilo.com', email: 'info@diwilo.com', phone: '305 384 0193', city: 'Medellín, Colombia',
  bank: 'Bancolombia', account_type: 'ahorros', account_number: '912-109015-37', breb_key: '1000746320', whatsapp: '573053840193',
  legal: 'Los valores relacionados en este documento no incluyen retención en la fuente ni otras cargas tributarias, las cuales deberán ser asumidas por quien realiza el pago.',
  signature: '',
};
const FIELDS = Object.keys(DIWILO_PROFILE);

let ready = false;
export async function ensureBilling(env) {
  if (ready) return;
  for (const c of ['items TEXT', 'concept TEXT', 'client_email TEXT', 'client_city TEXT', 'verify_code TEXT']) await env.DB.prepare(`ALTER TABLE fin_invoices ADD COLUMN ${c}`).run().catch(() => {});
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_invoices_verify ON fin_invoices(verify_code)').run().catch(() => {});
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS fin_billing_profile (org_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
  ready = true;
}

export async function getProfile(env, org) {
  await ensureBilling(env);
  const row = await env.DB.prepare('SELECT data FROM fin_billing_profile WHERE org_id = ?').bind(org).first();
  let saved = {}; try { saved = JSON.parse(row?.data || '{}'); } catch {}
  if (org === 'diwilo') return { ...DIWILO_PROFILE, ...saved };
  const o = await env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first();
  return { ...Object.fromEntries(FIELDS.map((k) => [k, ''])), title: 'Cuenta de cobro', prefix: '', next_number: 1, due_days: 15, brand: o?.name || '', issuer_name: o?.name || '', issuer_doc_label: 'NIT', signer_doc_label: 'Documento', ...saved };
}

export async function saveProfile(env, org, body) {
  const cur = await getProfile(env, org), out = { ...cur };
  for (const k of FIELDS) {
    if (!(k in body)) continue;
    if (k === 'next_number' || k === 'due_days') { const n = Math.round(Number(body[k])); if (n >= 0 && n < 1e7) out[k] = n; continue; }
    if (k === 'signature') { const v = String(body[k] || ''); if (v && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw new Error('La firma debe ser una imagen PNG o JPG'); if (v.length > 400000) throw new Error('La imagen de la firma pesa demasiado (máx. 300 KB)'); out[k] = v; continue; }
    out[k] = String(body[k] ?? '').trim().slice(0, k === 'legal' ? 1200 : 200);
  }
  await env.DB.prepare('INSERT INTO fin_billing_profile (org_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(org_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(org, JSON.stringify(out), Date.now()).run();
  return out;
}

// Consecutivo: DW-0001, DW-0002… (salta los que ya existan)
export async function nextNumber(env, org) {
  const p = await getProfile(env, org);
  let n = Math.max(1, Number(p.next_number) || 1), num;
  for (let i = 0; i < 1000; i++, n++) {
    num = `${p.prefix || ''}${String(n).padStart(4, '0')}`;
    if (!(await env.DB.prepare('SELECT 1 FROM fin_invoices WHERE org_id = ? AND number = ?').bind(org, num).first())) break;
  }
  await saveProfile(env, org, { next_number: n + 1 });
  return num;
}

// Líneas: valida, convierte las de dólares con su TRM y calcula el total en pesos
export async function priceItems(items, trmFor) {
  if (!Array.isArray(items)) return null;
  const out = [];
  for (const it of items.slice(0, 40)) {
    const concepto = String(it.concepto || it.concept || '').trim().slice(0, 300);
    if (!concepto) continue;
    const cantidad = Math.max(0, Number(String(it.cantidad ?? 1).replace(',', '.')) || 0) || 1;
    const moneda = it.moneda === 'USD' ? 'USD' : 'COP';
    const valor = Math.max(0, Number(String(it.valor ?? it.dolares ?? 0).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0);
    const trm = moneda === 'USD' ? Number(it.trm) > 1000 ? Number(it.trm) : await trmFor() : null;
    const unit = moneda === 'USD' ? Math.round(valor * trm) : Math.round(valor);
    out.push({ concepto, detalle: String(it.detalle || '').trim().slice(0, 300) || undefined, cantidad, moneda, valor, ...(trm ? { trm } : {}), total: Math.round(unit * cantidad) });
  }
  return out;
}

/* ---------------- validación pública (QR del documento) ---------------- */
const SITE = 'https://diwilo.com';
// Código aleatorio (50 bits, sin letras confusas): no se puede adivinar ni sacar del número del documento
async function verifyCode(env, inv) {
  if (inv.verify_code) return inv.verify_code;
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = crypto.getRandomValues(new Uint8Array(10));
  const code = [...b].map((x) => abc[x % abc.length]).join('');
  await env.DB.prepare('UPDATE fin_invoices SET verify_code = ? WHERE id = ? AND verify_code IS NULL').bind(code, inv.id).run();
  return (await env.DB.prepare('SELECT verify_code FROM fin_invoices WHERE id = ?').bind(inv.id).first()).verify_code;
}
const mask = (s) => { const t = String(s || '').replace(/\s/g, ''); return t.length > 4 ? '•'.repeat(Math.max(3, t.length - 4)) + t.slice(-4) : t; };

// GET /validar/:código — página pública: confirma que el documento existe y muestra sus datos básicos
export async function validatePage(req, env) {
  await ensureBilling(env);
  const code = decodeURIComponent(new URL(req.url).pathname.split('/')[2] || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  const inv = code.length >= 8 ? await env.DB.prepare('SELECT * FROM fin_invoices WHERE verify_code = ?').bind(code).first() : null;
  const p = inv ? await getProfile(env, inv.org_id) : null;
  const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const st = !inv ? null : inv.status === 'anulada' ? ['bad', 'Anulada', 'Este documento fue anulado y no se debe pagar.']
    : inv.status === 'pagada' ? ['ok', 'Pagada', 'Este documento ya fue pagado en su totalidad.']
    : inv.due_date && inv.due_date < today ? ['warn', 'Pendiente · vencida', 'El documento es válido y su pago está pendiente (ya pasó la fecha límite).']
    : ['ok', 'Pendiente de pago', 'El documento es válido y su pago está pendiente.'];
  const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
  const body = inv ? `<div class="badge ${st[0]}">${st[0] === 'bad' ? '✕' : '✓'}</div>
      <h1>${st[0] === 'bad' ? 'Documento anulado' : 'Documento válido'}</h1>
      <p class="lead">${esc(st[2])} Fue emitido por ${esc(p.brand || p.issuer_name)} y está registrado en su sistema.</p>
      <dl>${row('Documento', `${esc(p.title)} N.º ${esc(inv.number || '#' + inv.id)}`)}${row('Fecha', esc(fecha(inv.issue_date)))}${row('Pagar antes del', esc(fecha(inv.due_date)))}
        ${row('Cliente', esc(inv.counterparty))}${row('NIT del cliente', inv.tax_id ? esc(mask(inv.tax_id)) : '')}${row('Total', `<b>${pesos(inv.total)} COP</b>`)}
        ${row('Estado', `<span class="st ${st[0]}">${esc(st[1])}</span>`)}${row('Emitido por', `${esc(p.issuer_name)}${p.issuer_doc ? ` · ${esc(p.issuer_doc_label || 'NIT')} ${esc(mask(p.issuer_doc))}` : ''}`)}${row('Código', `<code>${esc(code)}</code>`)}</dl>
      <p class="note">Compara estos datos con tu documento. Si algo no coincide, no pagues y escríbenos${p.email ? ` a ${esc(p.email)}` : ''}${p.phone ? ` o al ${esc(p.phone)}` : ''}.</p>`
    : `<div class="badge bad">?</div><h1>No encontramos este documento</h1><p class="lead">El código${code ? ` <code>${esc(code)}</code>` : ''} no corresponde a ninguna cuenta de cobro emitida. Revisa que el enlace o el QR estén completos; si el documento te llegó a nombre de Diwilo, escríbenos a info@diwilo.com antes de pagar.</p>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${inv ? 'Documento válido' : 'Validar documento'} · Diwilo</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:radial-gradient(1200px 600px at 50% -10%,#2a1950,#0b0a14 60%);color:#e9e6f5;font:15px/1.55 Inter,system-ui,sans-serif}
main{width:min(560px,100%);background:#14121f;border:1px solid #2b2742;border-radius:22px;padding:30px 26px;box-shadow:0 30px 80px rgba(0,0,0,.45)}
.top{display:flex;align-items:center;gap:10px;margin-bottom:22px;color:#b8b3d1;font-size:13px}.top svg{width:26px;height:27px}.top b{font:600 17px 'Space Grotesk',sans-serif;color:#fff}
.badge{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:26px;font-weight:700}.badge.ok,.badge.warn{background:rgba(74,222,128,.14);color:#4ade80}.badge.bad{background:rgba(248,113,113,.14);color:#f87171}
h1{font:600 26px/1.2 'Space Grotesk',sans-serif;margin:14px 0 6px;color:#fff}.lead{color:#b8b3d1;margin:0 0 18px}
dl{margin:0;border-top:1px solid #2b2742}dl div{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid #2b2742}dt{color:#8f8aab}dd{margin:0;text-align:right}
code{font-family:ui-monospace,monospace;letter-spacing:.06em;color:#c9b5fb}.st{padding:2px 10px;border-radius:999px;font-size:13px}.st.ok{background:rgba(74,222,128,.14);color:#4ade80}.st.warn{background:rgba(251,191,36,.14);color:#fbbf24}.st.bad{background:rgba(248,113,113,.14);color:#f87171}
.note{color:#8f8aab;font-size:13px;margin:18px 0 0}a{color:#c9b5fb}</style></head><body><main>
<div class="top">${LOGO.replace('aria-hidden="true"', 'aria-hidden="true" style="width:26px;height:27px"')}<b>Diwilo</b><span>· Validación de documentos</span></div>
${body}
<p class="note" style="margin-top:22px"><a href="${SITE}">diwilo.com</a></p></main></body></html>`;
  return new Response(html, { status: inv ? 200 : 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
}

/* ---------------- valor en letras ---------------- */
const U = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function under1000(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100;
  const rest = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : '');
  return [C[c], rest].filter(Boolean).join(' ');
}
export function enLetras(value) {
  let n = Math.round(Math.abs(Number(value) || 0));
  if (n === 0) return 'Cero pesos colombianos';
  const parts = [];
  const millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), unidades = n % 1000;
  if (millones) parts.push(millones === 1 ? 'un millón' : `${under1000(millones % 1000)} millones`);
  if (miles) parts.push(miles === 1 ? 'mil' : `${under1000(miles)} mil`);
  if (unidades) parts.push(under1000(unidades));
  let txt = parts.join(' ');
  txt += (!miles && !unidades && millones) ? ' de pesos colombianos' : ' pesos colombianos';
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/* ---------------- documento ---------------- */
const LOGO = `<svg viewBox="18 14 168 172" aria-hidden="true"><defs><linearGradient id="dwlp" gradientUnits="userSpaceOnUse" x1="30" y1="20" x2="170" y2="180"><stop offset="0" stop-color="#a66cf5"/><stop offset="1" stop-color="#5b21b6"/></linearGradient></defs><g fill="none" stroke="url(#dwlp)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"><path d="M48 72V146Q48 170 72 170H84"/><path d="M156.6 135A70 70 0 0 0 96 30H86"/><path d="M84 134V124Q84 108 100 108H124"/></g><g fill="url(#dwlp)"><circle cx="48" cy="34" r="13"/><circle cx="112" cy="72" r="13"/><circle cx="125.6" cy="163.4" r="13"/></g></svg>`;

export async function invoiceDocument(env, org, inv, { autoprint = false } = {}) {
  const p = await getProfile(env, org);
  let items = []; try { items = JSON.parse(inv.items || '[]'); } catch {}
  if (!items.length) items = [{ concepto: inv.concept || inv.notes || 'Servicios', cantidad: 1, moneda: 'COP', valor: inv.subtotal || inv.total, total: inv.subtotal || inv.total }];
  const subtotal = inv.subtotal || items.reduce((s, i) => s + (i.total || 0), 0), tax = inv.tax || 0, total = inv.total || subtotal + tax;
  const hasUsd = items.some((i) => i.moneda === 'USD');
  const number = inv.number || `#${inv.id}`;
  const stamp = inv.status === 'pagada' ? 'Pagada' : inv.status === 'anulada' ? 'Anulada' : '';
  const wa = p.whatsapp ? `https://wa.me/${p.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, envío el comprobante de pago de la ${p.title.toLowerCase()} ${number} por ${pesos(total)}.`)}` : '';
  const fileName = `${p.title} ${number} - ${inv.counterparty}`.replace(/[\\/:*?"<>|]/g, '');
  const vcode = await verifyCode(env, inv), vurl = `${SITE}/validar/${vcode}`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fileName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
:root{--ink:#14112b;--ink2:#4a4766;--ink3:#8a87a3;--line:#e7e4f2;--soft:#f6f3fd;--brand:#7c3aed;--brand2:#5b21b6}
html{background:#e9e7f1}
body{margin:0;font:12px/1.45 Inter,system-ui,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:sticky;top:0;z-index:5;display:flex;gap:10px;justify-content:center;align-items:center;padding:12px 16px;background:#14112b;color:#fff;font-size:13px}
.bar button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:9px 18px;cursor:pointer;background:#a66cf5;color:#fff}.bar button.sec{background:transparent;box-shadow:inset 0 0 0 1px #5a5580}
.bar span{opacity:.7}
.page{width:210mm;min-height:297mm;margin:24px auto;background:#fff;box-shadow:0 10px 40px rgba(20,17,43,.15);padding:16mm 16mm 14mm;position:relative;display:flex;flex-direction:column;overflow:hidden}
.page::before{content:"";position:absolute;inset:0 0 auto 0;height:5px;background:linear-gradient(90deg,#a66cf5,#7c3aed 45%,#5b21b6)}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
.brand{display:flex;gap:10px;align-items:center}.brand svg{width:36px;height:38px}
.brand b{display:block;font:600 19px/1.1 'Space Grotesk',sans-serif;letter-spacing:-.02em}.brand small{color:var(--ink3);font-size:10.5px}
.doc{text-align:right}.doc h1{margin:0;font:600 12px/1 Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--brand)}
.doc .num{font:600 21px/1.15 'Space Grotesk',sans-serif;margin-top:6px;letter-spacing:-.01em}
.doc dl{display:grid;grid-template-columns:auto auto;gap:1px 12px;margin:6px 0 0;font-size:11px;justify-content:end}.doc dt{color:var(--ink3)}.doc dd{margin:0;font-weight:500}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
.party{border:1px solid var(--line);border-radius:10px;padding:9px 12px}
.party h2,.sec h2{margin:0 0 5px;font:600 9.5px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3)}
.party b{display:block;font-size:12.5px;font-weight:600;text-transform:uppercase;letter-spacing:.01em}.party span{display:block;color:var(--ink2);font-size:11px}
.amount{margin-top:10px;border-radius:12px;padding:11px 16px;background:linear-gradient(135deg,#f6f0ff,#efe6ff 60%,#f8f4ff);display:flex;justify-content:space-between;align-items:center;gap:16px}
.amount small{display:block;color:var(--ink2);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.amount .v{font:600 24px/1.1 'Space Grotesk',sans-serif;color:var(--brand2);white-space:nowrap}
.amount .w{color:var(--ink2);font-size:11.5px;font-style:italic;text-align:right;max-width:58%}
.sec{margin-top:13px}.concept{color:var(--ink2);margin:0}
table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11.5px}
thead th{text-align:left;font:600 9.5px/1 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);padding:7px 8px;border-bottom:1.5px solid var(--ink)}
tbody td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}td.c,th.c{text-align:center}
td small{display:block;color:var(--ink3);font-size:10px;margin-top:1px}
.idx{color:var(--ink3);width:26px}
.totals{display:flex;justify-content:flex-end;margin-top:6px}
.totals dl{display:grid;grid-template-columns:auto auto;gap:6px 28px;margin:0;min-width:240px;font-variant-numeric:tabular-nums}
.totals dt{color:var(--ink2)}.totals dd{margin:0;text-align:right}
.totals .t{font-weight:600;font-size:13.5px;color:var(--ink);padding-top:8px;border-top:1.5px solid var(--ink)}
.pay{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;margin-top:13px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;break-inside:avoid}
.pay p{margin:1px 0;color:var(--ink2);font-size:11.5px}.breb{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:3px!important}.bb{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--soft);color:var(--brand2);font:700 10px/1.4 Inter,sans-serif;letter-spacing:.04em;box-shadow:inset 0 0 0 1px #ddd0fb}.pay strong{color:var(--ink)}
.qr{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:9px;line-height:1.3;color:var(--ink3);text-align:center;width:80px}.qr svg{width:62px;height:62px}
.legal{margin-top:10px;color:var(--ink3);font-size:10px}
.sign{margin-top:auto;padding-top:26px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;break-inside:avoid}
.sign .who{min-width:240px}.sign img{max-height:54px;max-width:220px;display:block;margin-bottom:-6px}
.sign .line{border-top:1px solid var(--ink);padding-top:6px;margin-top:${p.signature ? '4px' : '48px'}}
.sign .who b{display:block}.sign .who span{display:block;color:var(--ink2);font-size:11px}
.sign .thanks{color:var(--ink3);font-size:11px;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.verify{display:flex;gap:9px;align-items:center;text-align:left;border:1px solid var(--line);border-radius:10px;padding:7px 9px}.verify #qrv svg{width:58px;height:58px;display:block}.verify b{display:block;color:var(--ink);font-size:10.5px}.verify span{display:block;font-size:9.5px;line-height:1.35}.verify code{display:block;margin-top:2px;font:600 9.5px ui-monospace,monospace;letter-spacing:.08em;color:var(--brand2)}
footer{margin-top:12px;padding-top:8px;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:var(--ink3);font-size:9.5px}
.stamp{position:absolute;top:120px;right:-6px;transform:rotate(-12deg);border:3px solid currentColor;border-radius:10px;padding:4px 16px;font:700 26px/1 'Space Grotesk',sans-serif;letter-spacing:.12em;text-transform:uppercase;opacity:.22;color:${inv.status === 'anulada' ? '#dc2626' : '#16a34a'}}
@media print{html{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none;width:210mm;min-height:296mm;height:auto;overflow:visible;padding:11mm 13mm 8mm}.page::before{height:4px}tr,.party,.amount,.pay,.sign{break-inside:avoid}.sign{padding-top:${p.signature ? '4px' : '14px'}}.sign img{max-height:48px;margin-bottom:-10px}}
@media screen and (max-width:820px){.page{width:auto;min-height:0;margin:12px;padding:20px}.parties{grid-template-columns:1fr}.amount{flex-direction:column;align-items:flex-start}.amount .w{text-align:left;max-width:none}}
</style></head><body>
<div class="bar"><button onclick="print()">Descargar PDF</button><button class="sec" onclick="history.length>1?history.back():close()">Cerrar</button><span>En la ventana de impresión elige «Guardar como PDF».</span></div>
<main class="page">
  ${stamp ? `<div class="stamp">${stamp}</div>` : ''}
  <header>
    <div class="brand">${org === 'diwilo' ? LOGO : ''}<div><b>${esc(p.brand || p.issuer_name)}</b><small>${esc(p.tagline || '')}</small></div></div>
    <div class="doc"><h1>${esc(p.title)}</h1><div class="num">N.º ${esc(number)}</div>
      <dl><dt>Fecha</dt><dd>${esc(fecha(inv.issue_date))}</dd>${inv.due_date ? `<dt>Pagar antes del</dt><dd>${esc(fecha(inv.due_date))}</dd>` : ''}<dt>Ciudad</dt><dd>${esc(p.city || '')}</dd></dl></div>
  </header>
  <section class="parties">
    <div class="party"><h2>Cobrar a</h2><b>${esc(inv.counterparty)}</b>${inv.tax_id ? `<span>NIT ${esc(inv.tax_id)}</span>` : ''}${inv.client_city ? `<span>${esc(inv.client_city)}</span>` : ''}${inv.client_email ? `<span>${esc(inv.client_email)}</span>` : ''}</div>
    <div class="party"><h2>El monto es adeudado a</h2><b>${esc(p.issuer_name)}</b>${p.issuer_doc ? `<span>${esc(p.issuer_doc_label || 'NIT')} ${esc(p.issuer_doc)}${p.issuer_doc_city ? ` de ${esc(p.issuer_doc_city)}` : ''}</span>` : ''}<span>${[p.phone, p.email].filter(Boolean).map(esc).join(' · ')}</span></div>
  </section>
  <section class="amount"><div><small>Por la suma de</small><div class="v">${pesos(total)} <span style="font-size:14px;font-weight:500">COP</span></div></div><div class="w">${esc(enLetras(total))}</div></section>
  ${inv.concept ? `<section class="sec"><h2>Por concepto de</h2><p class="concept">${esc(inv.concept).replace(/\n/g, '<br>')}</p></section>` : ''}
  <section class="sec">
    <table><thead><tr><th class="idx">#</th><th>Concepto</th><th class="c">Cant.</th><th class="n">Valor unitario</th><th class="n">Total</th></tr></thead><tbody>
    ${items.map((i, k) => `<tr><td class="idx">${k + 1}</td><td>${esc(i.concepto)}${i.detalle ? `<small>${esc(i.detalle)}</small>` : ''}${i.moneda === 'USD' ? `<small>${usdTxt(i.valor)} × TRM $${Number(i.trm).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${esc(fecha(inv.issue_date))})</small>` : ''}</td>
      <td class="c">${Number(i.cantidad || 1).toLocaleString('es-CO')}</td><td class="n">${i.moneda === 'USD' ? `${usdTxt(i.valor)}<small>${pesos(Math.round(i.valor * i.trm))}</small>` : pesos(i.valor)}</td><td class="n">${pesos(i.total)}</td></tr>`).join('')}
    </tbody></table>
    <div class="totals"><dl>${tax ? `<dt>Subtotal</dt><dd>${pesos(subtotal)}</dd><dt>Impuestos</dt><dd>${pesos(tax)}</dd>` : ''}<dt class="t">Total a pagar</dt><dd class="t">${pesos(total)}</dd></dl></div>
  </section>
  ${p.account_number || p.breb_key ? `<section class="pay"><div><h2 style="margin:0 0 6px;font:600 9.5px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3)">Forma de pago</h2>
    ${p.breb_key ? `<p class="breb"><span class="bb">Bre-B</span><span>Paga al instante desde cualquier banco o billetera con la <strong>llave ${esc(p.breb_key)}</strong>.</span></p>` : ''}
    ${p.account_number ? `<p>${p.breb_key ? 'O consigna o transfiere' : 'Consignar o transferir'} a la <strong>cuenta de ${esc(p.account_type || 'ahorros')} N.º ${esc(p.account_number)} de ${esc(p.bank)}</strong>, a nombre de ${esc(p.issuer_name)}.</p>` : ''}
    <p>Usa como referencia <strong>${esc(number)}</strong>. Cualquier inquietud: ${[p.phone && `celular ${esc(p.phone)}`, p.email && esc(p.email)].filter(Boolean).join(' o ')}.</p>
    ${hasUsd ? '<p style="font-size:11.5px">Los valores en dólares se convirtieron a pesos con la TRM oficial (Banco de la República) indicada en cada línea.</p>' : ''}</div>
    ${wa ? `<div class="qr"><div id="qr"></div>Escanea para enviar el comprobante por WhatsApp</div>` : ''}</section>` : ''}
  ${p.legal ? `<p class="legal">${esc(p.legal)}</p>` : ''}
  <section class="sign"><div class="who">${p.signature ? `<img src="${esc(p.signature)}" alt="Firma">` : ''}<div class="line"><b>${esc(p.issuer_name)}</b>${p.issuer_doc ? `<span>${esc(p.signer_doc_label || p.issuer_doc_label || 'Documento')}: ${esc(p.issuer_doc)}</span>` : ''}${p.phone ? `<span>Teléfono: ${esc(p.phone)}</span>` : ''}</div></div>
    <div class="thanks"><div class="verify"><div id="qrv"></div><div><b>Valida este documento</b><span>Escanea el código o entra a<br>diwilo.com/validar</span><code>${esc(vcode)}</code></div></div>Gracias por confiar en ${esc(p.brand || 'nosotros')}.</div></section>
  <footer><span>${[p.web, p.email, p.phone].filter(Boolean).map(esc).join(' · ')}</span><span>${esc(p.title)} ${esc(number)}</span></footer>
</main>
<script>
try{var v=qrcode(0,'M');v.addData(${JSON.stringify(vurl)});v.make();document.getElementById('qrv').innerHTML=v.createSvgTag({cellSize:3,margin:0,scalable:true});}catch(e){}
${wa ? `try{var q=qrcode(0,'M');q.addData(${JSON.stringify(wa)});q.make();document.getElementById('qr').innerHTML=q.createSvgTag({cellSize:3,margin:0,scalable:true});}catch(e){}` : ''}
${autoprint ? "addEventListener('load',function(){setTimeout(function(){print()},400)});" : ''}
</script></body></html>`;
}
