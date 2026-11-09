// Panel Diwilo · pestaña «blog». La carga admin/core.js la primera vez que se abre.
Admin.tab('blog', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge, ask, sure } = A;

  /* ---------- BLOG ---------- */
  let posts = [], post = null, postSaved = '', postFilter = '', md = null, blogMeta = { categories: [], authors: [], defaultAuthor: '' };
  const mdLib = () => md || import('/assets/js/md.js').then((m) => (md = m));
  const nowMs = () => Date.now();
  const postState = (p) => p.status !== 'published' ? ['draft', 'Borrador'] : p.published_at > nowMs() ? ['sched', 'Programada'] : ['pub', 'Publicada'];
  const toLocalInput = (ms) => { if (!ms) return ''; const d = new Date(ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

  const load = async () => {
    if (!$('#blogEditor').hidden) return;
    try { posts = await api('blog'); } catch (e) { $('#blogBody').innerHTML = `<tr><td colspan="7" class="dw-empty">${esc(e.message)}</td></tr>`; return; }
    const st = posts.map(postState);
    const tiles = [['Entradas', posts.length], ['Publicadas', st.filter((s) => s[0] === 'pub').length], ['Programadas', st.filter((s) => s[0] === 'sched').length],
      ['Borradores', st.filter((s) => s[0] === 'draft').length], ['Lecturas totales', posts.reduce((n, p) => n + p.views, 0)]];
    $('#blogKpis').innerHTML = tiles.map(([l, v]) => `<div class="dw-card kpi"><div class="v">${fmtN(v)}</div><div class="l">${l}</div></div>`).join('');
    tableroBlog().catch(() => {});
    renderPosts();
    fillCovers();
  };
  // Tablero del blog: qué se lee, cuánto se publica, de qué se escribe y en qué estado está cada entrada (arrastrar publica o devuelve a borrador)
  const kitViz = new Promise((ok) => { if (window.DwViz) return ok(); const j = document.createElement('script'); j.src = '/admin/m/dwviz.js'; j.onload = j.onerror = () => ok(); document.head.appendChild(j); });
  async function tableroBlog() {
    await kitViz; const V = window.DwViz, host = $('#blogViz'); if (!V || !host) return;
    if (!posts.length) { host.innerHTML = ''; return; }
    const pub = posts.filter((p) => postState(p)[0] === 'pub');
    const d = new Date(), meses = []; for (let i = 5; i >= 0; i--) meses.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
    const porMes = meses.map((m) => pub.filter((p) => new Date(p.published_at).toISOString().slice(0, 7) === m).length);
    const cats = {}; pub.forEach((p) => { const c = p.category || 'Sin categoría'; cats[c] = (cats[c] || 0) + 1; });
    host.innerHTML = '<div class="dv-g"><div data-a></div><div data-b></div></div><div class="dv-g mt-3"><div data-c></div><div data-d></div></div>';
    const box = (id, titulo, sub) => { const h = host.querySelector(`[data-${id}]`); h.innerHTML = V.tarjeta(titulo, '<div data-in></div>', { sub }); return h.querySelector('[data-in]'); };
    const top = [...pub].sort((a, b) => b.views - a.views).slice(0, 6);
    if (top.length) V.ranking(box('a', 'Lo más leído', 'Lecturas por entrada publicada'), top.map((p) => ({ nombre: p.title, valor: p.views })), { fmt: fmtN });
    else V.vacio(box('a', 'Lo más leído', 'Aún sin entradas publicadas'), { icono: 'bi-journal-text', titulo: 'Nada publicado todavía', texto: 'Cuando publiques, verás aquí lo que más se lee.' });
    V.barras(box('b', 'Entradas publicadas por mes', 'Últimos 6 meses'), { etiquetas: meses.map((m) => m.slice(5) + '/' + m.slice(2, 4)), series: [{ nombre: 'Entradas', datos: porMes }], fmt: fmtN });
    V.dona(box('c', 'De qué se escribe', 'Entradas publicadas por categoría'), Object.entries(cats).map(([nombre, valor]) => ({ nombre, valor })), { fmt: fmtN, centro: 'Entradas' });
    const col = (id, titulo, color) => ({ id, titulo, color, items: posts.filter((p) => postState(p)[0] === id).map((p) => ({ id: p.id, titulo: p.title, detalle: p.category || '', etiqueta: id === 'pub' ? `${fmtN(p.views)} lecturas` : id === 'sched' ? 'programada ' + fmtDate(p.published_at) : 'editada ' + fmtDate(p.updated_at) })) });
    const kb = box('d', 'Embudo de entradas', 'Arrastra a Publicada o a Borrador'), pintar = () => V.kanban(kb, {
      columnas: [col('draft', 'Borrador', '#94A3B8'), col('sched', 'Programada', '#FBBF24'), col('pub', 'Publicada', '#34D399')], fmt: fmtN, abrir: (id) => openPost(+id),
      mover: async (id, desde, hasta) => {
        if (hasta === 'sched') { toast('Para programar una fecha abre la entrada y elige día y hora'); return; }
        const p = posts.find((x) => String(x.id) === String(id)); if (!p) return;
        try { await api('blog/' + id, { method: 'PATCH', body: { status: hasta === 'pub' ? 'published' : 'draft' } }); toast(hasta === 'pub' ? 'Entrada publicada' : 'Vuelve a borrador'); load(); } catch (e) { toast(e.message); }
      } });
    pintar();
  }
  $('#blogCsv').addEventListener('click', () => {
    const cel = (v) => { const t = String(v ?? '').replace(/\r?\n/g, ' '); return /[",;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const filas = [['Título', 'Dirección', 'Categoría', 'Autor', 'Estado', 'Fecha', 'Lecturas'], ...posts.map((p) => [p.title, `/blog/${p.slug}`, p.category || '', p.author || '', postState(p)[1], new Date(p.published_at || p.updated_at).toISOString().slice(0, 10), p.views])];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + filas.map((f) => f.map(cel).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'blog.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  function renderPosts() {
    const q = $('#blogSearch').value.trim().toLowerCase();
    const list = posts.filter((p) => (!postFilter || postState(p)[0] === postFilter) && (!q || p.title.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)));
    $('#blogBody').innerHTML = list.length ? list.map((p) => {
      const [k, t] = postState(p);
      return `<tr data-post="${p.id}" style="cursor:pointer">
        <td style="width:84px">${p.cover_url ? `<img class="bthumb" src="${esc(p.cover_url)}" alt="">` : '<span class="bthumb bthumb-ph"><i class="bi bi-journal-text"></i></span>'}</td>
        <td><b style="font-weight:500;color:var(--hi)">${esc(p.title)}</b>${p.featured ? ' <i class="bi bi-star" title="Destacada" style="color:var(--warn)"></i>' : ''}<br><span class="text-body-secondary font-monospace small">/blog/${esc(p.slug)}</span></td>
        <td>${p.category ? `<span class="badge text-bg-secondary fw-normal">${esc(p.category)}</span>` : '<span class="text-body-secondary">—</span>'}</td>
        <td><span class="st ${k}">${t}</span></td>
        <td class="text-body-secondary" style="white-space:nowrap">${p.published_at ? fmtDate(p.published_at) : 'Editada ' + fmtDate(p.updated_at)}</td>
        <td class="text-end">${fmtN(p.views)}</td>
        <td style="white-space:nowrap"><a class="btn btn-sm btn-outline-secondary" href="/blog/${esc(p.slug)}${k === 'pub' ? '' : '?preview'}" target="_blank" rel="noopener" data-stop title="Ver"><i class="bi bi-eye"></i></a></td></tr>`;
    }).join('') : `<tr><td colspan="7" class="dw-empty">${posts.length ? 'Ninguna entrada coincide.' : 'Aún no hay entradas. Escribe la primera con “Nueva entrada”.'}</td></tr>`;
  }
  $('#blogFilter').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; postFilter = b.dataset.f; $$('#blogFilter .btn').forEach((x) => x.classList.toggle('active', x === b)); renderPosts(); });
  $('#blogSearch').addEventListener('input', renderPosts);
  $('#blogBody').addEventListener('click', (e) => { if (e.target.closest('[data-stop]')) return; const tr = e.target.closest('[data-post]'); if (tr) openPost(+tr.dataset.post); });
  $('#postNew').addEventListener('click', () => openPost(null));

  // --- editor ---
  const pf = { title: '#pTitle', slug: '#pSlug', excerpt: '#pExcerpt', content: '#pContent', category: '#pCategory', tags: '#pTags', author: '#pAuthor', seo_title: '#pSeoTitle', seo_desc: '#pSeoDesc' };
  let slugTouchedP = false, prevReady = false, prevTimer = null;
  const snapP = () => JSON.stringify({ ...post, cover: post.cover === undefined ? undefined : String(post.cover).length });

  async function openPost(id) {
    await mdLib();
    try { blogMeta = await api('blog/meta'); } catch {}
    $('#pCats').innerHTML = blogMeta.categories.map((c) => `<option value="${esc(c)}">`).join('');
    $('#pAuthors').innerHTML = blogMeta.authors.map((c) => `<option value="${esc(c)}">`).join('');
    if (id) {
      try { post = await api('blog/' + id); } catch (e) { toast(e.message); return; }
    } else {
      post = { title: '', slug: '', excerpt: '', content: '', category: '', tags: '', author: blogMeta.defaultAuthor, status: 'draft', published_at: null, featured: 0, seo_title: '', seo_desc: '', views: 0 };
    }
    post.cover = undefined;
    slugTouchedP = !!id;
    Object.entries(pf).forEach(([k, sel]) => { $(sel).value = post[k] || ''; });
    $(`input[name=pStatus][value=${post.status === 'published' ? 'published' : 'draft'}]`).checked = true;
    $('#pDate').value = toLocalInput(post.published_at);
    $('#pFeatured').checked = !!post.featured;
    setCover(post.cover_url || '');
    $('#pTitleHead').textContent = id ? 'Editar entrada' : 'Nueva entrada';
    $('#pDelete').hidden = !id; $('#pErr').textContent = '';
    $('#blogList').hidden = true; $('#blogEditor').hidden = false;
    refresh();
    postSaved = snapP(); // después de leer el formulario: así abrir sin tocar nada no cuenta como cambio
    $('#pDirty').hidden = true;
    window.scrollTo({ top: 0 });
    if (!id) setTimeout(() => $('#pTitle').focus(), 30);
  }
  function readForm() {
    Object.entries(pf).forEach(([k, sel]) => { post[k] = $(sel).value; });
    post.status = $('input[name=pStatus]:checked').value;
    post.published_at = $('#pDate').value ? new Date($('#pDate').value).getTime() : null;
    post.featured = $('#pFeatured').checked ? 1 : 0;
  }
  function refresh() {
    readForm();
    if (!slugTouchedP) { post.slug = md.slugify(post.title); $('#pSlug').value = post.slug; }
    const r = md.renderMarkdown(post.content);
    $('#pWords').textContent = `${fmtN(r.words)} palabras · ${r.minutes} min de lectura · ${r.toc.length} secciones`;
    $('#pStats').innerHTML = `<div><b>${fmtN(r.words)}</b><span>palabras</span></div><div><b>${r.minutes}</b><span>min lectura</span></div><div><b>${fmtN(post.views || 0)}</b><span>lecturas</span></div>`;
    const st = post.status === 'published' ? (post.published_at && post.published_at > nowMs() ? 'sched' : 'pub') : 'draft';
    $('#pPublish').innerHTML = st === 'sched' ? '<i class="bi bi-clock"></i>Programar' : post.id && postState(post)[0] === 'pub' ? '<i class="bi bi-check-lg"></i>Actualizar' : '<i class="bi bi-send"></i>Publicar';
    $('#pDateHint').textContent = post.published_at && post.published_at > nowMs() ? `Se publicará sola el ${fmtDate(post.published_at)}.` : 'Si eliges una fecha futura, se publica sola ese día.';
    const v = $('#pView'); v.hidden = !post.id; v.href = `/blog/${post.slug}${st === 'pub' && postState(post)[0] === 'pub' ? '' : '?preview'}`;
    // SEO
    const tt = post.seo_title || post.title, dd = post.seo_desc || post.excerpt || md.plainText(post.content).slice(0, 155);
    $('#pSeoTc').textContent = `${(post.seo_title || '').length}/60`; $('#pSeoTc').classList.toggle('over', (post.seo_title || '').length > 60);
    $('#pSeoDc').textContent = `${(post.seo_desc || '').length}/160`; $('#pSeoDc').classList.toggle('over', (post.seo_desc || '').length > 160);
    $('#serpSlug').textContent = post.slug || '…'; $('#serpT').textContent = (tt || 'Título de la entrada') + ' · Blog de Diwilo'; $('#serpD').textContent = dd || 'Descripción de la entrada.';
    $('#pDirty').hidden = snapP() === postSaved;
    clearTimeout(prevTimer); prevTimer = setTimeout(() => renderPreview(r), 120);
  }
  // Vista previa en un iframe con los estilos reales del sitio
  function renderPreview(r) {
    const fr = $('#pPrev');
    const html = `<header class="post-head" style="padding-top:28px;max-width:none"><h1 class="post-title">${esc(post.title || 'Título de la entrada')}</h1>${post.excerpt ? `<p class="post-lead">${esc(post.excerpt)}</p>` : ''}</header>
      ${post.cover_url || post.cover ? `<div class="post-hero-img" style="margin:0 0 28px"><img src="${esc(post.cover || post.cover_url)}" alt=""></div>` : ''}
      <article class="prose post-body">${r.html || '<p style="color:var(--bs-secondary-color)">La vista previa aparece aquí mientras escribes.</p>'}</article>`;
    const doc = fr.contentDocument;
    if (!prevReady || !doc || !doc.getElementById('root')) {
      fr.srcdoc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500&family=JetBrains+Mono&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/css/styles.css"><style>body{background:#05060f;padding:0 26px 40px}</style></head><body><main class="blog" id="root">${html}</main></body></html>`;
      fr.onload = () => { prevReady = true; };
      return;
    }
    doc.getElementById('root').innerHTML = html;
  }
  ['#pTitle', '#pExcerpt', '#pContent', '#pCategory', '#pTags', '#pAuthor', '#pSeoTitle', '#pSeoDesc', '#pDate'].forEach((sel) => $(sel).addEventListener('input', refresh));
  $('#pSlug').addEventListener('input', () => { slugTouchedP = true; refresh(); });
  $('#pSlug').addEventListener('blur', () => { $('#pSlug').value = md.slugify($('#pSlug').value); refresh(); });
  $$('input[name=pStatus]').forEach((r) => r.addEventListener('change', refresh));
  $('#pFeatured').addEventListener('change', refresh);
  $('#pMode').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; $$('#pMode .btn').forEach((x) => x.classList.toggle('active', x === b)); $('#pPanes').className = 'ed-panes ' + (b.dataset.mode === 'split' ? '' : b.dataset.mode); });

  // Barra de formato
  const ta = () => $('#pContent');
  function wrap(before, after = before, ph = 'texto') {
    const t = ta(), s0 = t.selectionStart, s1 = t.selectionEnd, sel = t.value.slice(s0, s1) || ph;
    t.setRangeText(before + sel + after, s0, s1, 'end');
    t.selectionStart = s0 + before.length; t.selectionEnd = s0 + before.length + sel.length;
    t.focus(); refresh();
  }
  function linePrefix(prefix, numbered) {
    const t = ta(), v = t.value, s0 = v.lastIndexOf('\n', t.selectionStart - 1) + 1, s1 = t.selectionEnd;
    const lines = v.slice(s0, s1).split('\n').map((l, i) => (numbered ? `${i + 1}. ` : prefix) + l.replace(/^(#{1,4}\s|>\s?|[-*]\s|\d+\.\s)/, ''));
    t.setRangeText(lines.join('\n'), s0, s1, 'end'); t.focus(); refresh();
  }
  function insertBlock(text) {
    const t = ta(), v = t.value, pos = t.selectionStart;
    const pre = pos && v[pos - 1] !== '\n' ? '\n\n' : (pos && v[pos - 2] !== '\n' ? '\n' : '');
    t.setRangeText(pre + text + '\n\n', pos, t.selectionEnd, 'end'); t.focus(); refresh();
  }
  $('#pBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-md]'); if (!b) return;
    const a = b.dataset.md;
    if (a === 'b') wrap('**'); else if (a === 'i') wrap('*');
    else if (a === 'h2') linePrefix('## '); else if (a === 'h3') linePrefix('### ');
    else if (a === 'quote') linePrefix('> '); else if (a === 'ul') linePrefix('- '); else if (a === 'ol') linePrefix('', true);
    else if (a === 'link') { const t = ta(), s0 = t.selectionStart, s1 = t.selectionEnd; ask({ title: 'Insertar enlace', text: 'Dirección del enlace (https://… o /contacto):', input: true, value: 'https://', ok: 'Insertar' }).then((url) => { if (!url) return; t.focus(); t.setSelectionRange(s0, s1); wrap('[', `](${url})`, 'texto del enlace'); }); }
    else if (a === 'code') wrap('\n```\n', '\n```\n', 'código');
    else if (a === 'table') insertBlock('| Columna 1 | Columna 2 |\n|---|---|\n| Dato | Dato |');
    else if (a === 'hr') insertBlock('---');
    else if (a === 'img') $('#pImgFile').click();
  });
  $('#pContent').addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); wrap('**'); } else if (k === 'i') { e.preventDefault(); wrap('*'); }
    else if (k === 'k') { e.preventDefault(); $('#pBar [data-md=link]').click(); }
  });

  // Imágenes: se reducen en el navegador antes de subir
  async function shrink(file, maxW = 1600, quality = 0.82) {
    const img = new Image(); img.src = URL.createObjectURL(file);
    try { await img.decode(); } catch { throw new Error('No se pudo leer esa imagen'); }
    const k = Math.min(1, maxW / img.naturalWidth), cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(img.src);
    return cv.toDataURL('image/jpeg', quality);
  }
  async function uploadInline(file) {
    if (!file?.type.startsWith('image/')) return;
    const mark = `![Subiendo ${file.name}…]()`;
    const t = ta(); t.setRangeText(`\n${mark}\n`, t.selectionStart, t.selectionEnd, 'end'); refresh();
    try {
      const r = await api('blog/images', { method: 'POST', body: { data: await shrink(file), post_id: post.id || null } });
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      t.value = t.value.replace(mark, `![${alt}](${r.url} "")`);
    } catch (x) { t.value = t.value.replace(mark, ''); toast(x.message); }
    refresh();
  }
  $('#pImgFile').addEventListener('change', (e) => { uploadInline(e.target.files[0]); e.target.value = ''; });
  $('#pContent').addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); uploadInline(f); } });
  ['dragover', 'dragleave', 'drop'].forEach((ev) => $('#pContent').addEventListener(ev, (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault(); $('#pContent').classList.toggle('drag', ev === 'dragover');
    if (ev === 'drop') uploadInline(e.dataTransfer.files[0]);
  }));

  // Portada
  function setCover(src) {
    const el = $('#pCover');
    el.querySelector('img')?.remove();
    if (src) { const i = document.createElement('img'); i.src = src; i.alt = ''; el.appendChild(i); }
    $('#pCoverDel').hidden = !src;
  }
  async function takeCover(file) {
    if (!file?.type.startsWith('image/')) return;
    try { post.cover = await shrink(file, 1600, 0.84); setCover(post.cover); refresh(); } catch (x) { toast(x.message); }
  }
  $('#pCover').addEventListener('click', () => $('#pCoverFile').click());
  $('#pCover').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#pCoverFile').click(); } });
  $('#pCoverFile').addEventListener('change', (e) => { takeCover(e.target.files[0]); e.target.value = ''; });
  ['dragover', 'dragleave', 'drop'].forEach((ev) => $('#pCover').addEventListener(ev, (e) => { e.preventDefault(); $('#pCover').classList.toggle('drag', ev === 'dragover'); if (ev === 'drop') takeCover(e.dataTransfer.files[0]); }));
  $('#pCoverDel').addEventListener('click', () => { post.cover = ''; post.cover_url = null; setCover(''); refresh(); });
  // Portada con IA: queda en el editor y se guarda al guardar o publicar la entrada
  $('#pCoverAI').addEventListener('click', async () => {
    readForm();
    if (!post.title.trim()) { toast('Escribe primero el título'); $('#pTitle').focus(); return; }
    const idea = await Admin.ask({ title: 'Generar portada con IA', text: 'Opcional: describe qué debe mostrar la imagen. Si lo dejas vacío, se inspira en el título y el resumen. La imagen no lleva texto.', input: true, placeholder: 'Ej.: dueña de un restaurante respondiendo pedidos por WhatsApp desde el celular', ok: 'Generar' });
    if (idea === null) return;
    const b = $('#pCoverAI'); b.disabled = true; b.innerHTML = '<i class="bi bi-arrow-repeat spin"></i>Generando…';
    try {
      const r = await api('blog/portada-ia', { method: 'POST', body: { title: post.title, excerpt: post.excerpt, idea } });
      post.cover = r.cover; setCover(r.cover); refresh(); toast('Portada lista: guarda para conservarla');
    } catch (x) { toast(x.message); }
    b.disabled = false; b.innerHTML = `<i class="bi bi-magic"></i>${post.cover ? 'Otra ilustración con IA' : 'Ilustración con IA'}`;
  });

  /* ---------- Portada de marca: la misma de las primeras entradas (texto exacto, sin gastar cuota de IA) ---------- */
  let coverLib = null;
  const brandCover = (p) => (coverLib ||= import('/admin/cover.js')).then((m) => m.composeCover({ title: p.title, category: p.category || '', tags: p.tags || '' }));
  $('#pCoverBrand').addEventListener('click', async () => {
    readForm();
    if (!post.title.trim()) { toast('Escribe primero el título'); $('#pTitle').focus(); return; }
    const b = $('#pCoverBrand'); b.disabled = true;
    try { post.cover = await brandCover(post); setCover(post.cover); refresh(); toast('Portada lista: guarda para conservarla'); }
    catch (x) { toast('No se pudo crear la portada: ' + x.message); }
    b.disabled = false;
  });
  // Los borradores que escribe el agente de blog llegan sin portada: se les pone la de marca al abrir Blog.
  let filling = false;
  async function fillCovers() {
    if (filling) return; filling = true;
    try {
      let n = 0;
      for (const p of posts.filter((x) => !x.cover_url && x.status !== 'published')) {
        const full = await api('blog/' + p.id);
        const cover = await brandCover(full);
        await api('blog', { method: 'POST', body: { id: full.id, title: full.title, slug: full.slug, excerpt: full.excerpt, content: full.content, category: full.category, tags: full.tags, author: full.author,
          status: full.status, published_at: full.published_at, featured: full.featured, seo_title: full.seo_title, seo_desc: full.seo_desc, cover } });
        n++;
      }
      if (n) { toast(`Portada de marca en ${n} borrador${n === 1 ? '' : 'es'}`); posts = await api('blog'); renderPosts(); }
    } catch (e) { /* si falla, queda el cuadro sin imagen y se puede crear desde el editor */ }
    filling = false;
  }

  async function savePost(publish) {
    readForm();
    $('#pErr').textContent = '';
    if (!post.title.trim()) { $('#pErr').textContent = 'Escribe un título.'; $('#pTitle').focus(); return; }
    if (publish) { post.status = 'published'; $('input[name=pStatus][value=published]').checked = true; }
    else if (publish === false) { post.status = 'draft'; $('input[name=pStatus][value=draft]').checked = true; }
    const body = { id: post.id, title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content, category: post.category, tags: post.tags, author: post.author,
      status: post.status, published_at: post.published_at, featured: post.featured, seo_title: post.seo_title, seo_desc: post.seo_desc };
    if (post.cover !== undefined) body.cover = post.cover;
    $$('#pSaveDraft, #pPublish').forEach((b) => { b.disabled = true; });
    try {
      const r = await api('blog', { method: 'POST', body });
      Object.assign(post, { id: r.id, slug: r.slug, status: r.status, published_at: r.published_at });
      if (post.cover) post.cover_url = post.cover; post.cover = undefined;
      $('#pDate').value = toLocalInput(post.published_at); $('#pSlug').value = post.slug; slugTouchedP = true;
      $('#pTitleHead').textContent = 'Editar entrada'; $('#pDelete').hidden = false;
      refresh(); postSaved = snapP(); $('#pDirty').hidden = true; // la foto se toma después de releer el formulario (la fecha queda en minutos)
      const st = postState(post)[0];
      toast(st === 'pub' ? 'Publicada en el blog' : st === 'sched' ? `Programada para el ${fmtDate(post.published_at)}` : 'Borrador guardado');
    } catch (x) { $('#pErr').textContent = x.message; }
    $$('#pSaveDraft, #pPublish').forEach((b) => { b.disabled = false; });
  }
  $('#pSaveDraft').addEventListener('click', () => savePost(false));
  $('#pPublish').addEventListener('click', () => savePost(true));
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's' && $('#blogEditor')?.offsetParent) { e.preventDefault(); savePost(null); } });
  async function closePost() {
    if (post && snapP() !== postSaved && !(await sure('Hay cambios sin guardar. ¿Salir de todos modos?', 'Salir sin guardar'))) return;
    post = null; $('#blogEditor').hidden = true; $('#blogList').hidden = false; load();
  }
  $('#edBack2').addEventListener('click', closePost);
  $('#pDelete').addEventListener('click', async () => {
    if (!post?.id || !(await sure(`¿Borrar “${post.title}”? No se puede deshacer.`, 'Borrar'))) return;
    await api('blog/' + post.id, { method: 'DELETE' }); postSaved = snapP(); closePost(); toast('Entrada borrada');
  });
  window.addEventListener('beforeunload', (e) => { if (post && snapP() !== postSaved) e.preventDefault(); });
  return { show: load };
});
