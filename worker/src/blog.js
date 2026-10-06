/**
 * Blog de Diwilo: páginas públicas (las arma el Worker para que Google y los agentes las lean
 * completas) y la API del editor en /admin.
 *
 *   GET  /blog                      índice (?cat=, ?q=, ?p=)
 *   GET  /blog/<slug>               artículo con menú lateral de sugerencias
 *   GET  /blog.md · /blog/<slug>.md versión Markdown (también con Accept: text/markdown)
 *   GET  /blog/rss.xml · /blog/sitemap.xml · /blog/latest.json (bloque «Del blog» del inicio)
 *   GET  /blog/img/<id> · /blog/img/portada-<postId>
 *
 *   GET    /admin/api/blog                 lista (sin contenido)
 *   GET    /admin/api/blog/<id>            entrada completa
 *   POST   /admin/api/blog                 crear o actualizar { id?, title, slug, excerpt, content, … }
 *   DELETE /admin/api/blog/<id>
 *   POST   /admin/api/blog/images          { data, post_id? } → { id, url }
 *   GET    /admin/api/blog/meta            categorías y autores usados
 */
import { renderMarkdown, plainText, slugify } from '../../public/assets/js/md.js';
import { HEAD, NAV, FOOTER } from './shell.js';
import { adminEmail } from './access.js';

