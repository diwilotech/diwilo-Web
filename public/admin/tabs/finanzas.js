// Panel Diwilo · pestaña «Finanzas». Muestra la página del módulo central (la misma que ven los negocios en sus apps)
// en /admin/m/finanzas y deja elegir la organización (Diwilo o un negocio de una app).
Admin.tab('finanzas', (A) => {
  const { $ } = A;
  const H = window.Hub;
  let org = null;
  const open = () => { org = H.current(); $('#fiFrame').src = `/admin/m/finanzas?org=${encodeURIComponent(org)}`; };
  async function load() {
    if (!$('#fiOrg').children.length) { await H.orgPicker($('#fiOrg'), () => open()); open(); return; }
    if (H.current() !== org) { $('#fiOrg select').value = H.current(); open(); }
  }
  return { show: load, hide: () => {} };
});
