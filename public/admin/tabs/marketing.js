// Panel Diwilo · pestaña «Marketing». Muestra la página del módulo central (la misma que ven los negocios en sus apps)
// con los datos de Diwilo. Para ver los de un negocio: Negocios → «Entrar como dueño».
Admin.tab('marketing', (A) => {
  const { $ } = A;
  const load = () => { const f = $('#mkFrame'); if (!f.getAttribute('src')) f.src = '/admin/m/marketing?org=diwilo'; };
  return { show: load, hide: () => {} };
});
