// Shell común del panel Diwilo (misma interfaz que las apps CD): barra superior, lateral en escritorio,
// inferior con «Más» en celular, temas de color y modo claro/oscuro. Estilos: /admin/embed/diwilo.css.
// A diferencia de las apps, las pestañas viven en esta misma página (core.js las carga), así que no hay marco (iframe).
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TEMAS = ['violeta', 'azul', 'indigo', 'rosa', 'rojo', 'naranja', 'verde', 'turquesa', 'grafito'];
  const NOMBRE_TEMA = { violeta: 'Violeta', azul: 'Azul', indigo: 'Índigo', rosa: 'Rosa', rojo: 'Rojo', naranja: 'Naranja', verde: 'Verde', turquesa: 'Turquesa', grafito: 'Grafito' };
  // Módulos del panel en el orden del menú. `mod` = permiso que lo habilita (ver adminModule en worker/src/index.js).
  const MENU = [
    { id: 'dashboard', nombre: 'Dashboard', icono: 'bi-speedometer2', mod: 'dashboard' },
    { id: 'resumen', nombre: 'En vivo', icono: 'bi-activity', mod: 'resumen' },
    { id: 'negocios', nombre: 'Negocios', icono: 'bi-buildings', mod: ['negocios', 'modulos'], badge: 'bizBadge' },
    { id: 'marketing', nombre: 'Marketing', icono: 'bi-megaphone', mod: 'marketing', badge: 'leadBadge' },
    { id: 'finanzas', nombre: 'Finanzas', icono: 'bi-pie-chart', mod: 'finanzas' },
    { id: 'nomina', nombre: 'Nómina', icono: 'bi-people-fill', mod: 'nomina' },
    { id: 'marca', nombre: 'Marca', icono: 'bi-palette', mod: 'marca' },
    { id: 'contenido', nombre: 'Videos', icono: 'bi-camera-reels', mod: 'contenido' },
    { id: 'blog', nombre: 'Blog', icono: 'bi-journal-text', mod: 'blog' },
  ];
  // IA va abajo en el menú, junto a Equipo, igual que en todas las apps Diwilo
  const FOOT = [{ id: 'ia', nombre: 'IA', icono: 'bi-robot', mod: 'ia' }, { id: 'equipo', nombre: 'Equipo', icono: 'bi-people', owner: true }];

  function applyTheme(tema, modo) {
    const root = document.documentElement;
    root.dataset.dwTema = tema; root.setAttribute('data-bs-theme', modo);
    try { localStorage.setItem('dw_tema', JSON.stringify({ tema, modo })); } catch (_) {}
    const color = getComputedStyle(root).getPropertyValue('--dw-p').trim();
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    document.querySelectorAll('iframe').forEach((f) => { try { f.contentWindow.postMessage({ dw: 'tema', tema, modo }, location.origin); } catch (_) {} });
    meta.content = modo === 'dark' ? '#171a23' : color || '#6d28d9';
  }
  const saved = () => { try { return JSON.parse(localStorage.getItem('dw_tema') || '{}'); } catch (_) { return {}; } };

  let items = [];
  const link = (m, inBottom) => `<li class="${inBottom.has(m.id) ? 'dw-in-bottom' : ''}"><a data-mod="${esc(m.id)}" href="#${esc(m.id)}" title="${esc(m.nombre)}"><i class="bi ${esc(m.icono)}"></i><span>${esc(m.nombre)}</span>${m.badge ? `<span class="badge ms-auto" id="${m.badge}" hidden></span>` : ''}</a></li>`;

  function render(me, go) {
    const allowed = new Set(me.modules);
    items = MENU.filter((m) => me.owner || [].concat(m.mod).some((x) => allowed.has(x)));
    const foot = FOOT.filter((m) => (m.owner ? me.owner : me.owner || [].concat(m.mod).some((x) => allowed.has(x))));
    const all = [...items, ...foot];
    const bottom = all.slice(0, 4);
    const inBottom = new Set(all.length > 4 ? bottom.map((m) => m.id) : []);
    const initials = (me.email || 'D').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    // La apariencia guardada en el servidor (por persona) manda sobre la del navegador.
    const cur = { tema: me.prefs?.tema || saved().tema || 'violeta', modo: me.prefs?.modo || saved().modo || 'light' };
    if (me.prefs) applyTheme(cur.tema, cur.modo);
    document.getElementById('dw-shell').innerHTML = `
      <a class="visually-hidden-focusable position-absolute top-0 start-0 m-2 btn btn-primary" style="z-index:2000" href="#dw-content">Saltar al contenido</a>
      <header class="dw-top">
        <a class="dw-brand" data-mod="${esc(items[0]?.id || 'resumen')}" href="#"><span class="dw-brand__logo"><img src="/assets/img/brand/logo-mark.svg" alt="" data-brand-logo></span><span class="dw-brand__name d-none d-lg-inline" data-brand-name>Diwilo</span></a>
        <span class="dw-top__sep d-none d-lg-inline">/</span>
        <span class="dw-top__title" data-top-title></span>
        <span class="dw-top__spacer"></span>
        <div class="dropdown">
          <button class="dw-iconbtn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Notificaciones" title="Notificaciones"><i class="bi bi-bell"></i><span class="dw-dot" data-bell-dot hidden></span></button>
          <div class="dropdown-menu dropdown-menu-end p-0" style="width:300px"><div class="px-3 py-2 fw-semibold border-bottom">Notificaciones</div><div data-notifs><div class="px-3 py-3 small text-body-secondary text-center">No tienes notificaciones.</div></div></div>
        </div>
        <a class="dw-iconbtn" href="/" target="_blank" rel="noopener" aria-label="Ver sitio" title="Ver sitio"><i class="bi bi-box-arrow-up-right"></i></a>
        <div class="dropdown">
          <button class="dw-user" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Menú de usuario"><span class="dw-avatar">${esc(initials)}</span><i class="bi bi-chevron-down small d-none d-sm-inline"></i></button>
          <ul class="dropdown-menu dropdown-menu-end shadow-sm" style="min-width:250px">
            <li class="px-3 py-2"><div class="fw-semibold text-truncate">${esc(me.email)}</div><div class="small text-body-secondary">${me.owner ? 'Titular' : 'Equipo Diwilo'}</div></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="#marca" data-mod="marca"><i class="bi bi-palette me-2"></i>Color y marca</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="/cdn-cgi/access/logout"><i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión</a></li>
          </ul>
        </div>
      </header>
      <aside class="offcanvas-lg offcanvas-start dw-side" tabindex="-1" id="dwSide" aria-label="Menú">
        <div class="offcanvas-header border-bottom"><span class="fw-bold">Diwilo</span><button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#dwSide" aria-label="Cerrar"></button></div>
        <div class="offcanvas-body"><nav><ul class="dw-nav">${items.map((m) => link(m, inBottom)).join('')}</ul></nav></div>
        <div class="dw-side__foot"><ul class="dw-nav dw-nav--foot">${foot.map((m) => link(m, inBottom)).join('')}</ul><button class="dw-iconbtn w-100 dw-collapse" data-mini title="Contraer o expandir el menú" aria-label="Contraer o expandir el menú"><i class="bi bi-chevron-double-left"></i></button></div>
      </aside>
      <nav class="dw-bottom" aria-label="Menú principal">
        ${bottom.map((m) => `<a data-mod="${esc(m.id)}" href="#${esc(m.id)}"><i class="bi ${esc(m.icono)}"></i><span>${esc(m.nombre)}</span></a>`).join('')}
        <button type="button" data-bs-toggle="offcanvas" data-bs-target="#dwSide" aria-controls="dwSide"><i class="bi bi-grid"></i><span>Más</span></button>
      </nav>`;

    try { if (localStorage.getItem('dw_mini') === '1') document.body.classList.add('dw-mini'); } catch (_) {}
    document.querySelector('[data-mini]').onclick = () => {
      document.body.classList.toggle('dw-mini');
      try { localStorage.setItem('dw_mini', document.body.classList.contains('dw-mini') ? '1' : '0'); } catch (_) {}
    };
    // El color y el modo ya no se eligen aquí: los maneja Marca (Color y letra) y llegan por /admin/api/prefs
    window.AdminShell.setTheme = (tema, modo) => { cur.tema = tema; cur.modo = modo; applyTheme(tema, modo); };
    bienvenida();
    // Los enlaces del menú cambian de pestaña sin recargar; Ctrl/Cmd+clic los deja abrir normal.
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-mod]');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      go(a.dataset.mod);
      const oc = document.getElementById('dwSide'); if (oc) window.bootstrap?.Offcanvas.getInstance(oc)?.hide();
    });
  }

  // Logo, nombre y lema de la marca de Diwilo (los maneja el módulo Marca)
  let marca = null;
  async function cargarMarca() {
    try { const r = await fetch('/admin/api/brand', { credentials: 'same-origin' }); marca = r.ok ? await r.json() : null; } catch (_) { marca = null; }
    if (marca) {
      if (marca.logo) document.querySelectorAll('[data-brand-logo]').forEach((i) => { i.src = marca.logo; });
      if (marca.nombre) document.querySelectorAll('[data-brand-name]').forEach((n) => { n.textContent = marca.nombre; });
    }
    return marca;
  }
  // Bienvenida con la marca: una vez por sesión, breve, sin bloquear (se va sola o al tocar)
  async function bienvenida() {
    const yaVista = (() => { try { return sessionStorage.getItem('dw_splash') === '1'; } catch (_) { return false; } })();
    const m = cargarMarca();
    if (yaVista) return;
    try { sessionStorage.setItem('dw_splash', '1'); } catch (_) {}
    const el = document.createElement('div');
    el.id = 'dw-splash'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Bienvenida');
    el.innerHTML = '<div class="dw-splash__logo"><img src="/assets/img/brand/logo-mark.svg" alt="" data-splash-logo></div><div class="dw-splash__name" data-splash-name>Diwilo</div><div class="dw-splash__lema" data-splash-lema></div>';
    document.body.appendChild(el);
    const cerrar = () => { el.classList.add('out'); setTimeout(() => el.remove(), 450); };
    el.addEventListener('click', cerrar);
    const t0 = Date.now();
    await Promise.race([m, new Promise((r) => setTimeout(r, 1200))]);
    if (marca) {
      if (marca.logo) el.querySelector('[data-splash-logo]').src = marca.logo;
      el.querySelector('[data-splash-name]').textContent = marca.nombre || 'Diwilo';
      el.querySelector('[data-splash-lema]').textContent = marca.lema || '';
    }
    setTimeout(cerrar, Math.max(500, 1100 - (Date.now() - t0)));
  }

  // Marca el módulo activo en el menú y pone el título en la barra superior.
  function mark(id) {
    document.querySelectorAll('.dw-nav a[data-mod], .dw-bottom a[data-mod]').forEach((a) => {
      const on = a.dataset.mod === id;
      a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const mas = document.querySelector('.dw-bottom button');
    if (mas) mas.classList.toggle('active', ![...document.querySelectorAll('.dw-bottom a[data-mod]')].some((a) => a.dataset.mod === id));
    const m = [...MENU, ...FOOT].find((x) => x.id === id);
    const t = document.querySelector('[data-top-title]'); if (t) t.textContent = m ? m.nombre : '';
    document.title = `${m ? m.nombre + ' · ' : ''}Panel Diwilo`;
  }

  // Avisos de la campana: [{ icono, texto, id }] (id = pestaña a la que lleva).
  function setNotifs(list) {
    const box = document.querySelector('[data-notifs]'); if (!box) return;
    box.innerHTML = list.length ? list.map((n) => `<a class="dropdown-item d-flex gap-2 align-items-start py-2 text-wrap" data-mod="${esc(n.id)}" href="#${esc(n.id)}"><i class="bi ${esc(n.icono)} text-primary mt-1"></i><span class="small">${esc(n.texto)}</span></a>`).join('')
      : '<div class="px-3 py-3 small text-body-secondary text-center">No tienes notificaciones.</div>';
    const dot = document.querySelector('[data-bell-dot]'); if (dot) dot.hidden = !list.length;
  }

  window.AdminShell = { render, mark, setNotifs, applyTheme, refreshBrand: cargarMarca, first: () => items[0]?.id };
})();
