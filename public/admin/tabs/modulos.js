// Panel Diwilo · pestaña «modulos»: catálogo de módulos de cada app (se lee solo de la app), planes con precio,
// módulos de cada negocio (plan + excepciones con fechas y motivo) y bitácora. La API está en worker/src/modulos.js.
Admin.tab('modulos', (A) => {
  const { $, $$, esc, fmtN, fmtDate, toast, api, ask, sure } = A;
  const fmtCOP = (n) => '$' + fmtN(n);
  const ST = { ok: ['ok', 'Sincronizado'], pendiente: ['soon', 'Pendiente'], error: ['bad', 'Error'], sin_soporte: ['free', 'App sin módulos'] };
  const ORIGEN = { plan: ['ok', 'Del plan'], agregado: ['soon', 'Agregado'], quitado: ['bad', 'Quitado'], fuera: ['free', 'No incluido'] };
  const VIEWS = [['negocios', 'Negocios', 'bi-buildings'], ['planes', 'Planes', 'bi-layers'], ['catalogo', 'Catálogo', 'bi-grid-1x2'], ['bitacora', 'Bitácora', 'bi-clock-history']];
  let apps = [], app = null, data = null, view = 'negocios', openBiz = null;
  const st = (k) => { const [c, t] = ST[k] || ['free', k || '—']; return `<span class="st ${c}">${esc(t)}</span>`; };

  async function loadApps() {
    apps = (await api('modulos')).apps;
    // Desde Negocios se puede abrir un negocio puntual (A.modulosDe)
    let want = null; try { want = JSON.parse(sessionStorage.getItem('dwl_mod_open') || 'null'); sessionStorage.removeItem('dwl_mod_open'); } catch {}
    if (want) { app = want.app; openBiz = want.id; view = 'negocios'; }
    if (!app || !apps.some((a) => a.key === app)) app = (apps.find((a) => a.connected) || apps[0]).key;
    $('#modApps').innerHTML = apps.map((a) => `<button class="btn btn-sm ${a.key === app ? 'active' : ''} btn-outline-secondary" data-app="${a.key}">${esc(a.name)}</button>`).join('');
    $('#modSeg').innerHTML = VIEWS.map(([k, l, i]) => `<button class="btn btn-sm ${k === view ? 'active' : ''} btn-outline-secondary" data-v="${k}"><i class="bi ${i}"></i>${l}</button>`).join('');
    await load();
  }
  async function load() {
    $('#modErr').textContent = '';
    try { data = await api(`modulos/${app}`); } catch (e) { $('#modErr').textContent = e.message; return; }
    const a = apps.find((x) => x.key === app);
    $('#modNote').innerHTML = data.soporta === false ? `<b>${esc(data.nombre)}</b> todavía no tiene módulos (es de antes de la plantilla): todos sus negocios tienen todo activo. Cuando se migre, pulsa «Sincronizar».`
      : data.soporta == null ? 'Pulsa «Sincronizar» para leer el catálogo de módulos de la app.' : `Catálogo leído de la app${data.revisado_at ? ` · última revisión ${fmtDate(data.revisado_at)}` : ''}. Se revisa solo cada día a las 3:00 a. m.`;
    if (data.error) $('#modErr').textContent = data.error;
    const n = data.negocios, cnt = (k) => n.filter((b) => b.estado === k).length;
    $('#modKpis').innerHTML = [[fmtN(data.catalogo.filter((m) => m.en_app).length), 'Módulos'], [fmtN(data.planes.length), 'Planes'], [fmtN(n.length), 'Negocios'],
      [fmtN(cnt('ok')), 'Sincronizados'], [`<span style="color:${cnt('error') ? 'var(--bad)' : 'inherit'}">${fmtN(cnt('error') + cnt('pendiente'))}</span>`, 'Con error o pendientes']]
      .map(([v, l]) => `<div class="dw-card kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    render();
    if (!a?.connected) $('#modErr').textContent = `${a?.name} no está conectada (falta el service binding).`;
  }
  function render() {
    $$('#modSeg .btn').forEach((b) => b.classList.toggle('active', b.dataset.v === view));
    ({ negocios, planes, catalogo, bitacora })[view]($('#modView'));
  }
  const modName = (id) => data.catalogo.find((m) => m.modulo === id)?.nombre || id;

  /* ---------- negocios ---------- */
  function negocios(el) {
    el.innerHTML = `<div class="dw-card table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Negocio</th><th>Plan</th><th>Módulos</th><th>Sincronización</th><th></th></tr></thead><tbody>${data.negocios.length ? data.negocios.map((b) => `<tr>
      <td><b style="font-weight:500;color:var(--hi)">${esc(b.business_name || b.business_id)}</b></td>
      <td>${b.plan ? esc(b.plan) : '<span class="text-body-secondary">—</span>'}</td>
      <td class="text-body-secondary">${b.activos == null ? '—' : `${fmtN(b.activos)} de ${fmtN(data.catalogo.filter((m) => m.en_app).length)}`}</td>
      <td>${st(b.estado)}${b.error ? `<div class="text-danger small" style="font-size:12px">${esc(b.error)}</div>` : ''}${b.synced_at ? `<div class="text-body-secondary" style="font-size:12px">${fmtDate(b.synced_at)}</div>` : ''}</td>
      <td><button class="btn btn-sm btn-outline-secondary" data-biz="${esc(b.business_id)}"><i class="bi bi-sliders"></i>Módulos</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="dw-empty">${data.soporta === false ? 'Esta app aún no maneja módulos.' : 'Pulsa «Sincronizar» para traer los negocios de la app.'}</td></tr>`}</tbody></table></div><div id="modBiz" style="margin-top:14px"></div>`;
    el.querySelector('tbody').addEventListener('click', (e) => { const b = e.target.closest('[data-biz]'); if (b) detalle(b.dataset.biz); });
    if (openBiz) { detalle(openBiz); openBiz = null; }
  }

  async function detalle(id) {
    const box = $('#modBiz');
    box.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    let d;
    try { d = await api(`modulos/${app}/negocios/${encodeURIComponent(id)}`); } catch (e) { box.innerHTML = `<div class="dw-card text-danger small">${esc(e.message)}</div>`; return; }
    const on = d.modulos.filter((m) => m.activo).length;
    box.innerHTML = `<div class="dw-card">
      <div class="dw-row" style="justify-content:space-between;align-items:flex-start;margin-bottom:12px"><div><h2 style="margin:0">${esc(d.negocio.nombre || id)}</h2>
        <p class="text-body-secondary" style="margin:4px 0 0;font-size:13px">${on} de ${d.modulos.length} módulos activos · ${st(d.negocio.estado)}${d.negocio.version_app && d.negocio.version_app !== d.negocio.version ? ' <span class="st soon">La app tiene otra versión: sincroniza</span>' : ''}</p></div>
        <button class="btn btn-sm btn-outline-secondary" data-close>Cerrar</button></div>
      <form class="dw-row" data-plan style="gap:8px;margin-bottom:14px"><label class="dw-field" style="min-width:240px">Plan<select class="form-select" name="plan_id">${data.planes.map((p) => `<option value="${p.id}" ${p.id === d.plan_id ? 'selected' : ''}>${esc(p.nombre)} · ${fmtCOP(p.precio)}/mes</option>`).join('')}</select></label>
        <button class="btn btn-primary btn-sm" style="align-self:flex-end">Cambiar plan</button></form>
      <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Módulo</th><th>Estado</th><th class="text-end">Registros</th><th>Fechas</th><th></th></tr></thead><tbody>${d.modulos.map((m) => {
        const [c, t] = ORIGEN[m.origen];
        return `<tr><td><b style="font-weight:500;color:var(--hi)">${esc(m.nombre)}</b> <span class="badge text-bg-secondary fw-normal">${m.tipo === 'compartido' ? 'catálogo' : 'propio'}</span>${m.activo_catalogo ? '' : ' <span class="badge text-bg-secondary fw-normal">retirado</span>'}</td>
          <td><span class="st ${c}">${t}</span></td>
          <td class="text-end">${m.registros == null ? '—' : fmtN(m.registros)}</td>
          <td class="text-body-secondary">${m.desde || m.hasta ? `${m.desde || '…'} → ${m.hasta || '…'}` : '—'}</td>
          <td style="white-space:nowrap">${m.activo ? `<button class="btn btn-sm btn-outline-danger" data-quitar="${esc(m.modulo)}">Quitar</button>` : `<button class="btn btn-sm btn-outline-secondary" data-agregar="${esc(m.modulo)}">Agregar</button>`}</td></tr>`;
      }).join('')}</tbody></table></div>
      <h3 style="margin:18px 0 8px">Excepciones</h3>
      ${d.excepciones.length ? `<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Módulo</th><th>Qué</th><th>Fechas</th><th>Motivo</th><th>Quién</th><th></th></tr></thead><tbody>${d.excepciones.map((e) => `<tr>
        <td>${esc(modName(e.modulo))}</td><td><span class="st ${e.modo === 'agregar' ? 'soon' : 'bad'}">${e.modo === 'agregar' ? 'Agregado' : 'Quitado'}</span>${e.vigente ? '' : ' <span class="badge text-bg-secondary fw-normal">no vigente</span>'}</td>
        <td class="text-body-secondary">${e.desde || e.hasta ? `${e.desde || '…'} → ${e.hasta || '…'}` : 'Sin fecha'}</td><td>${esc(e.nota || '')}</td><td class="text-body-secondary">${esc(e.por || '')}<br>${fmtDate(e.created_at)}</td>
        <td><button class="btn btn-sm btn-outline-secondary" data-delexc="${e.id}" title="Volver a lo del plan"><i class="bi bi-arrow-counterclockwise"></i></button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="text-body-secondary" style="margin:0">Sin excepciones: tiene exactamente lo de su plan.</p>'}
    </div>`;
    const done = async (r, msg) => { toast(r?.estado === 'error' ? `Guardado, pero la app no respondió: ${r.error}` : msg); await load(); await detalle(id); };
    box.querySelector('[data-close]').onclick = () => { box.innerHTML = ''; };
    box.querySelector('[data-plan]').onsubmit = async (e) => {
      e.preventDefault();
      const p = data.planes.find((x) => x.id === +e.target.plan_id.value);
      if (p.id === d.plan_id) return;
      const pierde = d.modulos.filter((m) => m.activo && !(p.todos || p.modulos.includes(m.modulo)) && m.origen !== 'agregado');
      if (!(await sure(`¿Pasar a «${d.negocio.nombre}» al plan «${p.nombre}» (${fmtCOP(p.precio)}/mes)?${pierde.length ? `\n\nDejará de ver: ${pierde.map((m) => `${m.nombre}${m.registros ? ` (${fmtN(m.registros)} registros, no se borran)` : ''}`).join(', ')}.` : ''}`, 'Cambiar plan', !!pierde.length))) return;
      try { await done(await api(`modulos/${app}/negocios/${encodeURIComponent(id)}`, { method: 'PUT', body: { plan_id: p.id } }), 'Plan cambiado'); } catch (x) { toast(x.message); }
    };
    box.querySelector('tbody').addEventListener('click', async (e) => {
      const q = e.target.closest('[data-quitar]'), ag = e.target.closest('[data-agregar]');
      if (!q && !ag) return;
      const m = d.modulos.find((x) => x.modulo === (q || ag).dataset[q ? 'quitar' : 'agregar']);
      const modo = q ? 'quitar' : 'agregar';
      const r = await excepcion(m, modo);
      if (!r) return;
      try { await done(await api(`modulos/${app}/negocios/${encodeURIComponent(id)}/excepciones`, { method: 'POST', body: { modulo: m.modulo, modo, ...r } }), modo === 'quitar' ? 'Módulo quitado' : 'Módulo agregado'); } catch (x) { toast(x.message); }
    });
    box.querySelectorAll('[data-delexc]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await sure('¿Quitar esta excepción? El negocio vuelve a tener lo de su plan.', 'Quitar excepción', false))) return;
      try { await done(await api(`modulos/${app}/negocios/${encodeURIComponent(id)}/excepciones/${b.dataset.delexc}`, { method: 'DELETE' }), 'Vuelve a lo del plan'); } catch (x) { toast(x.message); }
    }));
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Ventana para agregar o quitar un módulo: fechas opcionales y motivo obligatorio (queda en la bitácora).
  function excepcion(m, modo) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'ask';
      dlg.innerHTML = `<form method="dialog"><h2>${modo === 'quitar' ? 'Quitar' : 'Agregar'} «${esc(m.nombre)}»</h2>
        ${modo === 'quitar' && m.registros ? `<p class="text-body-secondary">Este negocio tiene <b>${fmtN(m.registros)} registros</b> en este módulo. No se borran: si lo vuelves a activar, todo sigue ahí.</p>` : ''}
        <div class="dw-form" style="margin-top:10px"><label class="dw-field">Desde (opcional)<input class="form-control" type="date" name="desde"></label><label class="dw-field">Hasta (opcional)<input class="form-control" type="date" name="hasta"></label>
        <label class="dw-field dw-full">Motivo<input class="form-control" name="nota" required placeholder="${modo === 'quitar' ? 'Pidió bajar de plan, no lo usa…' : 'Prueba de 30 días, cortesía…'}"></label></div>
        <div class="dw-row" style="justify-content:flex-end;margin-top:16px"><button class="btn btn-outline-secondary" type="button" data-no>Cancelar</button><button class="btn ${modo === 'quitar' ? 'btn-danger' : 'btn-primary'}">${modo === 'quitar' ? 'Quitar' : 'Agregar'}</button></div></form>`;
      document.body.appendChild(dlg);
      const f = dlg.querySelector('form'), end = (v) => { dlg.close(); dlg.remove(); resolve(v); };
      dlg.querySelector('[data-no]').onclick = () => end(null);
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); end(null); });
      f.addEventListener('submit', (e) => { e.preventDefault(); if (!f.nota.value.trim()) return f.nota.focus(); end({ desde: f.desde.value, hasta: f.hasta.value, nota: f.nota.value.trim() }); });
      dlg.showModal(); f.nota.focus();
    });
  }

  /* ---------- planes ---------- */
  function planes(el) {
    const live = data.catalogo.filter((m) => m.en_app);
    el.innerHTML = `<div class="dw-grid" style="--min:280px">${data.planes.map((p) => `<div class="dw-card">
        <div class="dw-row" style="justify-content:space-between"><h2 style="margin:0">${esc(p.nombre)}${p.por_defecto ? ' <span class="badge text-bg-secondary fw-normal">por defecto</span>' : ''}</h2><b style="color:var(--hi)">${fmtCOP(p.precio)}/mes</b></div>
        <p class="text-body-secondary" style="margin:6px 0;font-size:13px">${esc(p.descripcion || '')}</p>
        <p style="margin:6px 0;font-size:13px">${p.todos ? 'Todos los módulos (también los nuevos)' : p.modulos.map((id) => esc(modName(id))).join(' · ') || '<span class="text-body-secondary">Sin módulos</span>'}</p>
        <div class="dw-row" style="justify-content:space-between;margin-top:10px"><span class="text-body-secondary" style="font-size:13px">${fmtN(p.negocios)} negocio(s)</span>
          <span><button class="btn btn-sm btn-outline-secondary" data-edit="${p.id}"><i class="bi bi-pencil"></i>Editar</button>${p.negocios ? '' : ` <button class="btn btn-sm btn-outline-danger" data-del="${p.id}"><i class="bi bi-trash"></i></button>`}</span></div></div>`).join('')}
      <button class="dw-card" data-new style="border:1px dashed var(--line);background:none;cursor:pointer;color:var(--ink2);min-height:140px"><i class="bi bi-plus-lg"></i> Nuevo plan</button></div>
      <form class="dw-card" data-form hidden style="margin-top:14px"></form>`;
    const f = el.querySelector('[data-form]');
    const edit = (p) => {
      p = p || { nombre: '', precio: 0, todos: 0, por_defecto: 0, modulos: [], descripcion: '' };
      f.hidden = false;
      f.innerHTML = `<h2>${p.id ? `Editar «${esc(p.nombre)}»` : 'Nuevo plan'}</h2>
        <div class="dw-form" style="margin-top:12px"><label class="dw-field">Nombre<input class="form-control" name="nombre" value="${esc(p.nombre)}" required placeholder="Básico, Pro…"></label>
        <label class="dw-field">Precio mensual (COP)<input class="form-control" type="number" min="0" step="1000" name="precio" value="${p.precio}"></label>
        <label class="dw-field dw-full">Descripción<input class="form-control" name="descripcion" value="${esc(p.descripcion || '')}"></label>
        <label class="dw-field"><span><input type="checkbox" name="todos" ${p.todos ? 'checked' : ''}> Todos los módulos (los nuevos entran solos)</span></label>
        <label class="dw-field"><span><input type="checkbox" name="por_defecto" ${p.por_defecto ? 'checked' : ''}> Plan por defecto de los negocios nuevos</span></label></div>
        <div data-mods style="margin-top:12px;display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${live.map((m) => `<label class="dw-card" style="padding:10px;display:flex;gap:8px;align-items:flex-start;${m.activo_catalogo ? '' : 'opacity:.6'}">
          <input type="checkbox" name="m" value="${esc(m.modulo)}" ${p.modulos.includes(m.modulo) ? 'checked' : ''}><span><b style="font-weight:500">${esc(m.nombre)}</b><br><span class="text-body-secondary" style="font-size:12px">${m.tipo === 'compartido' ? `catálogo v${esc(m.version || '?')}` : 'propio'}${m.depende_de.length ? ` · necesita ${m.depende_de.map(modName).join(', ')}` : ''}${m.activo_catalogo ? '' : ' · retirado'}</span></span></label>`).join('')}</div>
        <div class="dw-row" style="margin-top:14px"><button class="btn btn-primary"><i class="bi bi-check-lg"></i>Guardar plan</button><button class="btn btn-outline-secondary" type="button" data-cancel>Cancelar</button><span class="text-danger small" data-err></span></div>`;
      const toggle = () => { f.querySelector('[data-mods]').style.display = f.todos.checked ? 'none' : 'grid'; };
      f.todos.onchange = toggle; toggle();
      f.querySelector('[data-cancel]').onclick = () => { f.hidden = true; };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const body = { nombre: f.nombre.value, precio: f.precio.value, descripcion: f.descripcion.value, todos: f.todos.checked, por_defecto: f.por_defecto.checked, modulos: $$('[name=m]:checked', f).map((x) => x.value) };
        if (p.id && p.negocios && !(await sure(`Este cambio se aplica a ${p.negocios} negocio(s) con el plan «${p.nombre}». ¿Continuar?`, 'Aplicar', false))) return;
        try {
          const r = await api(p.id ? `modulos/${app}/planes/${p.id}` : `modulos/${app}/planes`, { method: p.id ? 'PATCH' : 'POST', body });
          toast(p.id ? `Plan guardado${r.afectados ? ` y enviado a ${r.afectados} negocio(s)` : ''}${r.errores ? ` (${r.errores} con error)` : ''}` : 'Plan creado');
          await load();
        } catch (x) { f.querySelector('[data-err]').textContent = x.message; }
      };
      f.scrollIntoView({ behavior: 'smooth' });
    };
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-new]')) return edit(null);
      const ed = e.target.closest('[data-edit]'); if (ed) return edit(data.planes.find((p) => p.id === +ed.dataset.edit));
      const del = e.target.closest('[data-del]');
      if (del && (await sure('¿Borrar este plan?', 'Borrar'))) { try { await api(`modulos/${app}/planes/${del.dataset.del}`, { method: 'DELETE' }); toast('Plan borrado'); load(); } catch (x) { toast(x.message); } }
    });
  }

  /* ---------- catálogo ---------- */
  function catalogo(el) {
    el.innerHTML = `<div class="dw-card table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Módulo</th><th>Tipo</th><th>Versión</th><th>Necesita</th><th>Estado</th><th></th></tr></thead><tbody>${data.catalogo.length ? data.catalogo.map((m) => `<tr>
      <td><b style="font-weight:500;color:var(--hi)">${esc(m.nombre)}</b> <span class="text-body-secondary font-monospace small" style="font-size:12px">${esc(m.modulo)}</span>${m.descripcion ? `<div class="text-body-secondary" style="font-size:12px;max-width:520px">${esc(m.descripcion)}</div>` : ''}</td>
      <td><span class="badge text-bg-secondary fw-normal">${m.tipo === 'compartido' ? 'Catálogo Diwilo' : 'Propio de la app'}</span></td><td class="font-monospace small">${esc(m.version || '—')}</td>
      <td class="text-body-secondary">${m.depende_de.map(modName).map(esc).join(', ') || '—'}</td>
      <td>${!m.en_app ? '<span class="st bad">Ya no está en la app</span>' : m.activo_catalogo ? '<span class="st ok">Se ofrece</span>' : '<span class="st free">Retirado</span>'}</td>
      <td>${m.en_app ? `<button class="btn btn-sm btn-outline-secondary" data-toggle="${esc(m.modulo)}" data-on="${m.activo_catalogo ? 0 : 1}">${m.activo_catalogo ? 'Retirar' : 'Volver a ofrecer'}</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="6" class="dw-empty">Pulsa «Sincronizar» para leer los módulos de la app.</td></tr>'}</tbody></table></div>
      <p class="text-body-secondary" style="font-size:12px;margin-top:8px">Los módulos se leen de la app (su <span class="font-monospace small">modulos.app.json</span> y los instalados del catálogo). Retirar uno no lo quita a quien ya lo tiene: solo deja de ofrecerse en planes «todos» y en excepciones nuevas.</p>`;
    el.querySelector('tbody').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-toggle]'); if (!b) return;
      if (b.dataset.on === '0' && !(await sure('¿Retirar este módulo del catálogo? Quien lo tiene en un plan con módulos escogidos lo conserva; los planes «todos» dejarán de incluirlo.', 'Retirar'))) return;
      try { await api(`modulos/${app}/catalogo/${b.dataset.toggle}`, { method: 'PATCH', body: { activo_catalogo: b.dataset.on === '1' } }); load(); } catch (x) { toast(x.message); }
    });
  }

  /* ---------- bitácora ---------- */
  async function bitacora(el) {
    el.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    const { rows } = await api(`modulos/bitacora?app=${app}`);
    el.innerHTML = `<div class="dw-card table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Cuándo</th><th>Quién</th><th>Negocio</th><th>Qué</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>
      <td class="text-body-secondary" style="white-space:nowrap">${fmtDate(r.ts)}</td><td class="text-body-secondary">${esc(r.por || '')}</td><td>${esc(r.business_name || '—')}</td><td>${esc(r.accion)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="dw-empty">Sin cambios todavía.</td></tr>'}</tbody></table></div>`;
  }

  $('#modApps').addEventListener('click', (e) => { const b = e.target.closest('[data-app]'); if (!b) return; app = b.dataset.app; $$('#modApps .btn').forEach((x) => x.classList.toggle('active', x === b)); load(); });
  $('#modSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; render(); });
  $('#modSync').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const r = await api(`modulos/${app}/sincronizar`, { method: 'POST' }); toast(r.soporta === false ? 'Esta app aún no tiene módulos' : `${r.revisados} negocios revisados · ${r.enviados} actualizados${r.errores ? ` · ${r.errores} con error` : ''}`); await loadApps(); }
    catch (x) { $('#modErr').textContent = x.message; } finally { b.disabled = false; }
  });
  return { show: loadApps };
});
