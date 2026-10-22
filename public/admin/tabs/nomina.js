// Panel Diwilo · pestaña «Nómina». Muestra la página del módulo central (la misma que ven los negocios en sus apps)
// con los datos de Diwilo. Para ver los de un negocio: Negocios → «Entrar como dueño».
Admin.tab('nomina', (A) => {
  const { $ } = A;
  const load = () => { const f = $('#noFrame'); if (!f.getAttribute('src')) f.src = '/admin/m/nomina?org=diwilo'; };
  return { show: load, hide: () => {} };
});
