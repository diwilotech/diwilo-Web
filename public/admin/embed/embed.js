// Sustituye al shell de las apps (shell.js) cuando una página de módulo central se abre dentro del panel de Diwilo.
// Las páginas esperan DW.ready (con lo mismo que devuelve /api/me); aquí viene incrustado en la página (window.__DW_ME__).
(function () {
  const RANK = { staff: 1, admin: 2, owner: 3 };
  function applyTheme(s) {
    const root = document.documentElement;
    root.dataset.dwTema = s.tema;
    root.setAttribute('data-bs-theme', s.modo);
  }
  const me = window.__DW_ME__;
  // Sigue el tema y el modo que eligió la persona en el panel (mismo origen); si no hay, el del negocio.
  let own = {}; try { own = JSON.parse(localStorage.getItem('dw_tema') || '{}'); } catch (_) {}
  // Lo que la persona eligió en el panel manda sobre el del negocio (Marca lo lee de aquí para mostrar su color y modo)
  me.settings.tema = own.tema || me.settings.tema; me.settings.modo = own.modo || me.settings.modo;
  applyTheme({ tema: me.settings.tema, modo: me.settings.modo });
  window.addEventListener('message', (ev) => { if (ev.origin === location.origin && ev.data?.dw === 'tema') applyTheme(ev.data); });
  // Avisa al panel cuando Marca guarda el color/modo o cambia el logo, para que la barra y la bienvenida se actualicen
  const fetch0 = window.fetch.bind(window);
  window.fetch = async (...a) => {
    const r = await fetch0(...a);
    try {
      const m = String(a[1]?.method || 'GET').toUpperCase(), u = String(a[0]?.url || a[0]);
      if (r.ok && m !== 'GET' && window.parent !== window) {
        if (/\/api\/settings\/apariencia$/.test(u)) { const b = JSON.parse(a[1].body); window.parent.postMessage({ dw: 'tema-guardado', tema: b.tema, modo: b.modo }, location.origin); }
        else if (/\/api\/(settings\/logo|marca\/logo)/.test(u)) window.parent.postMessage({ dw: 'marca' }, location.origin);
      }
    } catch (_) { /* sin aviso */ }
    return r;
  };
  me.canManage = RANK[me.role] >= RANK.admin;
  me.reaches = (min) => (RANK[me.role] || 0) >= (RANK[min] || 1);
  me.pageAllowed = true;
  window.DW = { ready: Promise.resolve(me), me, applyTheme };
})();
