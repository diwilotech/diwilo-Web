// Panel Diwilo · pestaña «equipo». La carga admin/core.js la primera vez que se abre.
Admin.tab('equipo', (A) => {
  const { $, $$, esc, api, toast, sure } = A;
  let cat = {}, defaults = [], members = [];

  const boxes = (sel, name) => Object.entries(cat).map(([k, l]) => `<label class="dw-row" style="gap:6px"><input type="checkbox" data-mod="${k}" ${sel.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('');
  const picked = (root) => $$('[data-mod]', root).filter((c) => c.checked).map((c) => c.dataset.mod);

  function draw() {
    $('#teamList').innerHTML = members.length ? members.map((m) => `<div class="dw-card" data-email="${esc(m.email)}" style="margin-bottom:10px">
      <div class="dw-row" style="justify-content:space-between">
        <div><b>${esc(m.name || m.email)}</b>${m.name ? ` <span class="text-body-secondary">${esc(m.email)}</span>` : ''}${m.active ? '' : ' <span class="badge text-bg-secondary fw-normal">Pausado</span>'}</div>
        <div class="dw-row"><button class="btn btn-sm btn-outline-secondary" data-act="toggle">${m.active ? 'Pausar' : 'Activar'}</button><button class="btn btn-sm btn-outline-danger" data-act="del"><i class="bi bi-trash"></i></button></div>
      </div>
      <div class="dw-row" style="gap:12px;margin-top:10px">${boxes(m.modules)}</div>
    </div>`).join('') : '<p class="dw-empty">Aún no hay personal. Agrega un correo arriba.</p>';
  }
  const save = (m) => api('team', { method: 'POST', body: m });
  const load = async () => {
    const d = await api('team'); cat = d.modules; defaults = d.defaults; members = d.members;
    $('#newMods').innerHTML = boxes(defaults); draw();
  };

  $('#teamForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    await save({ email: f.elements.email.value, name: f.elements.name.value, modules: picked($('#newMods')) });
    f.reset(); toast('Persona agregada'); await load();
  });
  $('#teamList').addEventListener('change', async (e) => {
    if (!e.target.dataset.mod) return;
    const card = e.target.closest('[data-email]'), m = members.find((x) => x.email === card.dataset.email);
    m.modules = picked(card); await save(m); toast('Módulos guardados');
  });
  $('#teamList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const m = members.find((x) => x.email === b.closest('[data-email]').dataset.email);
    if (b.dataset.act === 'toggle') { m.active = m.active ? 0 : 1; await save(m); toast(m.active ? 'Activado' : 'Pausado'); draw(); }
    else if (await sure(`¿Quitar a ${m.email} del equipo? Ya no podrá entrar al panel.`, 'Quitar')) { await api(`team?email=${encodeURIComponent(m.email)}`, { method: 'DELETE' }); toast('Persona quitada'); await load(); }
  });
  return { show: load };
});
