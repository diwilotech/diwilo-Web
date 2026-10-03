/* Tarjeta de presentación digital: página pública y archivo vCard */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const digits = (s) => String(s || '').replace(/[^\d+]/g, '');
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

export function renderVcf(c) {
  const v = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const parts = (c.name || '').trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : '';
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${v(last)};${v(parts.join(' '))};;;`, `FN:${v(c.name)}`,
    c.company && `ORG:${v(c.company)}`, c.role && `TITLE:${v(c.role)}`,
    c.phone && `TEL;TYPE=CELL:${digits(c.phone)}`,
    c.whatsapp && c.whatsapp !== c.phone && `TEL;TYPE=WORK:${digits(c.whatsapp)}`,
    c.email && `EMAIL;TYPE=INTERNET:${v(c.email)}`,
    c.website && `URL:${v(c.website)}`,
    c.photo_url && `PHOTO;VALUE=URI:${v(c.photo_url)}`,
    c.bio && `NOTE:${v(c.bio)}`,
    'END:VCARD'
  ].filter(Boolean).join('\r\n');
}

// Colores de tarjeta: [principal, claro, brillo rgba]
export const ACCENT = {
  violeta: ['#8f45f2', '#c99bfa', '168,85,247'],
  azul: ['#2f6fed', '#93c5fd', '59,130,246'],
  verde: ['#0f9f6e', '#6ee7b7', '16,185,129'],
  ambar: ['#d97706', '#fcd34d', '245,158,11'],
  rosa: ['#db2777', '#f9a8d4', '236,72,153']
};

/* Manifest para instalar la tarjeta como app propia (un ícono por persona) */
export function cardManifest(c) {
  const base = `/c/${encodeURIComponent(c.slug)}`;
  const v = c.updated_at || c.created_at;
  const first = (c.name || 'Tarjeta').trim().split(/\s+/)[0];
  const icons = [192, 512].flatMap((n) => [
    { src: `${base}/icon-${n}.png?v=${v}`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any' },
    { src: `${base}/icon-${n}.png?v=${v}`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'maskable' }
  ]);
  return {
    id: base,
    name: `${c.name}${c.company ? ' · ' + c.company : ''}`,
    short_name: first.slice(0, 12),
    description: [c.role, c.company].filter(Boolean).join(' · ') || 'Tarjeta de presentación',
    start_url: `${base}?app=1`,
    scope: `${base}`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#05060f',
    theme_color: '#05060f',
    icons
  };
}

/* Service worker: red primero y, sin conexión, la última copia guardada */
export const CARD_SW = `const CACHE = 'diwilo-tarjetas-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const own = u.origin === location.origin && (u.pathname.startsWith('/c/') || u.pathname.startsWith('/assets/img/'));
  const cdn = /(fonts\\.googleapis|fonts\\.gstatic|cdn\\.jsdelivr)\\./.test(u.hostname);
  if (!own && !cdn) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: u.origin === location.origin })));
});
`;

export function renderCard(c, origin) {
  const [ac, acLight, acRgb] = ACCENT[c.accent] || ACCENT.violeta;
  const url = `${origin}/c/${encodeURIComponent(c.slug)}`;
  const wa = digits(c.whatsapp || c.phone).replace('+', '');
  const ig = (c.instagram || '').replace(/^@/, '');
  const actions = [
    wa && `<a class="act" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"><i class="ph-light ph-whatsapp-logo"></i>WhatsApp</a>`,
    c.phone && `<a class="act" href="tel:${esc(digits(c.phone))}"><i class="ph-light ph-phone"></i>Llamar</a>`,
    c.email && `<a class="act" href="mailto:${esc(c.email)}"><i class="ph-light ph-envelope-simple"></i>Correo</a>`,
    safeUrl(c.website) && `<a class="act" href="${esc(c.website)}" target="_blank" rel="noopener"><i class="ph-light ph-globe"></i>Sitio web</a>`,
    ig && `<a class="act" href="https://www.instagram.com/${esc(ig)}/" target="_blank" rel="noopener"><i class="ph-light ph-instagram-logo"></i>Instagram</a>`,
    safeUrl(c.linkedin) && `<a class="act" href="${esc(c.linkedin)}" target="_blank" rel="noopener"><i class="ph-light ph-linkedin-logo"></i>LinkedIn</a>`
  ].filter(Boolean).join('');
  const initials = esc((c.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
  const photo = safeUrl(c.photo_url) ? `<img class="photo" src="${esc(c.photo_url)}" alt="${esc(c.name)}">` : `<div class="photo">${initials}</div>`;

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.name)}${c.company ? ' · ' + esc(c.company) : ''}</title>
<meta name="description" content="${esc([c.role, c.company].filter(Boolean).join(' · '))}">
<meta property="og:title" content="${esc(c.name)}"><meta property="og:description" content="${esc(c.bio || c.role || '')}">
${safeUrl(c.photo_url) ? `<meta property="og:image" content="${esc(c.photo_url)}">` : ''}
<meta name="theme-color" content="#05060f">
<link rel="manifest" href="/c/${encodeURIComponent(c.slug)}/manifest.webmanifest">
<link rel="icon" type="image/png" href="/c/${encodeURIComponent(c.slug)}/icon-192.png?v=${c.updated_at || c.created_at}">
<link rel="apple-touch-icon" href="/c/${encodeURIComponent(c.slug)}/icon-192.png?v=${c.updated_at || c.created_at}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${esc((c.name || '').trim().split(/\s+/)[0])}">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Space+Grotesk:wght@500&family=JetBrains+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/light/style.css">
<style>
:root{--ink:#d1e4fa;--ink2:#c7d3ea;--ink3:#9da7ba;--hi:#d8ecf8;--edge:rgba(186,215,247,.12);--violet:${ac};--lilac:${acLight};--glow:${acRgb}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#05060f;color:var(--ink);font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;padding:32px 16px;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0 0 auto;height:620px;pointer-events:none;background:conic-gradient(at 50% -5%,transparent 45%,rgba(var(--glow),.3) 48.5%,rgba(124,145,182,.5) 50%,rgba(var(--glow),.3) 51.5%,transparent 55%);-webkit-mask-image:linear-gradient(#000 50%,transparent);mask-image:linear-gradient(#000 50%,transparent)}
.card{position:relative;width:100%;max-width:400px;border-radius:20px;background:rgba(5,6,15,.92);padding:32px 24px 24px;text-align:center;box-shadow:inset 0 1px 1px rgba(216,236,248,.2),inset 0 24px 48px rgba(168,216,245,.06),0 24px 48px rgba(0,0,0,.5);animation:in .9s cubic-bezier(.22,1,.36,1) both}
@keyframes in{from{opacity:0;transform:translateY(24px) scale(.97);filter:blur(6px)}}
.photo{width:112px;height:112px;margin:0 auto 18px;border-radius:50%;object-fit:cover;padding:4px;background:linear-gradient(135deg,var(--violet),rgba(124,145,182,.5));box-shadow:0 0 32px rgba(var(--glow),.35);display:grid;place-items:center;font-family:'Space Grotesk';font-size:36px;color:#fff}
h1{margin:0;font-family:'Space Grotesk',sans-serif;font-weight:500;font-size:26px;background:linear-gradient(0deg,#98c0ef,#d8ecf8);-webkit-background-clip:text;background-clip:text;color:transparent}
.role{margin:6px 0 0;font-size:14px;color:var(--ink2)}.co{margin:4px 0 0;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3)}
.bio{margin:16px 0 0;font-size:14px;line-height:1.5;color:var(--ink3)}
.acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:24px 0 16px}
.act{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:999px;font-size:14px;color:var(--ink);text-decoration:none;box-shadow:inset 0 0 0 1px var(--edge);transition:background .2s}
.act:hover{background:rgba(186,214,247,.06);color:#fff}.act i{font-size:17px;color:var(--lilac)}
.save{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border-radius:999px;font-size:15px;font-weight:500;color:#fff;text-decoration:none;background:rgba(var(--glow),.18);box-shadow:inset 0 0 0 1px rgba(var(--glow),.6),0 0 18px rgba(var(--glow),.22)}
.save:hover{background:rgba(var(--glow),.3)}
.qr{margin:20px auto 0;display:none;width:180px;padding:12px;border-radius:12px;background:#fff}.qr.on{display:block}.qr svg{display:block;width:100%;height:auto}
.install{display:none;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:10px;padding:12px;border:0;border-radius:999px;font:500 14px Inter,sans-serif;color:var(--ink);background:none;box-shadow:inset 0 0 0 1px var(--edge);cursor:pointer}
.install.on{display:flex}.install:hover{background:rgba(186,214,247,.06);color:#fff}.install i{font-size:18px;color:var(--lilac)}
.sheet{position:fixed;inset:0;z-index:10;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px)}
.sheet.on{display:flex}
.sheet>div{width:100%;max-width:420px;margin:0 8px 8px;padding:22px 22px 18px;border-radius:20px;background:#0b0d18;box-shadow:inset 0 0 0 1px var(--edge),0 -10px 40px rgba(0,0,0,.5);animation:up .35s cubic-bezier(.22,1,.36,1)}
@keyframes up{from{transform:translateY(40px);opacity:0}}
.sheet h2{margin:0 0 14px;font:500 18px 'Space Grotesk',sans-serif;color:var(--hi);text-align:left}
.sheet ol{margin:0;padding:0;list-style:none;display:grid;gap:12px;text-align:left}
.sheet li{display:flex;gap:12px;align-items:center;font-size:14px;color:var(--ink2)}
.sheet li b{display:grid;place-items:center;flex:none;width:26px;height:26px;border-radius:50%;background:rgba(var(--glow),.2);color:#fff;font-size:12px}
.sheet li strong{color:#fff;font-weight:600}
.sheet li i{font-size:18px;color:var(--lilac);vertical-align:middle}
.sheet button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:999px;background:rgba(var(--glow),.2);color:#fff;font:500 14px Inter,sans-serif;cursor:pointer}
@media (display-mode: standalone){body{padding-top:max(32px,env(safe-area-inset-top))}}
.foot{display:flex;justify-content:center;gap:16px;margin-top:18px;font-size:12px;color:var(--ink3)}.foot button,.foot a{background:none;border:0;color:var(--ink3);font:inherit;cursor:pointer;text-decoration:none}.foot button:hover,.foot a:hover{color:#fff}
</style></head>
<body><main class="card">
  ${photo}
  <h1>${esc(c.name)}</h1>
  ${c.role ? `<p class="role">${esc(c.role)}</p>` : ''}
  ${c.company ? `<p class="co">${esc(c.company)}</p>` : ''}
  ${c.bio ? `<p class="bio">${esc(c.bio)}</p>` : ''}
  <div class="acts">${actions}</div>
  <a class="save" href="/c/${encodeURIComponent(c.slug)}.vcf"><i class="ph-light ph-address-book"></i>Guardar contacto</a>
  <div class="qr" id="qr"></div>
  <div class="foot"><button type="button" id="qrb"><i class="ph-light ph-qr-code"></i> Código QR</button><button type="button" id="share"><i class="ph-light ph-share-network"></i> Compartir</button></div>
  <button type="button" class="install" id="install"><i class="ph-light ph-device-mobile-camera"></i>Instalar en el celular</button>
</main>
<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t"><div>
  <h2 id="sheet-t">Instalar esta tarjeta</h2>
  <ol id="steps"></ol>
  <button type="button" id="sheet-ok">Entendido</button>
</div></div>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>
<script>
const url=${JSON.stringify(url)};
document.getElementById('qrb').onclick=()=>{const el=document.getElementById('qr');if(!el.innerHTML){const q=qrcode(0,'M');q.addData(url);q.make();el.innerHTML=q.createSvgTag({cellSize:4,margin:0,scalable:true});}el.classList.toggle('on');};
const $=(id)=>document.getElementById(id);
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const ua=navigator.userAgent, ios=/iphone|ipad|ipod/i.test(ua)||(/macintosh/i.test(ua)&&navigator.maxTouchPoints>1), mobile=ios||/android/i.test(ua);
let deferred=null;
if('serviceWorker' in navigator)navigator.serviceWorker.register('/c/sw.js',{scope:'/c/'}).catch(()=>{});
addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();deferred=e;$('install').classList.add('on');});
addEventListener('appinstalled',()=>{$('install').classList.remove('on');deferred=null;});
if(!standalone&&mobile)$('install').classList.add('on');
function help(){
  const steps=ios
    ?['Toca <i class="ph-light ph-export"></i> <strong>Compartir</strong> en la barra de Safari','Elige <strong>Agregar a inicio</strong> <i class="ph-light ph-plus-square"></i>','Toca <strong>Agregar</strong>: la tarjeta queda como app en tu pantalla']
    :['Abre el menú <i class="ph-light ph-dots-three-vertical"></i> del navegador','Elige <strong>Instalar app</strong> o <strong>Agregar a pantalla principal</strong>','Confirma: la tarjeta queda como app en tu pantalla'];
  $('steps').innerHTML=steps.map((t,i)=>'<li><b>'+(i+1)+'</b><span>'+t+'</span></li>').join('');
  $('sheet').classList.add('on');
}
$('install').onclick=async()=>{if(deferred){deferred.prompt();const r=await deferred.userChoice;if(r.outcome==='accepted')$('install').classList.remove('on');deferred=null;}else help();};
$('sheet-ok').onclick=()=>$('sheet').classList.remove('on');
$('sheet').onclick=(e)=>{if(e.target===$('sheet'))$('sheet').classList.remove('on');};
document.getElementById('share').onclick=async()=>{try{if(navigator.share)await navigator.share({title:document.title,url});else{await navigator.clipboard.writeText(url);alert('Enlace copiado');}}catch(e){}};
</script>
</body></html>`;
}
