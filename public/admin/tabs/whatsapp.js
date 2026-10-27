// Panel Diwilo · pestaña «WhatsApp». Muestra la página del módulo central (la misma que ven los negocios en sus apps)
// con los datos de Diwilo. Para ver los de un negocio: Negocios → «Entrar como dueño».
Admin.tab('whatsapp', (A) => {
  const { $ } = A;
  const load = () => { const f = $('#waFrame'); if (!f.getAttribute('src')) f.src = '/admin/m/whatsapp?org=diwilo'; };
  return { show: load, hide: () => {} };
});