const SITE = 'https://diwilo.com';
const PER_PAGE = 9;
const DEFAULT_AUTHOR = 'Y. Alejandro Echavarría';
const AUTHORS = { 'Y. Alejandro Echavarría': { photo: '/assets/img/alejandro.jpg', bio: 'Fundador de Diwilo. Especialista en IA, ciencia de datos y web dashboards.' } };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n));
const now = () => Date.now();
const fmtDate = (ms) => new Date(ms - 5 * 3600000).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const isoDate = (ms) => new Date(ms).toISOString();
const coverUrl = (p) => (p.has_cover ? `/blog/img/portada-${p.id}?v=${p.updated_at}` : null);
const tagsOf = (p) => (p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
const CAT_ICON = { automatizacion: 'ph-flow-arrow', datos: 'ph-chart-line-up', ia: 'ph-robot', 'agentes-de-ia': 'ph-robot', apps: 'ph-squares-four', casos: 'ph-briefcase' };
const catIcon = (c) => CAT_ICON[slugify(c)] || 'ph-article';

const LIST_COLS = `id, slug, title, excerpt, category, tags, author, status, featured, published_at, views, created_at, updated_at,
  cover_data IS NOT NULL AS has_cover`;
const PUBLISHED = `status = 'published' AND published_at <= ?`;

/* ============================== PÚBLICO ============================== */

function page({ title, desc, route, body, ogImg, ogType = 'website', headExtra = '' }) {
  const head = HEAD.replaceAll('__TITLE__', esc(title)).replaceAll('__DESC__', esc(desc)).replaceAll('__ROUTE__', route.replace(/^\//, ''))
    .replace('__OGIMG__', ogImg ? SITE + ogImg : `${SITE}/assets/img/og.png`).replace('__OGTYPE__', ogType).replace('__HEADEXTRA__', headExtra);
  return new Response(head + NAV + body + FOOTER, { headers: { 'content-type': 'text/html; charset=utf-8', vary: 'Accept', 'cache-control': 'public, max-age=60' } });
}

const coverHtml = (p, cls = '') => {
  const url = coverUrl(p);
  return url
    ? `<img class="post-cover ${cls}" src="${esc(url)}" alt="" loading="lazy">`
    : `<div class="post-cover post-cover--ph ${cls}" aria-hidden="true"><i class="ph-light ${catIcon(p.category)}"></i></div>`;
};

function card(p, big = false) {
  const md = renderMarkdown(p.content || '');
  return `<article class="post-card${big ? ' post-card--big' : ''}">
    <a class="post-card__media" href="/blog/${esc(p.slug)}" tabindex="-1" aria-hidden="true">${coverHtml(p)}</a>
    <div class="post-card__body">
      <div class="post-meta">${p.category ? `<a class="tag" href="/blog?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a>` : ''}<span>${fmtDate(p.published_at)}</span><span>· ${md.minutes} min</span></div>
      <h${big ? 2 : 3} class="post-card__title"><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h${big ? 2 : 3}>
      ${p.excerpt ? `<p class="post-card__excerpt">${esc(p.excerpt)}</p>` : ''}
      ${big ? `<a class="btn btn--primary btn--sm" href="/blog/${esc(p.slug)}">Leer artículo <i class="ph-light ph-arrow-right"></i></a>` : ''}
    </div>
  </article>`;
}

function miniList(posts, title, icon) {
  if (!posts.length) return '';
  return `<div class="side-card"><p class="side-title"><i class="ph-light ${icon}"></i>${title}</p>
    <ol class="side-posts">${posts.map((p) => `<li><a href="/blog/${esc(p.slug)}">
      <span class="side-thumb">${coverHtml(p, 'post-cover--sm')}</span>
      <span><span class="side-post-title">${esc(p.title)}</span><span class="side-post-meta">${fmtDate(p.published_at)}</span></span></a></li>`).join('')}</ol></div>`;
}

function categoriesBox(cats, active) {
  if (!cats.length) return '';
  return `<div class="side-card"><p class="side-title"><i class="ph-light ph-folders"></i>Categorías</p>
    <ul class="side-cats">${cats.map((c) => `<li><a href="/blog?cat=${encodeURIComponent(c.category)}"${c.category === active ? ' aria-current="true"' : ''}>
      <i class="ph-light ${catIcon(c.category)}"></i><span>${esc(c.category)}</span><b>${c.n}</b></a></li>`).join('')}</ul></div>`;
}

const APPS_CARD = `<div class="side-card side-apps">
  <p class="side-title"><i class="ph-light ph-squares-four"></i>Apps de Diwilo</p>
  <p class="side-text">Pedidos, Nutrición, Citas y Residentes: software listo para tu negocio, administrado por nosotros.</p>
  <div class="side-apps__icons" aria-hidden="true"><i class="ph-light ph-storefront"></i><i class="ph-light ph-heartbeat"></i><i class="ph-light ph-calendar-check"></i><i class="ph-light ph-buildings"></i></div>
  <button type="button" class="btn btn--primary btn--sm btn--block" data-open-apps>¿Te interesa alguna? <i class="ph-light ph-arrow-right"></i></button>
</div>`;

const CTA_CARD = `<div class="side-card side-cta"><p class="side-title"><i class="ph-light ph-lightning"></i>¿Un proceso que consume horas?</p>
  <p class="side-text">Te decimos qué se puede automatizar y en qué orden. Primera sesión sin costo.</p>
  <a class="btn btn--sm btn--block" href="/contacto">Agendar diagnóstico</a></div>`;

async function sideData(env, excludeId = 0) {
  const t = now();
  const [popular, cats] = await env.DB.batch([
    env.DB.prepare(`SELECT ${LIST_COLS} FROM posts WHERE ${PUBLISHED} AND id != ? ORDER BY views DESC, published_at DESC LIMIT 4`).bind(t, excludeId),
    env.DB.prepare(`SELECT category, COUNT(*) n FROM posts WHERE ${PUBLISHED} AND category IS NOT NULL AND category != '' GROUP BY category ORDER BY n DESC, category`).bind(t),
  ]);
  return { popular: popular.results, cats: cats.results };
}

async function blogIndex(req, env, url) {
  const cat = clip(url.searchParams.get('cat'), 60) || '';
  const q = clip(url.searchParams.get('q'), 80) || '';
  const pg = Math.max(1, parseInt(url.searchParams.get('p'), 10) || 1);
  const t = now();
  const where = [PUBLISHED], args = [t];
  if (cat) { where.push('category = ?'); args.push(cat); }
  if (q) { where.push('(title LIKE ? OR excerpt LIKE ? OR content LIKE ? OR tags LIKE ?)'); const like = `%${q}%`; args.push(like, like, like, like); }
  const W = where.join(' AND ');
  const [{ n }] = (await env.DB.prepare(`SELECT COUNT(*) n FROM posts WHERE ${W}`).bind(...args).all()).results;
  // Sin filtros, la página 1 lleva una entrada destacada además de la grilla.
  const extra = !cat && !q ? 1 : 0;
  const posts = (await env.DB.prepare(`SELECT ${LIST_COLS}, content FROM posts WHERE ${W} ORDER BY featured DESC, published_at DESC LIMIT ? OFFSET ?`)
    .bind(...args, PER_PAGE + (pg === 1 ? extra : 0), pg === 1 ? 0 : (pg - 1) * PER_PAGE + extra).all()).results;
  const side = await sideData(env);

  if (wantsMarkdown(req)) {
    return markdownResponse(`---\ntitle: Blog de Diwilo\nurl: ${SITE}/blog\n---\n\n# Blog de Diwilo\n\n${posts.map((p) => `- [${p.title}](${SITE}/blog/${p.slug}.md) — ${p.excerpt || ''} (${fmtDate(p.published_at)})`).join('\n')}\n`);
  }

  const showFeatured = pg === 1 && !cat && !q && posts.length > 0;
  const featured = showFeatured ? posts[0] : null;
  const rest = showFeatured ? posts.slice(1) : posts;
  const pages = Math.ceil(Math.max(0, n - extra) / PER_PAGE) || 1;
  const qs = (p) => '/blog?' + new URLSearchParams({ ...(cat && { cat }), ...(q && { q }), ...(p > 1 && { p }) }).toString();
  const heading = q ? `Resultados para “${esc(q)}”` : cat ? esc(cat) : 'Ideas para operar con datos e IA';

  const body = `
  <main id="main" class="blog">
    <section class="container blog-hero">
      <p class="eyebrow hero-in">Blog de Diwilo</p>
      <h1 class="h1 h1--sm"${q || cat ? '' : ' data-split'}>${heading}</h1>
      <p class="lead hero-in" style="--d:500">Automatización, ciencia de datos, agentes de IA y casos reales de empresas que trabajan con menos tareas manuales.</p>
      <form class="blog-search hero-in" style="--d:650" action="/blog" role="search">
        <i class="ph-light ph-magnifying-glass" aria-hidden="true"></i>
        <input class="input" type="search" name="q" value="${esc(q)}" placeholder="Buscar artículos…" aria-label="Buscar artículos">
        ${cat ? `<input type="hidden" name="cat" value="${esc(cat)}">` : ''}
      </form>
      <nav class="blog-cats hero-in" style="--d:750" aria-label="Categorías">
        <a class="pill pill--sm${!cat ? ' is-active' : ''}" href="/blog">Todas</a>
        ${side.cats.map((c) => `<a class="pill pill--sm${c.category === cat ? ' is-active' : ''}" href="/blog?cat=${encodeURIComponent(c.category)}">${esc(c.category)}</a>`).join('')}
      </nav>
    </section>

    <section class="container blog-layout section--last">
      <div class="blog-main">
        ${featured ? `<div data-reveal>${card(featured, true)}</div>` : ''}
        ${rest.length ? `<div class="post-grid" data-stagger="90">${rest.map((p) => card(p)).join('')}</div>`
          : !featured ? `<div class="blog-empty card"><i class="ph-light ph-notebook"></i><p>${q || cat ? 'No encontramos artículos con ese filtro.' : 'Muy pronto publicaremos los primeros artículos.'}</p>${q || cat ? '<a class="btn btn--sm" href="/blog">Ver todos</a>' : ''}</div>` : ''}
        ${pages > 1 ? `<nav class="blog-pager" aria-label="Páginas">${pg > 1 ? `<a class="btn btn--sm" href="${qs(pg - 1)}"><i class="ph-light ph-arrow-left"></i>Anteriores</a>` : '<span></span>'}
          <span class="muted">Página ${pg} de ${pages}</span>${pg < pages ? `<a class="btn btn--sm" href="${qs(pg + 1)}">Siguientes<i class="ph-light ph-arrow-right"></i></a>` : '<span></span>'}</nav>` : ''}
      </div>
      <aside class="blog-side" aria-label="Sugerencias">
        ${miniList(side.popular, 'Más leídos', 'ph-fire')}
        ${categoriesBox(side.cats, cat)}
        ${APPS_CARD}
        ${CTA_CARD}
      </aside>
    </section>
  </main>`;
  return page({
    title: cat ? `${cat} · Blog de Diwilo` : 'Blog de Diwilo · Datos, automatización e IA',
    desc: 'Artículos de Diwilo sobre automatización de procesos, ciencia de datos, agentes de IA y software para empresas en Colombia.',
    route: '/blog', body,
    headExtra: `<link rel="alternate" type="application/rss+xml" title="Blog de Diwilo" href="/blog/rss.xml">${q || pg > 1 ? '\n<meta name="robots" content="noindex, follow">' : ''}`,
  });
}

async function blogPost(req, env, ctx, slug, url) {
  const asMd = slug.endsWith('.md');
  if (asMd) slug = slug.slice(0, -3);
  const preview = url.searchParams.has('preview') && (await adminEmail(req, env).catch(() => null));
  const p = await env.DB.prepare(`SELECT ${LIST_COLS}, content, seo_title, seo_desc FROM posts WHERE slug = ?${preview ? '' : ` AND ${PUBLISHED}`}`)
    .bind(...(preview ? [slug] : [slug, now()])).first();
  if (!p) return null;
  const md = renderMarkdown(p.content);
  const author = p.author || DEFAULT_AUTHOR;
  const desc = p.seo_desc || p.excerpt || plainText(p.content).slice(0, 155);

  if (asMd || wantsMarkdown(req)) {
    return markdownResponse(`---\ntitle: ${p.title}\ndescription: ${desc}\nauthor: ${author}\ndate: ${isoDate(p.published_at || p.updated_at).slice(0, 10)}\nurl: ${SITE}/blog/${p.slug}\n---\n\n# ${p.title}\n\n${p.content}\n`);
  }
  if (!preview && !/bot|crawl|spider|preview/i.test(req.headers.get('user-agent') || '')) {
    ctx.waitUntil(env.DB.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').bind(p.id).run());
  }

  const t = now();
  const [relatedQ, side] = await Promise.all([
    env.DB.prepare(`SELECT ${LIST_COLS}, content FROM posts WHERE ${PUBLISHED} AND id != ?
      ORDER BY (category = ?) DESC, published_at DESC LIMIT 6`).bind(t, p.id, p.category || '').all(),
    sideData(env, p.id),
  ]);
  const related = relatedQ.results;
  const tags = tagsOf(p);
  const a = AUTHORS[author];
  const pageUrl = `${SITE}/blog/${p.slug}`;
  const pub = p.published_at || p.updated_at;
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: desc,
    datePublished: isoDate(pub), dateModified: isoDate(p.updated_at), mainEntityOfPage: pageUrl, url: pageUrl,
    image: coverUrl(p) ? SITE + coverUrl(p) : `${SITE}/assets/img/og.png`, wordCount: md.words, keywords: tags.join(', ') || undefined,
    articleSection: p.category || undefined,
    author: { '@type': 'Person', name: author }, publisher: { '@type': 'Organization', name: 'Diwilo', logo: { '@type': 'ImageObject', url: `${SITE}/assets/img/icon-512.png` } },
  };
  const share = (label, icon, href) => `<a class="share-btn" href="${esc(href)}" target="_blank" rel="noopener" aria-label="Compartir en ${label}"><i class="ph-light ${icon}"></i></a>`;
  const enc = encodeURIComponent;
  const shares = `<div class="share">${share('WhatsApp', 'ph-whatsapp-logo', `https://wa.me/?text=${enc(p.title + ' ' + pageUrl)}`)}
    ${share('LinkedIn', 'ph-linkedin-logo', `https://www.linkedin.com/sharing/share-offsite/?url=${enc(pageUrl)}`)}
    ${share('X', 'ph-x-logo', `https://twitter.com/intent/tweet?url=${enc(pageUrl)}&text=${enc(p.title)}`)}
    ${share('Facebook', 'ph-facebook-logo', `https://www.facebook.com/sharer/sharer.php?u=${enc(pageUrl)}`)}
    <button type="button" class="share-btn" data-copy-link="${esc(pageUrl)}" aria-label="Copiar enlace"><i class="ph-light ph-link-simple"></i></button></div>`;

  const body = `
  <main id="main" class="blog blog-post" data-post="${esc(p.slug)}">
    ${preview && (p.status !== 'published' || p.published_at > t) ? `<div class="preview-bar">Vista previa · ${p.status !== 'published' ? 'borrador' : 'programado para el ' + fmtDate(p.published_at)}. Solo tú puedes verla.</div>` : ''}
    <header class="container post-head">
      <nav class="crumbs hero-in" aria-label="Ruta"><a href="/blog">Blog</a>${p.category ? `<i class="ph-light ph-caret-right"></i><a href="/blog?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a>` : ''}</nav>
      <h1 class="post-title" data-split>${esc(p.title)}</h1>
      ${p.excerpt ? `<p class="post-lead hero-in" style="--d:450">${esc(p.excerpt)}</p>` : ''}
      <div class="post-byline hero-in" style="--d:550">
        ${a?.photo ? `<img src="${a.photo}" alt="" width="44" height="44">` : `<span class="byline-ph">${esc(author.split(/\s+/).map((w) => w[0]).slice(0, 2).join(''))}</span>`}
        <div><b>${esc(author)}</b><span>${fmtDate(pub)} · ${md.minutes} min de lectura${p.views > 20 ? ` · ${p.views.toLocaleString('es-CO')} lecturas` : ''}</span></div>
        ${shares}
      </div>
    </header>
    ${coverUrl(p) ? `<div class="container post-hero-img" data-reveal="scale"><img src="${esc(coverUrl(p))}" alt="${esc(p.title)}"></div>` : ''}

    <div class="container blog-layout post-layout">
      <article class="prose post-body" id="post-body">${md.html}
        ${tags.length ? `<div class="post-tags">${tags.map((tg) => `<a class="tag" href="/blog?q=${encodeURIComponent(tg)}">#${esc(tg)}</a>`).join('')}</div>` : ''}
        <div class="post-end">
          <div class="author-box">${a?.photo ? `<img src="${a.photo}" alt="" width="64" height="64">` : ''}<div><p class="side-title" style="margin:0 0 4px">Escrito por</p><b>${esc(author)}</b><p>${esc(a?.bio || 'Equipo de Diwilo.')}</p></div></div>
          <div class="post-share"><span class="muted">¿Te sirvió? Compártelo</span>${shares}</div>
        </div>
      </article>
      <aside class="blog-side post-side" aria-label="Sugerencias">
        ${md.toc.length > 1 ? `<nav class="side-card toc" aria-label="En este artículo"><p class="side-title"><i class="ph-light ph-list-bullets"></i>En este artículo</p>
          <ol>${md.toc.map((h) => `<li class="toc-l${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol>
          <div class="toc-progress"><i></i></div></nav>` : ''}
        ${miniList(related.slice(0, 4), 'Te puede interesar', 'ph-sparkle')}
        ${APPS_CARD}
        ${categoriesBox(side.cats, p.category)}
      </aside>
    </div>

    ${related.length ? `<section class="container section">
      <div class="eyebrow-rule" data-reveal><span class="eyebrow">Sigue leyendo</span></div>
      <div class="post-grid post-grid--3" data-stagger="100">${related.slice(0, 3).map((r) => card(r)).join('')}</div>
    </section>` : ''}
    <section class="container section section--last center">
      <h2 class="h2" data-reveal>¿Quieres aplicar esto en tu empresa?</h2>
      <p class="sub" style="margin-bottom:28px" data-reveal>Cuéntanos el proceso y te decimos qué se puede automatizar, con qué esfuerzo y en qué orden.</p>
      <div class="row row--center" data-reveal><a class="btn btn--primary btn--lg" href="/contacto">Agendar diagnóstico</a><button type="button" class="btn btn--lg" data-open-apps>Ver apps de Diwilo</button></div>
    </section>
  </main>`;
  return page({
    title: `${p.seo_title || p.title} · Blog de Diwilo`, desc, route: `/blog/${p.slug}`, body,
    ogImg: coverUrl(p), ogType: 'article',
    headExtra: [
      `<meta property="article:published_time" content="${isoDate(pub)}">`,
      p.category ? `<meta property="article:section" content="${esc(p.category)}">` : '',
      `<link rel="alternate" type="application/rss+xml" title="Blog de Diwilo" href="/blog/rss.xml">`,
      `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
      preview ? '<meta name="robots" content="noindex">' : '',
    ].filter(Boolean).join('\n'),
  });
}

function wantsMarkdown(req) {
  return (req.headers.get('accept') || '').split(',').some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((x) => x.trim()).find((x) => x.startsWith('q='));
    return type === 'text/markdown' && (!q || parseFloat(q.slice(2)) > 0);
  });
}
const markdownResponse = (text) => new Response(text, {
  headers: { 'content-type': 'text/markdown; charset=utf-8', 'x-markdown-tokens': String(Math.ceil(text.length / 4)), vary: 'Accept', 'cache-control': 'public, max-age=300' },
});

function imageResponse(dataUrl) {
  const m = dataUrl?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!m) return new Response('No encontrado', { status: 404 });
  return new Response(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=31536000, immutable' } });
}

async function rss(env) {
  const posts = (await env.DB.prepare(`SELECT ${LIST_COLS}, content FROM posts WHERE ${PUBLISHED} ORDER BY published_at DESC LIMIT 30`).bind(now()).all()).results;
  const x = (s) => esc(s);
  const items = posts.map((p) => `  <item>
    <title>${x(p.title)}</title>
    <link>${SITE}/blog/${p.slug}</link>
    <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
    <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
    ${p.category ? `<category>${x(p.category)}</category>` : ''}
    <description>${x(p.excerpt || plainText(p.content).slice(0, 280))}</description>
  </item>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Blog de Diwilo</title>
  <link>${SITE}/blog</link>
  <description>Automatización, ciencia de datos y agentes de IA para empresas.</description>
  <language>es-co</language>
  <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}

async function sitemap(env) {
  const posts = (await env.DB.prepare(`SELECT slug, updated_at FROM posts WHERE ${PUBLISHED} ORDER BY published_at DESC`).bind(now()).all()).results;
  const last = posts.reduce((m, p) => Math.max(m, p.updated_at), 0) || now();
  const url = (loc, ms, pr) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${isoDate(ms).slice(0, 10)}</lastmod>\n    <priority>${pr}</priority>\n  </url>`;
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[url(`${SITE}/blog`, last, '0.8'), ...posts.map((p) => url(`${SITE}/blog/${p.slug}`, p.updated_at, '0.7'))].join('\n')}\n</urlset>\n`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}

export async function blogPublic(req, env, ctx) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });
  if (path === '/blog' || path === '/blog.md') return path.endsWith('.md') ? blogIndex(new Request(req, { headers: { accept: 'text/markdown' } }), env, url) : blogIndex(req, env, url);
  if (path === '/blog/rss.xml') return rss(env);
  if (path === '/blog/latest.json') {
    // Para el inicio: últimas entradas y qué guías están publicadas
    const t = now();
    const [latest, slugs] = await env.DB.batch([
      env.DB.prepare(`SELECT ${LIST_COLS}, content FROM posts WHERE ${PUBLISHED} ORDER BY published_at DESC LIMIT 3`).bind(t),
      env.DB.prepare(`SELECT slug FROM posts WHERE ${PUBLISHED}`).bind(t),
    ]);
    return new Response(JSON.stringify({
      posts: latest.results.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, category: p.category, cover: coverUrl(p),
        date: fmtDate(p.published_at), minutes: renderMarkdown(p.content).minutes })),
      slugs: slugs.results.map((r) => r.slug),
    }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120' } });
  }
  if (path === '/blog/sitemap.xml') return sitemap(env);
  const img = path.match(/^\/blog\/img\/(portada-)?(\d+)$/);
  if (img) {
    const row = img[1]
      ? await env.DB.prepare('SELECT cover_data d FROM posts WHERE id = ?').bind(img[2]).first()
      : await env.DB.prepare('SELECT data d FROM blog_images WHERE id = ?').bind(img[2]).first();
    return imageResponse(row?.d);
  }
  const m = path.match(/^\/blog\/([a-z0-9-]+(?:\.md)?)$/);
  const res = m && (await blogPost(req, env, ctx, m[1], url));
  if (res) return res;
  const nf = await env.ASSETS.fetch(new Request(new URL('/404', url), req));
  return new Response(nf.body, { status: 404, headers: nf.headers });
}

/* ============================== PANEL ============================== */

const DATA_IMG = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export async function blogAdmin(req, env, path, url, email) {
  const M = req.method, db = env.DB;
  const parts = path.split('/').filter(Boolean); // admin, api, blog, :id|images|meta
  const sub = parts[3];
  const body = async (max) => { const t = await req.text(); if (t.length > max) throw new Error('El contenido es demasiado grande'); return t ? JSON.parse(t) : {}; };
  try {
    if (!sub && M === 'GET') return json((await db.prepare(`SELECT ${LIST_COLS}, length(content) chars FROM posts ORDER BY COALESCE(published_at, updated_at) DESC`).all()).results.map((p) => ({ ...p, cover_url: coverUrl(p) })));
    if (sub === 'meta' && M === 'GET') {
      const [cats, authors] = await db.batch([
        db.prepare(`SELECT category, COUNT(*) n FROM posts WHERE category IS NOT NULL AND category != '' GROUP BY category ORDER BY n DESC`),
        db.prepare(`SELECT DISTINCT author FROM posts WHERE author IS NOT NULL AND author != ''`),
      ]);
      return json({ categories: cats.results.map((c) => c.category), authors: [...new Set([DEFAULT_AUTHOR, ...authors.results.map((a) => a.author)])], defaultAuthor: DEFAULT_AUTHOR, editor: email });
    }
    if (sub === 'images' && M === 'POST') {
      const b = await body(3_000_000);
      if (!DATA_IMG.test(b.data || '') || b.data.length > 2_800_000) return json({ error: 'La imagen no es válida o pesa más de 2 MB' }, 400);
      const r = await db.prepare('INSERT INTO blog_images (post_id, data, created_at) VALUES (?, ?, ?)').bind(Number(b.post_id) || null, b.data, now()).run();
      return json({ id: r.meta.last_row_id, url: `/blog/img/${r.meta.last_row_id}` }, 201);
    }
    if (!sub && M === 'POST') return json(await savePost(db, await body(3_500_000)));
    const id = Number(sub);
    if (id && M === 'GET') {
      const p = await db.prepare(`SELECT ${LIST_COLS}, content, seo_title, seo_desc FROM posts WHERE id = ?`).bind(id).first();
      return p ? json({ ...p, cover_url: coverUrl(p) }) : json({ error: 'No existe' }, 404);
    }
    if (id && M === 'DELETE') {
      await db.batch([db.prepare('DELETE FROM blog_images WHERE post_id = ?').bind(id), db.prepare('DELETE FROM posts WHERE id = ?').bind(id)]);
      return json({ ok: true });
    }
    return json({ error: 'no encontrado' }, 404);
  } catch (e) {
    return json({ error: /UNIQUE/.test(e.message) ? 'Ya hay otra entrada con esa dirección (slug); cámbiala.' : e.message }, 400);
  }
}

async function savePost(db, b) {
  const title = clip(b.title, 200);
  if (!title) throw new Error('El título es obligatorio');
  const slug = slugify(b.slug || title);
  if (!slug) throw new Error('La dirección (slug) no es válida');
  const status = b.status === 'published' ? 'published' : 'draft';
  let published = b.published_at ? Number(b.published_at) || Date.parse(b.published_at) : null;
  if (status === 'published' && !published) published = now();
  const vals = {
    slug, title, excerpt: clip(b.excerpt, 400), content: String(b.content || '').slice(0, 200000), category: clip(b.category, 60) || null,
    tags: (clip(b.tags, 300) || '').split(',').map((t) => t.trim()).filter(Boolean).join(', ') || null,
    author: clip(b.author, 100) || DEFAULT_AUTHOR, status, featured: b.featured ? 1 : 0, published_at: published,
    seo_title: clip(b.seo_title, 70) || null, seo_desc: clip(b.seo_desc, 170) || null, updated_at: now(),
  };
  const cols = Object.keys(vals);
  let coverSql = '', coverVal = [];
  if (b.cover !== undefined) {
    if (!b.cover) coverSql = ', cover_data = NULL';
    else if (DATA_IMG.test(b.cover) && b.cover.length < 2_800_000) { coverSql = ', cover_data = ?'; coverVal = [b.cover]; }
    else throw new Error('La portada no es válida o pesa más de 2 MB');
  }
  let id = Number(b.id) || 0;
  if (id) {
    await db.prepare(`UPDATE posts SET ${cols.map((c) => c + ' = ?').join(', ')}${coverSql} WHERE id = ?`).bind(...Object.values(vals), ...coverVal, id).run();
  } else {
    const r = await db.prepare(`INSERT INTO posts (${cols.join(', ')}, created_at) VALUES (${cols.map(() => '?').join(', ')}, ?)`).bind(...Object.values(vals), now()).run();
    id = r.meta.last_row_id;
    if (coverSql) await db.prepare(`UPDATE posts SET ${coverSql.slice(2)} WHERE id = ?`).bind(...coverVal, id).run();
  }
  return { id, slug, status, published_at: published };
}
