// Panel Diwilo: lo común a todas las pestañas y el cargador.
// Cada pestaña vive en /admin/tabs/<id>.html (su HTML) + /admin/tabs/<id>.js (su lógica). Se cargan la primera
// vez que se abre la pestaña, dentro de admin.html, sin cambiar la URL (la última pestaña se recuerda en la sesión).
(() => {
  const V = document.documentElement.dataset.v || '1'; // versión para no servir archivos viejos del caché
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ORIGIN = location.origin;
  const fmtN = (n) => Number(n || 0).toLocaleString('es-CO');
  const fmtDate = (ts) => new Date(ts).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const ago = (ts) => { const s = Math.round((Date.now() - ts) / 1000); if (s < 60) return `${s}s`; if (s < 3600) return `${Math.round(s / 60)}m`; if (s < 86400) return `${Math.round(s / 3600)}h`; return `${Math.round(s / 86400)}d`; };
  const flag = (cc) => cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '·';

  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }
  async function api(path, opts = {}) {
    const r = await fetch('/admin/api/' + path, { headers: { 'content-type': 'application/json' }, credentials: 'same-origin', ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (r.status === 401) { showLogin(); throw new Error('sesión'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }
  function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
  async function copy(t) { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { prompt('Copia:', t); } }
  function formData(form) { const o = {}; new FormData(form).forEach((v, k) => { o[k] = String(v).trim(); }); return o; }
  // Ventana del panel para confirmar o pedir un dato (los navegadores pueden bloquear prompt/confirm).
  // Devuelve el texto escrito (o '' si no hay campo) al aceptar, y null al cancelar.
  function ask({ title, text = '', input = false, value = '', placeholder = '', ok = 'Aceptar', danger = false, match = null }) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'ask';
      d.innerHTML = `<form method="dialog">
        <h2>${esc(title)}</h2>${text ? `<p class="muted">${esc(text).replace(/\n/g, '<br>')}</p>` : ''}
        ${input ? `<input class="in" name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">` : ''}
        <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" value="cancel" type="button" data-no>Cancelar</button><button class="btn ${danger ? 'danger' : 'pri'}" value="ok" data-yes>${esc(ok)}</button></div>
      </form>`;
      document.body.appendChild(d);
      const inp = $('input', d), yes = $('[data-yes]', d);
      // match: el botón se activa solo cuando lo escrito coincide (p. ej. el nombre del negocio)
      const norm = (s) => String(s).trim().toLowerCase();
      if (match) { yes.disabled = true; inp.addEventListener('input', () => { yes.disabled = norm(inp.value) !== norm(match); }); }
      const done = (v) => { d.close(); d.remove(); resolve(v); };
      $('[data-no]', d).onclick = () => done(null);
      d.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
      $('form', d).addEventListener('submit', (e) => { e.preventDefault(); if (!yes.disabled) done(inp ? inp.value.trim() : ''); });
      d.showModal();
      (inp || yes).focus();
    });
  }
  // Confirmación con la ventana del panel: true si acepta.
  const sure = async (text, ok = 'Sí, continuar', danger = true) => (await ask({ title: 'Confirmar', text, ok, danger })) !== null;
  function setBadge(id, n) { const b = document.getElementById(id); if (b) { b.hidden = !n; b.textContent = n; } }

  /* ---------- gráficas (En vivo y Links) ---------- */
  function barChart(el, rows, label) {
    if (!rows.length) { el.innerHTML = '<p class="empty">Aún no hay datos en este periodo.</p>'; return; }
    const W = 640, H = 220, pl = 36, pb = 24, pt = 8;
    const max = Math.max(...rows.map((r) => r.v), 1);
    const nice = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / nice) * nice;
    const bw = (W - pl) / rows.length, gap = Math.min(8, bw * 0.25);
    const y = (v) => pt + (H - pt - pb) * (1 - v / top);
    const ticks = [0, top / 2, top];
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
    ticks.forEach((t) => { s += `<line class="grid-l" x1="${pl}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${fmtN(Math.round(t))}</text>`; });
    const every = Math.ceil(rows.length / 8);
    rows.forEach((r, i) => {
      const x = pl + i * bw + gap / 2, w = Math.max(2, bw - gap), yy = y(r.v), h = Math.max(0, H - pb - yy), rad = Math.min(4, w / 2, h);
      // barra con extremo superior redondeado y base recta
      s += h > 0 ? `<path class="bar" data-i="${i}" d="M${x},${H - pb} V${yy + rad} Q${x},${yy} ${x + rad},${yy} H${x + w - rad} Q${x + w},${yy} ${x + w},${yy + rad} V${H - pb} Z"/>` : '';
      if (i % every === 0) s += `<text class="axis" x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${esc(r.short)}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${pl + i * bw}" y="0" width="${bw}" height="${H - pb}"/>`;
    });
    s += '</svg><div class="tip"></div>';
    el.innerHTML = s;
    const tip = $('.tip', el), svg = $('svg', el);
    $$('.hit', el).forEach((h) => {
      h.addEventListener('mouseenter', () => {
        const i = +h.dataset.i, r = rows[i];
        $$('.bar', el).forEach((b) => b.classList.toggle('dim', +b.dataset.i !== i));
        tip.innerHTML = `${esc(r.long)}<br><b>${fmtN(r.v)}</b> visitas · ${fmtN(r.v2)} visitantes`;
        const sb = svg.getBoundingClientRect(), hb = h.getBoundingClientRect();
        tip.style.left = (hb.left - sb.left + hb.width / 2) + 'px';
        tip.style.top = (y(r.v) / H * sb.height) + 'px';
        tip.style.opacity = 1;
      });
      h.addEventListener('mouseleave', () => { tip.style.opacity = 0; $$('.bar', el).forEach((b) => b.classList.remove('dim')); });
    });
  }
  function rank(el, rows, fmtKey = (k) => k || '(sin dato)') {
    if (!rows.length) { el.innerHTML = '<p class="muted" style="margin:0">Sin datos todavía.</p>'; return; }
    const max = Math.max(...rows.map((r) => r.n), 1);
    el.innerHTML = rows.map((r) => `<div class="r"><span title="${esc(r.k)}">${fmtKey(r.k)}</span><span>${fmtN(r.n)}</span><div class="track"><i style="width:${(r.n / max * 100).toFixed(1)}%"></i></div></div>`).join('');
  }

  /* ---------- pestañas ---------- */
  const factories = {}, tabs = {}, loading = {};
  let current = null;

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.body.appendChild(s); });
  }
  // Carga el HTML y el JS de la pestaña una sola vez y la inicializa.
  function ensure(id) {
    if (tabs[id]) return Promise.resolve(tabs[id]);
    return (loading[id] ||= (async () => {
      const section = $(`[data-section="${id}"]`);
      // Sin ".html": los assets de Cloudflare redirigen /x.html -> /x.
      const r = await fetch(`/admin/tabs/${id}?v=${V}`, { credentials: 'same-origin', cache: 'no-cache' }).catch(() => null);
      // Sesión de Access vencida: la petición termina en el login de Access (otro dominio) o falla.
      if (!r || r.status === 401 || new URL(r.url).origin !== location.origin) { showLogin(); throw new Error('sesión'); }
      if (!r.ok) throw new Error('No se pudo cargar la pestaña');
      section.innerHTML = await r.text();
      if (!factories[id]) await loadScript(`/admin/tabs/${id}.js?v=${V}`);
      tabs[id] = factories[id](Admin) || {};
      return tabs[id];
    })().finally(() => { delete loading[id]; }));
  }

  // Monta una pestaña dentro de otra (p. ej. Links y Tarjetas dentro de Marketing). Se crea una sola vez y después
  // solo se mueve: así no se duplican sus eventos. Cuando no está a la vista queda guardada (oculta) en #embedStore.
  const mounted = {};
  async function mount(id, host) {
    let m = mounted[id];
    if (!m) {
      const node = document.createElement('div');
      node.className = 'embedded';
      host.appendChild(node);
      const r = await fetch(`/admin/tabs/${id}?v=${V}`, { credentials: 'same-origin', cache: 'no-cache' }).catch(() => null);
      if (!r || r.status === 401 || new URL(r.url).origin !== location.origin) { showLogin(); throw new Error('sesión'); }
      node.innerHTML = await r.text();
      if (!factories[id]) await loadScript(`/admin/tabs/${id}.js?v=${V}`);
      m = mounted[id] = { node, tab: factories[id](Admin) || {} };
    } else host.appendChild(m.node);
    await m.tab.show?.();
    return m;
  }
  function unmount(id) {
    const m = mounted[id]; if (!m) return;
    let store = document.getElementById('embedStore');
    if (!store) { store = document.createElement('div'); store.id = 'embedStore'; store.hidden = true; document.body.appendChild(store); }
    store.appendChild(m.node);
    m.tab.hide?.();
  }

  // Pestañas que ahora viven dentro de otra (enlaces viejos y última pestaña recordada).
  const MOVED = { links: ['marketing', 'campanas'], cards: ['marketing', 'tarjetas'], leads: ['marketing', 'contactos'] };
  async function go(id) {
    if (MOVED[id]) { try { sessionStorage.setItem('dwl_mk_view', MOVED[id][1]); } catch {} id = MOVED[id][0]; }
    if (!$(`[data-section="${id}"]`)) id = 'resumen';
    if (current && current !== id) tabs[current]?.hide?.();
    current = id;
    $$('.tab[data-view]').forEach((t) => t.classList.toggle('on', t.dataset.view === id));
    $$('[data-section]').forEach((s) => { s.hidden = s.dataset.section !== id; });
    $('#side').classList.remove('open');
    try { sessionStorage.setItem('dwl_admin_tab', id); } catch {}
    try {
      const t = await ensure(id);
      if (current === id) await t.show?.();
    } catch (e) {
      if (e.message !== 'sesión') $(`[data-section="${id}"]`).innerHTML = `<p class="err" style="padding:20px">${esc(e.message)}</p>`;
    }
  }

  function showLogin() {
    if (current) tabs[current]?.hide?.();
    $('#app').hidden = true; $('#login').hidden = false;
  }

  /* ---------- avisos del menú (sin abrir las pestañas) ---------- */
  const refreshLeadBadge = () => api('leads').then((l) => setBadge('leadBadge', l.filter((x) => x.status === 'nuevo').length)).catch(() => {});
  async function refreshBizBadge() {
    try {
      const plat = await api('platform');
      let n = 0;
      for (const a of plat.apps.filter((x) => x.connected)) {
        try {
          const d = await api(`platform/${a.key}/businesses`);
          const soon = new Date(Date.parse(d.today + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
          n += d.businesses.filter((b) => b.paid_until && (b.read_only || b.paid_until <= soon)).length;
        } catch {}
      }
      setBadge('bizBadge', n);
    } catch {}
  }

  window.Admin = {
    $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, setBadge, barChart, rank, go, refreshBizBadge, refreshLeadBadge, ask, sure, mount, unmount,
    tab(id, factory) { factories[id] = factory; },
  };

  $$('.tab[data-view]').forEach((t) => t.addEventListener('click', () => go(t.dataset.view)));
  document.addEventListener('click', (e) => { if (e.target.closest('[data-menu]')) $('#side').classList.toggle('open'); });

  async function start() {
    let me;
    try { me = await api('me'); } catch { return showLogin(); }
    $('#whoami').textContent = me.email;
    $('#login').hidden = true; $('#app').hidden = false;
    refreshLeadBadge();
    refreshBizBadge();
    // Enlaces viejos con #pestaña siguen funcionando; la URL queda limpia.
    const fromHash = location.hash.slice(1);
    if (fromHash) history.replaceState(null, '', location.pathname);
    let last = null; try { last = sessionStorage.getItem('dwl_admin_tab'); } catch {}
    go(fromHash || last || 'resumen');
  }
  start();
})();
