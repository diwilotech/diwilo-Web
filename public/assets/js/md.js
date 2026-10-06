/* Markdown → HTML del blog de Diwilo. Lo usan el Worker (páginas públicas) y el editor del panel
   (vista previa), así lo que se ve al escribir es exactamente lo que se publica.
   Soporta: ## títulos, párrafos, **negrita**, *cursiva*, `código`, bloques ```, [enlaces](url),
   ![imagen](url "pie de foto"), > citas, listas - y 1., --- y tablas simples | a | b |.
   Todo el texto se escapa: el contenido no puede inyectar HTML. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

// Solo http(s), rutas del sitio, anclas, mailto y tel
const safeUrl = (u) => (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(u.trim()) ? u.trim() : '#');

function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, src) =>
      `<img src="${esc(safeUrl(src.replace(/&amp;/g, '&')))}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
      const url = safeUrl(href.replace(/&amp;/g, '&'));
      const ext = /^https?:\/\//.test(url) && !/^https?:\/\/(www\.)?diwilo\.com/.test(url);
      return `<a href="${esc(url)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [], toc = [], used = {};
  let i = 0, words = 0;
  const count = (t) => { words += (t.match(/\S+/g) || []).length; };
  const anchor = (t) => { let a = slugify(t) || 'seccion'; used[a] = (used[a] || 0) + 1; return used[a] > 1 ? `${a}-${used[a]}` : a; };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // bloque de código
    const fence = line.match(/^```\s*([\w-]*)/);
    if (fence) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code${fence[1] ? ` data-lang="${esc(fence[1])}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    // títulos
    const h = line.match(/^(#{1,4})\s+(.+?)\s*#*$/);
    if (h) {
      const level = Math.max(2, h[1].length); // el h1 es el título del artículo
      const id = anchor(h[2]);
      count(h[2]);
      if (level <= 3) toc.push({ level, id, text: h[2].replace(/[*_`]/g, '') });
      out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
      i++; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    // cita
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      count(buf.join(' '));
      out.push(`<blockquote>${buf.join('\n').split(/\n{2,}/).map((p) => `<p>${inline(p.replace(/\n/g, ' '))}</p>`).join('')}</blockquote>`);
      continue;
    }
    // listas
    const ul = /^\s*[-*+]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line), re = ordered ? ol : ul, items = [];
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i++].replace(re, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !ul.test(lines[i]) && !ol.test(lines[i])) item += ' ' + lines[i++].trim();
        count(item);
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    // tabla | a | b |
    if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line); i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="tbl"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    // imagen sola en la línea → figura con pie de foto
    const fig = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (fig) {
      out.push(`<figure><img src="${esc(safeUrl(fig[2]))}" alt="${esc(fig[1])}" loading="lazy">${fig[3] || fig[1] ? `<figcaption>${esc(fig[3] || fig[1])}</figcaption>` : ''}</figure>`);
      i++; continue;
    }
    // párrafo
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s|-{3,}\s*$|\|)/.test(lines[i])) buf.push(lines[i++].trim());
    if (!buf.length) buf.push(lines[i++].trim());
    count(buf.join(' '));
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return { html: out.join('\n'), toc, words, minutes: Math.max(1, Math.round(words / 200)) };
}

// Texto plano (para resúmenes y meta descripciones)
export const plainText = (md) => String(md || '')
  .replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[#>*_`~|-]+/g, ' ').replace(/\s+/g, ' ').trim();
