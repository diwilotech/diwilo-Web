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
  applyTheme(me.settings);
  me.canManage = RANK[me.role] >= RANK.admin;
  me.reaches = (min) => (RANK[me.role] || 0) >= (RANK[min] || 1);
  me.pageAllowed = true;
  window.DW = { ready: Promise.resolve(me), me, applyTheme };
})();
