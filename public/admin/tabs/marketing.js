// Panel Diwilo · pestaña «Marketing». Muestra la página del módulo central (la misma que ven los negocios en sus apps)
// en /admin/m/marketing y deja elegir la organización (Diwilo o un negocio de una app).
Admin.tab('marketing', (A) => {
  const { $ } = A;
  const H = window.Hub;
  let org = null;
  const open = () => { org = H.current(); $('#mkFrame').src = `/admin/m/marketing?org=${encodeURIComponent(org)}`; };
  async function load() {
    if (!$('#mkOrg').children.length) { await H.orgPicker($('#mkOrg'), () => open()); open(); return; }
    if (H.current() !== org) { $('#mkOrg select').value = H.current(); open(); }
  }
  return { show: load, hide: () => {} };
});
