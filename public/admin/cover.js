/**
 * Portadas de marca del blog (1600 × 900): fondo oscuro con cuadrícula y luz violeta, ícono del tema en un cuadro
 * violeta, cuatro íconos satélite, logo, categoría y título. Es la misma imagen para todas las entradas, con el texto
 * exacto (la IA de imágenes deforma las letras), y no gasta cuota de IA.
 *   composeCover({ title, category, tags })  → Promise<data:image/jpeg;base64,…> (se dibuja en el navegador, en el editor del blog)
 *   coverSvg(opts, fontCss?)                  → texto SVG (puro)
 */
import { ICONS } from './cover-icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = 1600, H = 900;

// Ícono central según el tema (título, categoría y etiquetas). El primero que coincida gana.
const TEMAS = [
  [/propiedad horizontal|conjunto|copropiedad|residente/i, 'building'],
  [/whatsapp/i, 'whatsapp'],
  [/restaurante|bar\b|comida|pedido|domicilio|cocina/i, 'cup-hot'],
  [/nutrici|dieta|salud|paciente|consultorio/i, 'heart-pulse'],
  [/cita|reserva|agenda|turno/i, 'calendar-check'],
  [/academia|curso|estudiante|colegio|educaci/i, 'mortarboard'],
  [/inventario|tienda|ventas|comercio|punto de venta/i, 'shop'],
  [/factura|cobro|precio|costo|cuesta|presupuesto|finanz|dinero/i, 'cash-coin'],
  [/dato|dashboard|reporte|anal[ií]tica|indicador|power bi/i, 'bar-chart'],
  [/marketing|ventas|leads|campa|redes/i, 'graph-up-arrow'],
  [/correo|email|mensaje/i, 'envelope'],
  [/\bia\b|inteligencia artificial|agente|chatbot|robot/i, 'robot'],
  [/automatiz|proceso|integraci|flujo|n8n/i, 'lightning-charge'],
  [/equipo|personal|clientes/i, 'people'],
];
export function pickIcon({ title = '', category = '', tags = '' } = {}) {
  const hay = `${title} ${tags} ${category}`;
  for (const [re, icon] of TEMAS) if (re.test(hay)) return icon;
  return 'stars';
}

