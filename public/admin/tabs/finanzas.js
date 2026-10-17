// Panel Diwilo · pestaña «Finanzas». Muestra la página del módulo central (la misma que ven los negocios en sus apps)
// con los datos de Diwilo. Para ver los de un negocio: Negocios → «Entrar como dueño».
Admin.tab('finanzas', (A) => {
  const { $ } = A;
  const load = () => { const f = $('#fiFrame'); if (!f.getAttribute('src')) f.src = '/admin/m/finanzas?org=diwilo'; };
  return { show: load, hide: () => {} };
});
