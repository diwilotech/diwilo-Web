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

export function renderCard(c, origin) {
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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Space+Grotesk:wght@500&family=JetBrains+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/light/style.css">
<style>
:root{--ink:#d1e4fa;--ink2:#c7d3ea;--ink3:#9da7ba;--hi:#d8ecf8;--edge:rgba(186,215,247,.12);--violet:#8f45f2;--lilac:#c99bfa}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#05060f;color:var(--ink);font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;padding:32px 16px;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0 0 auto;height:620px;pointer-events:none;background:conic-gradient(at 50% -5%,transparent 45%,rgba(168,85,247,.3) 48.5%,rgba(124,145,182,.5) 50%,rgba(168,85,247,.3) 51.5%,transparent 55%);-webkit-mask-image:linear-gradient(#000 50%,transparent);mask-image:linear-gradient(#000 50%,transparent)}
.card{position:relative;width:100%;max-width:400px;border-radius:20px;background:rgba(5,6,15,.92);padding:32px 24px 24px;text-align:center;box-shadow:inset 0 1px 1px rgba(216,236,248,.2),inset 0 24px 48px rgba(168,216,245,.06),0 24px 48px rgba(0,0,0,.5);animation:in .9s cubic-bezier(.22,1,.36,1) both}
@keyframes in{from{opacity:0;transform:translateY(24px) scale(.97);filter:blur(6px)}}
.photo{width:112px;height:112px;margin:0 auto 18px;border-radius:50%;object-fit:cover;padding:4px;background:linear-gradient(135deg,var(--violet),rgba(124,145,182,.5));box-shadow:0 0 32px rgba(168,85,247,.35);display:grid;place-items:center;font-family:'Space Grotesk';font-size:36px;color:#fff}
h1{margin:0;font-family:'Space Grotesk',sans-serif;font-weight:500;font-size:26px;background:linear-gradient(0deg,#98c0ef,#d8ecf8);-webkit-background-clip:text;background-clip:text;color:transparent}
.role{margin:6px 0 0;font-size:14px;color:var(--ink2)}.co{margin:4px 0 0;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3)}
.bio{margin:16px 0 0;font-size:14px;line-height:1.5;color:var(--ink3)}
.acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:24px 0 16px}
.act{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:999px;font-size:14px;color:var(--ink);text-decoration:none;box-shadow:inset 0 0 0 1px var(--edge);transition:background .2s}
.act:hover{background:rgba(186,214,247,.06);color:#fff}.act i{font-size:17px;color:var(--lilac)}
.save{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border-radius:999px;font-size:15px;font-weight:500;color:#fff;text-decoration:none;background:rgba(168,85,247,.18);box-shadow:inset 0 0 0 1px rgba(184,104,248,.6),0 0 18px rgba(168,85,247,.22)}
.save:hover{background:rgba(168,85,247,.3)}
.qr{margin:20px auto 0;display:none;width:180px;padding:12px;border-radius:12px;background:#fff}.qr.on{display:block}.qr svg{display:block;width:100%;height:auto}
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
</main>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>
<script>
const url=${JSON.stringify(url)};
document.getElementById('qrb').onclick=()=>{const el=document.getElementById('qr');if(!el.innerHTML){const q=qrcode(0,'M');q.addData(url);q.make();el.innerHTML=q.createSvgTag({cellSize:4,margin:0,scalable:true});}el.classList.toggle('on');};
document.getElementById('share').onclick=async()=>{try{if(navigator.share)await navigator.share({title:document.title,url});else{await navigator.clipboard.writeText(url);alert('Enlace copiado');}}catch(e){}};
</script>
</body></html>`;
}
