/**
 * Lectura de la web para IA Diwilo y los agentes: páginas, feeds RSS/Atom y noticias (Google Noticias, sin clave).
 * Solo lectura, http(s), con tiempo y tamaño máximos. El contenido que llega es DATO, nunca instrucciones.
 */
const UA = 'Mozilla/5.0 (compatible; DiwiloBot/1.0; +https://diwilo.com)';
const MAX = 1_500_000;

function safeUrl(u) {
  let url;
  try { url = new URL(String(u || '').trim()); } catch { throw new Error('Dirección no válida'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Solo direcciones http(s)');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname)) throw new Error('Dirección no permitida');
  return url;
}

async function get(u, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8') {
  const url = safeUrl(u);
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept, 'accept-language': 'es-CO,es;q=0.9' }, redirect: 'follow', signal: ctrl.signal, cf: { cacheTtl: 900 } });
    if (!r.ok) throw new Error(`La página respondió ${r.status}`);
    const reader = r.body.getReader(), chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX) break; chunks.push(value); }
    const buf = new Uint8Array(size > MAX ? MAX : size); let off = 0;
    for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, buf.length - off)), off); off += c.length; if (off >= buf.length) break; }
    return { text: new TextDecoder('utf-8').decode(buf), url: r.url || url.toString(), type: r.headers.get('content-type') || '' };
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'La página tardó demasiado' : e.message);
  } finally { clearTimeout(t); }
}

const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, ' ').trim();
const strip = (html) => decode(String(html || '').replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '));
const attr = (tag, name) => decode((new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag) || [])[1] || '');

// Los enlaces de Google Noticias son redirecciones que no dejan leer el artículo: se pide a Google la dirección real.
export async function realUrl(u) {
  const m = /^https:\/\/news\.google\.com\/(?:rss\/)?articles\/([^?#]+)/.exec(String(u || ''));
  if (!m) return u;
  try {
    const { text: page } = await get(`https://news.google.com/articles/${m[1]}`);
    const sg = /data-n-a-sg="([^"]+)"/.exec(page)?.[1], ts = /data-n-a-ts="([^"]+)"/.exec(page)?.[1];
    if (!sg || !ts) return u;
    const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], m[1], +ts, sg]);
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', { method: 'POST', signal: ctrl.signal,
      headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]])) }).finally(() => clearTimeout(t));
    const real = /\\"garturlres\\",\\"(.*?)\\"/.exec(await r.text())?.[1];
    return real && /^https?:\/\//.test(real) ? real : u;
  } catch { return u; }
}

// Búsqueda web (DuckDuckGo Lite, sin clave): resultados orgánicos con su enlace real y un fragmento.
// Si no responde, se usan las noticias de Google con su enlace real.
export async function search(query, limit = 8) {
  const q = String(query || '').trim().slice(0, 150);
  if (!q) throw new Error('Escribe qué buscar');
  let results = [];
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch('https://lite.duckduckgo.com/lite/', { method: 'POST', signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'content-type': 'application/x-www-form-urlencoded', 'accept-language': 'es-CO,es;q=0.9' },
      body: `q=${encodeURIComponent(q)}&kl=co-es` }).finally(() => clearTimeout(t));
    const html = await r.text();
    const snippets = [...html.matchAll(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
    let i = -1;
    for (const m of html.matchAll(/<a[^>]*href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/g)) {
      i++;
      const href = decode(m[1]);
      if (!/^https?:\/\//.test(href) || /duckduckgo\.com|bing\.com\/aclick/.test(href)) continue;
      results.push({ titulo: strip(m[2]), url: href, resumen: (snippets[i] || '').slice(0, 220) });
    }
  } catch {}
  if (!results.length) {
    const n = await news(q, limit).catch(() => ({ noticias: [] }));
    results = await Promise.all(n.noticias.slice(0, Math.min(limit, 6)).map(async (x) => ({ titulo: x.titulo, url: await realUrl(x.url), resumen: x.fecha ? `Noticia del ${x.fecha}` : '' })));
  }
  const seen = new Set();
  return { consulta: q, resultados: results.filter((x) => { const h = new URL(x.url).hostname; if (seen.has(h)) return false; seen.add(h); return true; }).slice(0, limit) };
}

// Página: título, descripción, encabezados, artículos enlazados, feeds y texto (recortado).
export async function readPage(u, { max = 3500 } = {}) {
  const { text, url } = await get(await realUrl(u));
  const base = new URL(url);
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(text) || [])[1]);
  const meta = [...text.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const desc = attr(meta.find((m) => /name=["']description["']|property=["']og:description["']/i.test(m)) || '', 'content');
  const headings = [...text.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => strip(m[2])).filter((h) => h && h.length < 160).slice(0, 25);
  const feeds = [...text.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((l) => /rel=["']alternate["']/i.test(l) && /(rss|atom)\+xml/i.test(l))
    .map((l) => { try { return new URL(attr(l, 'href'), base).toString(); } catch { return null; } }).filter(Boolean);
  const articles = [...new Map([...text.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => {
    try { return [new URL(m[1], base).toString(), strip(m[2])]; } catch { return null; }
  }).filter((x) => x && x[1].length > 25 && x[1].length < 160 && new URL(x[0]).hostname === base.hostname && /\/(blog|noticias|articulo|post|news|\d{4})/i.test(new URL(x[0]).pathname))).entries()]
    .slice(0, 20).map(([href, t]) => ({ titulo: t, url: href }));
  const body = strip((/<(article|main)\b[\s\S]*?<\/\1>/i.exec(text) || [text])[0]).slice(0, max);
  return { url, titulo: title, descripcion: desc, encabezados: headings, articulos: articles, feeds, texto: body };
}

// Feed RSS o Atom: últimas entradas (si la URL es una página, busca su feed).
export async function readFeed(u, limit = 10) {
  let { text, url } = await get(u, 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5');
  if (!/<(rss|feed|rdf:RDF)\b/i.test(text)) {
    const page = await readPage(url);
    if (!page.feeds[0]) return { url, items: [], nota: 'No encontré un feed RSS en esa página', articulos_en_pagina: page.articulos.slice(0, 10) };
    ({ text, url } = await get(page.feeds[0], 'application/rss+xml,application/atom+xml,application/xml,text/xml'));
  }
  const blocks = [...text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]).slice(0, limit);
  const tag = (b, n) => decode((new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`, 'i').exec(b) || [])[1]);
  const items = blocks.map((b) => {
    const link = tag(b, 'link') || attr((/<link\b[^>]*>/i.exec(b) || [''])[0], 'href');
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const d = Date.parse(date);
    return { titulo: tag(b, 'title'), url: link, fecha: Number.isNaN(d) ? date : new Date(d).toISOString().slice(0, 10), resumen: strip(tag(b, 'description') || tag(b, 'summary') || '').slice(0, 240) };
  }).filter((i) => i.titulo);
  return { url, titulo: tag(text, 'title'), items };
}

// Noticias recientes sobre un tema (Google Noticias, Colombia/Latinoamérica en español).
export async function news(query, limit = 12) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) throw new Error('Escribe qué buscar');
  const f = await readFeed(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=CO&ceid=CO:es-419`, limit);
  return { consulta: q, noticias: f.items.map(({ titulo, url, fecha }) => ({ titulo, url, fecha, fuente: (titulo.match(/ - ([^-]+)$/) || [])[1] || null })) };
}
