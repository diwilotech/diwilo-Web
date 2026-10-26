// Panel Diwilo · pestaña «Marca». Muestra la página del módulo central (la misma que ven los negocios en sus apps)
// con los datos de Diwilo. Para ver los de un negocio: Negocios → «Entrar como dueño».
Admin.tab('marca', (A) => {
  const { $ } = A;
  const load = () => { const f = $('#maFrame'); if (!f.getAttribute('src')) f.src = '/admin/m/marca?org=diwilo'; };
  return { show: load, hide: () => {} };
});
