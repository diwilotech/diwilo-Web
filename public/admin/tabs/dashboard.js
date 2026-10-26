// Panel Diwilo · pestaña «Dashboard». Muestra la página del módulo Dashboard (la misma que verán las apps) con los datos de Diwilo.
Admin.tab('dashboard', (A) => {
  const { $ } = A;
  const load = () => { const f = $('#dsFrame'); if (!f.getAttribute('src')) f.src = '/admin/m/dashboard?org=diwilo'; };
  return { show: load, hide: () => {} };
});
