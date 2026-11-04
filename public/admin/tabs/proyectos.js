// Panel Diwilo · pestaña «Proyectos». Muestra la página del módulo central (la misma que ven los negocios en sus apps)
// con los datos de Diwilo: proyectos, cotizaciones con PDF y firma, y cuentas de cobro.
Admin.tab('proyectos', (A) => {
  const { $ } = A;
  const load = () => { const f = $('#prFrame'); if (!f.getAttribute('src')) f.src = '/admin/m/proyectos?org=diwilo'; };
  return { show: load, hide: () => {} };
});