// Parte el título en renglones sin pasar de `max` caracteres (una palabra muy larga queda sola).
function wrap(text, max) {
  const lines = []; let cur = '';
  for (const w of String(text).trim().split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}
function layoutTitle(title) {
  for (const [size, max] of [[66, 21], [58, 24], [50, 28], [44, 32]]) {
    const lines = wrap(title, max);
    if (lines.length <= 3 || size === 44) return { size, lines: lines.slice(0, 4), lh: Math.round(size * 1.18) };
  }
}

const icon = (name, cx, cy, px, fill) => {
  const d = ICONS[name] || ICONS.stars, s = px / 16;
  return `<g transform="translate(${cx - px / 2} ${cy - px / 2}) scale(${s})" fill="${fill}"><path d="${d}"/></g>`;
};
const LOGO = `<g fill="none" stroke="url(#lg)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"><path d="M48 72V146Q48 170 72 170H84"/><path d="M156.6 135A70 70 0 0 0 96 30H86"/><path d="M84 134V124Q84 108 100 108H124"/></g><g fill="url(#lg)"><circle cx="48" cy="34" r="13"/><circle cx="112" cy="72" r="13"/><circle cx="125.6" cy="163.4" r="13"/></g>`;

export function coverSvg({ title = '', category = '', label = '', kicker = '', tags = '', domain = 'diwilo.com/blog' } = {}, fontCss = '') {
  const { size, lines, lh } = layoutTitle(title || 'Blog de Diwilo');
  const main = pickIcon({ title, category, tags });
  // Bloque de texto centrado en vertical: logo + categoría + título + dominio
  const head = 36 + 54 + 36, body = lines.length * lh, foot = 56;
  const top = Math.round((H - (head + body + foot)) / 2);
  const yLogo = top + 28, yCat = top + 90, yTitle = top + head + 14 + size * 0.86, yDom = top + head + body + 58;
  // Etiqueta del tema: la primera etiqueta de la entrada (p. ej. «propiedad horizontal») o, si no hay, la categoría
  const cat = esc(String(label || String(tags).split(',')[0].trim() || category || 'Blog').toUpperCase().slice(0, 34));
  const kick = kicker || (/gu[ií]a/i.test(category) ? 'Diwilo · Guía' : `Diwilo · ${category || 'Blog'}`);
  const sat = [['wallet2', 942, 228], ['chat-dots', 1422, 198], ['calendar3', 952, 648], ['robot', 1402, 688]];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${fontCss ? `<style>${fontCss}</style>` : ''}
<linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#5b21b6"/></linearGradient>
<radialGradient id="glow" cx="1200" cy="420" r="460" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7c3aed" stop-opacity=".6"/><stop offset=".45" stop-color="#6d28d9" stop-opacity=".2"/><stop offset="1" stop-color="#6d28d9" stop-opacity="0"/></radialGradient>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4b5fd" stop-opacity=".5"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></linearGradient>
<linearGradient id="ttl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dbeafe"/><stop offset="1" stop-color="#9fc2f2"/></linearGradient>
<linearGradient id="lg" gradientUnits="userSpaceOnUse" x1="30" y1="20" x2="170" y2="180"><stop offset="0" stop-color="#F3E8FF"/><stop offset="1" stop-color="#A78BFA"/></linearGradient>
<pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#8ea2d9" stroke-opacity=".06" stroke-width="1"/></pattern>
</defs>
<rect width="${W}" height="${H}" fill="#05060f"/>
<rect width="${W}" height="${H}" fill="url(#grid)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<polygon points="1192,0 1208,0 1290,420 1110,420" fill="url(#beam)" opacity=".55"/>
<rect x="1050" y="270" width="300" height="300" rx="82" fill="url(#tile)" stroke="#ffffff" stroke-opacity=".18" stroke-width="2"/>
${icon(main, 1200, 420, 150, '#ffffff')}
${sat.map(([n, x, y]) => `<rect x="${x - 48}" y="${y - 48}" width="96" height="96" rx="26" fill="#0b0a1d" fill-opacity=".92" stroke="#8b5cf6" stroke-opacity=".5" stroke-width="2"/>${icon(n, x, y, 50, '#c4b5fd')}`).join('\n')}
<svg x="110" y="${yLogo - 22}" width="46" height="46" viewBox="18 14 168 172">${LOGO}</svg>
<text x="168" y="${yLogo + 12}" font-family="Space Grotesk" font-size="30" fill="#e8edf8">${esc(kick)}</text>
<text x="110" y="${yCat}" font-family="JetBrains Mono" font-size="23" letter-spacing="4.5" fill="#c4a1f5">${cat}</text>
<text font-family="Space Grotesk" font-size="${size}" fill="url(#ttl)">${lines.map((l, i) => `<tspan x="110" y="${Math.round(yTitle + i * lh)}">${esc(l)}</tspan>`).join('')}</text>
<text x="110" y="${yDom}" font-family="Space Grotesk" font-size="26" fill="#8d96ab">${esc(domain)}</text>
</svg>`;
}

/* ---------- en el navegador ---------- */
let fontCssP = null;
async function b64(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
// Las letras van dentro del SVG (una imagen SVG no puede usar las fuentes de la página)
const fontCss = () => (fontCssP ||= Promise.all([b64('/admin/fonts/SpaceGrotesk.ttf'), b64('/admin/fonts/JetBrainsMono.ttf')])
  .then(([a, m]) => `@font-face{font-family:'Space Grotesk';src:url(data:font/ttf;base64,${a})}@font-face{font-family:'JetBrains Mono';src:url(data:font/ttf;base64,${m})}`));

export async function composeCover(opts) {
  const svg = coverSvg(opts, await fontCss());
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
    await new Promise((r) => setTimeout(r, 60)); g.drawImage(img, 0, 0, W, H); // la primera pintura puede salir sin la tipografía
    return c.toDataURL('image/jpeg', 0.9);
  } finally { URL.revokeObjectURL(url); }
}
