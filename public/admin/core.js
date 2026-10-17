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

  // Aviso breve con el toast de Bootstrap (se apila abajo, por encima de la barra inferior en celular).
  function toast(t) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toast-container position-fixed bottom-0 start-50 translate-middle-x p-3 dw-toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast align-items-center text-bg-dark border-0'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(t)}</div></div>`;
    box.appendChild(el);
    el.addEventListener('hidden.bs.toast', () => el.remove());
    new bootstrap.Toast(el, { delay: 2400 }).show();
  }
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
        <h2>${esc(title)}</h2>${text ? `<p class="text-body-secondary">${esc(text).replace(/\n/g, '<br>')}</p>` : ''}
        ${input ? `<input class="form-control" name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">` : ''}
        <div class="dw-row" style="justify-content:flex-end;margin-top:16px"><button class="btn btn-outline-secondary" value="cancel" type="button" data-no>Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok" data-yes>${esc(ok)}</button></div>
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
    if (!rows.length) { el.innerHTML = '<p class="dw-empty">Aún no hay datos en este periodo.</p>'; return; }
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
    if (!rows.length) { el.innerHTML = '<p class="text-body-secondary" style="margin:0">Sin datos todavía.</p>'; return; }
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
  const MOVED = { links: ['marketing', 'campanas'], cards: ['marketing', 'tarjetas'], leads: ['marketing', 'contactos'], chats: ['ia', 'chats'], ajustes: ['ia', 'ajustes'], api: ['ia', 'api'], modulos: ['negocios', 'planes'] };
  async function go(id) {
    if (MOVED[id]) { try { sessionStorage.setItem(MOVED[id][0] === 'ia' ? 'dwl_ia_view' : MOVED[id][0] === 'negocios' ? 'dwl_neg_view' : 'dwl_mk_view', MOVED[id][1]); } catch {} id = MOVED[id][0]; }
    if (!$(`[data-section="${id}"]`)) id = 'resumen';
    if (Admin.me && !Admin.me.owner && !(id === 'equipo' ? false : Admin.me.modules.includes(id) || (id === 'negocios' && Admin.me.modules.includes('modulos')))) id = Admin.first;
    if (current && current !== id) tabs[current]?.hide?.();
    current = id;
    window.AdminShell?.mark(id);
    $$('[data-section]').forEach((s) => { s.hidden = s.dataset.section !== id; });
    try { sessionStorage.setItem('dwl_admin_tab', id); } catch {}
    try {
      const t = await ensure(id);
      if (current === id) await t.show?.();
    } catch (e) {
      if (e.message !== 'sesión') $(`[data-section="${id}"]`).innerHTML = `<p class="text-danger small" style="padding:20px">${esc(e.message)}</p>`;
    }
  }

  function showLogin() {
    if (current) tabs[current]?.hide?.();
    $('#app').hidden = true; $('#login').hidden = false;
  }

  /* ---------- avisos del menú (sin abrir las pestañas) ---------- */
  // La campana de la barra superior junta los mismos avisos que los números del menú.
  const avisos = { leads: 0, negocios: 0 };
  function pintarAvisos() {
    const l = [];
    if (avisos.leads) l.push({ id: 'marketing', icono: 'bi-person-plus', texto: `${avisos.leads} lead${avisos.leads === 1 ? '' : 's'} nuevo${avisos.leads === 1 ? '' : 's'} del formulario` });
    if (avisos.negocios) l.push({ id: 'negocios', icono: 'bi-exclamation-triangle', texto: `${avisos.negocios} negocio${avisos.negocios === 1 ? '' : 's'} con suscripción vencida o por vencer (7 días)` });
    window.AdminShell?.setNotifs(l);
  }
  const refreshLeadBadge = () => api('leads').then((l) => { avisos.leads = l.filter((x) => x.status === 'nuevo').length; setBadge('leadBadge', avisos.leads); pintarAvisos(); }).catch(() => {});
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
      avisos.negocios = n; setBadge('bizBadge', n); pintarAvisos();
    } catch {}
  }

  // Llamada que recibe el avance en vivo (una línea JSON por paso) y devuelve el resultado final.
  async function stream(path, body, onEvent) {
    const r = await fetch('/admin/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...body, stream: true }) });
    if (r.status === 401) { showLogin(); throw new Error('sesión'); }
    if (!r.ok || !r.body) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Error'); }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '', result, failed;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'fin') result = ev.result;
        else if (ev.type === 'error') failed = ev.error;
        else try { onEvent(ev); } catch {}
      }
    }
    if (failed) throw new Error(failed);
    if (result === undefined) throw new Error('Se cortó la conexión. Revisa el resultado en un momento.');
    return result;
  }

  // Barra de progreso con lo que va haciendo la IA y lo que ya hizo.
  // const p = progress(contenedor, 'Agente de blog'); p.update(evento); p.finish(true|false, 'texto')
  function progress(host, title = 'Trabajando') {
    const t0 = Date.now(), ICON = { consultada: 'bi-check-circle', hecha: 'bi-check-circle', propuesta: 'bi-hourglass-split', error: 'bi-exclamation-triangle' };
    host.innerHTML = `<div class="prog"><div class="prog-head"><i class="bi bi-arrow-repeat spin"></i><b>${esc(title)}</b><span class="prog-now">Empezando…</span><span class="prog-tok" hidden></span><span class="prog-time">0:00</span></div>
      <div class="prog-bar"><i></i></div><ol class="prog-steps"></ol></div>`;
    const box = $('.prog', host), bar = $('.prog-bar i', box), now = $('.prog-now', box), list = $('.prog-steps', box), clock = $('.prog-time', box);
    let step = 0, done = 0, live = null;
    const tick = () => { const s = Math.round((Date.now() - t0) / 1000); clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const timer = setInterval(tick, 1000);
    // No se sabe cuántos pasos tomará: la barra avanza rápido al principio y se frena cerca del final
    const pct = () => Math.min(94, Math.round(100 * (1 - Math.exp(-(step + done) / 9))));
    const draw = () => { bar.style.width = `${pct()}%`; };
    const add = (cls, icon, text) => { const li = document.createElement('li'); li.className = cls; li.innerHTML = `<i class="bi ${icon}"></i><span>${esc(text)}</span>`; list.appendChild(li); list.scrollTop = list.scrollHeight; return li; };
    draw();
    return {
      update(ev) {
        if (ev.type === 'tokens') { const t = $('.prog-tok', box); t.hidden = false; t.textContent = `${ev.total >= 1000 ? `${(ev.total / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} k` : ev.total} tokens`; return; }
        if (ev.type === 'sub') { now.textContent = `Paso ${step} · ${ev.label}…`; if (live && !live.querySelector('small')) live.insertAdjacentHTML('beforeend', '<small class="sub"></small>'); if (live) live.querySelector('small').textContent = ev.label; return; }
        if (ev.type === 'pensando') { step = ev.step; now.textContent = `Paso ${ev.step} · pensando qué sigue`; }
        if (ev.type === 'usando') { live = add('now', 'bi-arrow-repeat spin', ev.label); now.textContent = `Paso ${step} · ${ev.label}`; }
        if (ev.type === 'paso') {
          done++;
          const li = live && ev.status !== 'propuesta' ? live : add('', '', ev.label);
          live = null;
          li.className = ev.status; li.querySelector('i').className = `bi ${ICON[ev.status] || 'bi-check-circle'}`;
          if (ev.status === 'propuesta') li.insertAdjacentHTML('beforeend', '<small>por aprobar</small>');
          if (ev.error) li.insertAdjacentHTML('beforeend', `<small>${esc(ev.error)}</small>`);
        }
        draw();
      },
      finish(ok = true, text) {
        clearInterval(timer); tick();
        box.classList.add(ok ? 'ok' : 'fail'); bar.style.width = '100%';
        $('.prog-head i', box).className = `bi ${ok ? 'bi-check-circle' : 'bi-exclamation-triangle'}`;
        now.textContent = text || (ok ? `Terminado en ${step} paso${step === 1 ? '' : 's'}` : 'No terminó');
        if (live) { live.className = 'error'; live.querySelector('i').className = 'bi bi-exclamation-triangle'; }
      },
    };
  }

  window.Admin = {
    $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, stream, progress, qrSvg, copy, formData, setBadge, barChart, rank, go, refreshBizBadge, refreshLeadBadge, ask, sure, mount, unmount,
    tab(id, factory) { factories[id] = factory; },
  };


  async function start() {
    let me;
    try { me = await api('me'); } catch { return showLogin(); }
    // Cada persona ve solo las pestañas de sus módulos; Equipo es del titular (lo filtra el shell).
    Admin.me = me;
    AdminShell.render(me, go);
    Admin.first = me.modules[0] || 'resumen';
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
