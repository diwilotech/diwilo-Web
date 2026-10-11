// Panel Diwilo · pestaña «Integraciones e IA»: conversaciones del chat del sitio, ajustes del chat, API y webhooks,
// e IA Diwilo. Las tres primeras son las pestañas de antes, montadas aquí (mismos archivos de /admin/tabs/).
Admin.tab('ia', (A) => {
  const { $, esc, toast } = A;
  const VIEWS = [['agentes', 'Agentes', 'ph-users-three'], ['asistente', 'IA Diwilo', 'ph-robot'], ['chats', 'Conversaciones del chat', 'ph-chats-circle'],
    ['ajustes', 'Ajustes del chat', 'ph-sliders-horizontal'], ['api', 'API y webhooks', 'ph-plugs-connected']];
  const EMBED = ['chats', 'ajustes', 'api'];
  let view = (() => { try { const v = sessionStorage.getItem('dwl_ia_view'); sessionStorage.removeItem('dwl_ia_view'); return v || 'agentes'; } catch { return 'agentes'; } })();

  async function render() {
    const old = $('#iaView'), el = old.cloneNode(false);
    old.replaceWith(el);
    EMBED.forEach((id) => A.unmount(id));
    if (EMBED.includes(view)) { try { await A.mount(view, el); } catch (x) { if (x.message !== 'sesión') el.innerHTML = `<p class="err">${esc(x.message)}</p>`; } return; }
    if (view === 'agentes') return agents(el);
    el.innerHTML = `<div class="grid" style="--min:340px">
      <div class="card"><h2><i class="ph-light ph-robot"></i> IA Diwilo</h2>
        <p class="muted" style="font-size:13px;line-height:1.6">Asistente del panel (botón flotante abajo a la derecha). Responde con los datos reales del sitio, los negocios de las apps, Marketing y Finanzas.
        Las acciones que cambian datos te piden confirmar antes de ejecutarse y quedan en «Actividad en tiempo real».</p>
        <button class="btn pri" data-open><i class="ph-light ph-chat-circle-dots"></i>Abrir IA Diwilo</button></div>
      <div class="card"><h2>Qué puede hacer</h2>
        <div class="ia-caps"><b>Consulta</b><span>Estado del sitio, leads, negocios y vencimientos, organizaciones, resumen de marketing y de finanzas, tareas, contactos, el blog, lo que preguntan los clientes y tus agentes.</span>
        <b>Con tu confirmación</b><span>Crear tareas, contactos y campañas; registrar ingresos, gastos y gastos recurrentes; cambiar la etapa de un contacto; marcar tareas hechas; escribir borradores del blog; crear agentes y ponerlos a trabajar.</span>
        <b>No hace</b><span>Borrar, archivar negocios, cambiar dueños ni registrar pagos de suscripciones.</span></div></div>
      <div class="card"><h2>Modelo de IA</h2><p class="muted" style="font-size:13px;line-height:1.6" data-provider>…</p></div>
      <div class="card"><h2>Por MCP (próximo paso)</h2><p class="muted" style="font-size:13px;line-height:1.6">Las mismas herramientas se pueden abrir por MCP para usar Diwilo desde Claude Desktop u otra IA, con una clave de API de «API y webhooks».</p></div></div>`;
    $('[data-open]', el).onclick = () => document.getElementById('iaFab')?.click();
    A.api('settings').then((s) => { $('[data-provider]', el).textContent = `Usa ${s.ai_provider}. El chat del sitio y IA Diwilo comparten este modelo. Para usar Gemini, configura el secreto GEMINI_API_KEY en Cloudflare.`; }).catch(() => {});
  }
  /* ---------- Agentes ---------- */
  const SCHED = { manual: 'A mano', diario: 'Cada día (3:00 a. m.)', semanal: 'Cada lunes' };
  const AUTO = { proponer: ['soon', 'Propone, tú apruebas'], ejecutar: ['ok', 'Actúa solo'] };
  const RUN_ST = { trabajando: 'soon', 'por aprobar': 'soon', lista: 'ok', error: 'bad' };
  const ICON = { blog: 'ph-article', leads: 'ph-user-plus', cobranza: 'ph-hand-coins', renovaciones: 'ph-arrows-clockwise', analista: 'ph-chart-line-up' };
  const md = (t) => esc(t || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,3}\s+(.*)$/gm, '<b>$1</b>').replace(/^[-•*]\s+(.*)$/gm, '<span class="li">$1</span>').replace(/\n/g, '<br>');
  let meta = null, openRuns = null;

  async function agents(el) {
    el.innerHTML = `<div class="row hubbar"><p class="muted" style="margin:0;font-size:13px;max-width:760px">Cada agente tiene un rol, las herramientas que puede usar y cuándo trabaja. Si «propone», sus acciones esperan tu aprobación aquí; si «actúa solo», las hace y queda registro. Ninguno puede borrar, archivar, cambiar dueños ni registrar pagos, y los artículos del blog siempre quedan como borrador.</p>
      <span class="grow"></span><button class="btn pri" data-new><i class="ph-light ph-plus"></i>Nuevo agente</button></div>
      <div class="agrid" data-list></div><div data-runs style="margin-top:16px"></div>`;
    async function load() {
      try { meta = await A.api('agents'); } catch (x) { $('[data-list]', el).innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
      const orgs = (await window.Hub.loadOrgs().catch(() => ({ orgs: [] }))).orgs;
      const oname = (id) => orgs.find((o) => o.id === id)?.name || (id === 'diwilo' ? 'Diwilo' : id);
      $('[data-list]', el).innerHTML = meta.agents.length ? meta.agents.map((a) => `<article class="card acard ${a.active ? '' : 'off'}" data-id="${a.id}">
          <div class="row" style="gap:10px"><span class="aico"><i class="ph-light ${ICON[a.template] || 'ph-robot'}"></i></span><div style="flex:1;min-width:0"><b>${esc(a.name)}</b><br><span class="muted" style="font-size:12px">${esc(oname(a.org_id))}</span></div>
            ${a.pending_runs ? `<span class="badge" title="Ejecuciones con acciones por aprobar">${a.pending_runs}</span>` : ''}</div>
          <p class="muted aitext">${esc(a.instructions.slice(0, 160))}${a.instructions.length > 160 ? '…' : ''}</p>
          <div class="row" style="gap:6px;flex-wrap:wrap"><span class="st ${a.active ? 'ok' : 'free'}">${a.active ? SCHED[a.schedule] : 'Pausado'}</span><span class="st ${AUTO[a.autonomy][0]}">${AUTO[a.autonomy][1]}</span><span class="tag">${a.tools.length} herramientas</span></div>
          <span class="muted" style="font-size:12px">${a.last_run_at ? `Última vez: ${A.fmtDate(a.last_run_at)} · ${a.runs} ejecuciones` : 'Aún no ha trabajado'}</span>
          <div class="row" style="gap:6px"><button class="btn sm pri" data-run><i class="ph-light ph-play"></i>Ejecutar ahora</button><button class="btn sm" data-runs-btn><i class="ph-light ph-clock-counter-clockwise"></i>Ejecuciones</button><button class="btn sm" data-edit><i class="ph-light ph-pencil-simple"></i></button></div>
        </article>`).join('')
        : `<div class="card"><h2>Empieza con una plantilla</h2><div class="tplgrid">${meta.templates.map((t) => `<button class="tplbtn" data-tpl="${t.key}"><i class="ph-light ${ICON[t.key] || 'ph-robot'}"></i><b>${esc(t.name)}</b><span>${esc(t.instructions.split('\n')[0].slice(0, 110))}</span></button>`).join('')}</div></div>`;
      if (openRuns) showRuns(openRuns);
    }
    el.addEventListener('click', async (e) => {
      const tpl = e.target.closest('[data-tpl]');
      if (tpl) { await A.api('agents', { method: 'POST', body: { template: tpl.dataset.tpl } }); toast('Agente creado: revisa sus instrucciones si quieres'); return load(); }
      if (e.target.closest('[data-new]')) return pickTemplate(load);
      const card = e.target.closest('[data-id]'); if (!card) return;
      const a = meta.agents.find((x) => String(x.id) === card.dataset.id);
      if (e.target.closest('[data-edit]')) return edit(a, load);
      if (e.target.closest('[data-runs-btn]')) { openRuns = a.id; return showRuns(a.id); }
      if (e.target.closest('[data-run]')) {
        const pedido = await A.ask({ title: `Ejecutar «${a.name}»`, text: 'Opcional: algo puntual para esta vez (por ejemplo «escribe sobre facturación electrónica para restaurantes»).', input: true, placeholder: 'Déjalo vacío para que siga sus instrucciones', ok: 'Ejecutar ahora' });
        if (pedido === null) return;
        const b = card.querySelector('[data-run]'); b.disabled = true; b.innerHTML = '<i class="ph-light ph-circle-notch spin"></i>Trabajando…';
        const box = $('[data-runs]', el);
        box.onclick = null;
        box.innerHTML = '<div class="card"><div data-prog></div></div>';
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const p = A.progress($('[data-prog]', box), a.name);
        try {
          const r = await A.stream(`agents/${a.id}/run`, { pedido }, p.update);
          const pend = r.actions.filter((x) => x.status === 'pendiente').length;
          p.finish(r.status !== 'error', pend ? `Terminado · ${pend} acción${pend === 1 ? '' : 'es'} por aprobar` : undefined);
          toast('Listo');
        } catch (x) { p.finish(false, x.message); toast(x.message); }
        openRuns = a.id;
        setTimeout(load, 1800);
      }
    });
    async function showRuns(id) {
      const box = $('[data-runs]', el), a = meta.agents.find((x) => x.id === id);
      if (!a) { box.innerHTML = ''; return; }
      const { runs } = await A.api(`agents/${id}/runs`);
      box.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h2>Ejecuciones · ${esc(a.name)}</h2><button class="btn sm" data-close>Cerrar</button></div>
        ${runs.length ? runs.map((r) => `<div class="arun" data-run-id="${r.id}">
          <div class="row" style="gap:8px"><span class="st ${RUN_ST[r.status] || 'free'}">${esc(r.status)}</span><span class="muted" style="font-size:12px">${A.fmtDate(r.started_at)} · ${r.trigger === 'manual' ? 'a mano' : r.trigger}${r.used?.length ? ` · consultó ${r.used.length}` : ''}</span></div>
          <div class="aout">${md(r.output)}</div>
          ${r.actions.length ? `<div class="aacts">${r.actions.map((x, i) => `<div class="aact"><span><i class="ph-light ${x.status === 'hecha' ? 'ph-check-circle' : x.status === 'pendiente' ? 'ph-hourglass-medium' : x.status === 'error' ? 'ph-warning' : 'ph-x-circle'}"></i>${esc(x.summary)}${x.result?.error ? ` <span style="color:var(--bad)">· ${esc(x.result.error)}</span>` : ''}${x.tool === 'blog_crear_borrador' && x.status === 'hecha' ? ' <button class="btn sm" data-goblog>Ver en Blog</button>' : ''}</span>
            ${x.status === 'pendiente' ? `<span class="row" style="gap:6px"><button class="btn sm pri" data-approve="${i}">Aprobar</button><button class="btn sm" data-discard="${i}">Descartar</button></span>` : `<span class="muted" style="font-size:12px">${esc(x.status)}</span>`}</div>`).join('')}</div>` : ''}
        </div>`).join('') : '<p class="muted" style="margin:0">Aún no ha trabajado. Usa «Ejecutar ahora».</p>'}</div>`;
      box.onclick = async (e) => {
        if (e.target.closest('[data-close]')) { openRuns = null; box.innerHTML = ''; return; }
        if (e.target.closest('[data-goblog]')) return A.go('blog');
        const ap = e.target.closest('[data-approve], [data-discard]'); if (!ap) return;
        const runId = ap.closest('[data-run-id]').dataset.runId, i = ap.dataset.approve ?? ap.dataset.discard;
        ap.disabled = true;
        try { const r = await A.api(`agents/runs/${runId}/actions/${i}`, { method: 'POST', body: { approve: ap.dataset.approve !== undefined } }); toast(r.action.status === 'hecha' ? 'Hecho' : r.action.status === 'error' ? 'No se pudo' : 'Descartada'); }
        catch (x) { toast(x.message); }
        load();
      };
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    load();
  }

  async function pickTemplate(done) {
    const tpls = meta.templates;
    const d = document.createElement('dialog'); d.className = 'ask hubdlg';
    d.innerHTML = `<form method="dialog"><h2>Nuevo agente</h2><p class="muted">Elige una plantilla (luego puedes cambiar todo) o empieza en blanco.</p>
      <div class="tplgrid">${tpls.map((t) => `<button class="tplbtn" type="button" data-t="${t.key}"><i class="ph-light ${ICON[t.key] || 'ph-robot'}"></i><b>${esc(t.name)}</b><span>${esc(t.instructions.split('\n')[0].slice(0, 110))}</span></button>`).join('')}
      <button class="tplbtn" type="button" data-t=""><i class="ph-light ph-plus-circle"></i><b>En blanco</b><span>Defines el rol, las herramientas y cuándo trabaja.</span></button></div>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" type="button" data-no>Cancelar</button></div></form>`;
    document.body.appendChild(d);
    const close = () => { d.close(); d.remove(); };
    $('[data-no]', d).onclick = close; d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; close(); const t = tpls.find((x) => x.key === b.dataset.t); edit(t ? { ...t, template: t.key, active: 1, org_id: 'diwilo' } : { name: '', instructions: '', tools: [], schedule: 'manual', autonomy: 'proponer', active: 1, org_id: 'diwilo' }, done, true); });
    d.showModal();
  }

  async function edit(a, done, isNew) {
    const orgs = (await window.Hub.loadOrgs().catch(() => ({ orgs: [{ id: 'diwilo', name: 'Diwilo' }] }))).orgs;
    const tools = meta.tools;
    const d = document.createElement('dialog'); d.className = 'ask hubdlg';
    const toolBox = (write) => tools.filter((t) => !!t.write === write).map((t) => `<label class="tchk" title="${esc(t.desc)}"><input type="checkbox" name="tools" value="${t.name}" ${a.tools.includes(t.name) ? 'checked' : ''}><span><b>${esc(t.name.replace(/_/g, ' '))}</b><small>${esc(t.desc)}</small></span></label>`).join('');
    d.innerHTML = `<form method="dialog"><h2>${isNew ? 'Nuevo agente' : 'Editar agente'}</h2>
      <div class="form hubform">
        <label class="f">Nombre<input class="in" name="name" value="${esc(a.name)}" required maxlength="80"></label>
        <label class="f">Trabaja para<select class="in" name="org_id">${orgs.map((o) => `<option value="${esc(o.id)}" ${o.id === a.org_id ? 'selected' : ''}>${esc(o.name)}${o.app_name ? ` · ${esc(o.app_name)}` : ''}</option>`).join('')}</select></label>
        <label class="f">Cuándo trabaja<select class="in" name="schedule">${Object.entries(SCHED).map(([k, l]) => `<option value="${k}" ${a.schedule === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">Permiso<select class="in" name="autonomy"><option value="proponer" ${a.autonomy !== 'ejecutar' ? 'selected' : ''}>Propone, yo apruebo</option><option value="ejecutar" ${a.autonomy === 'ejecutar' ? 'selected' : ''}>Actúa solo</option></select></label>
        <label class="f full">Instrucciones (rol, qué revisar, qué hacer y cómo responder)${a.template && meta.templates.some((t) => t.key === a.template) ? ' <button class="btn sm" type="button" data-tplreset title="Trae las instrucciones y herramientas más nuevas de su plantilla"><i class="ph-light ph-arrows-counter-clockwise"></i>Usar la versión actual de la plantilla</button>' : ''}<textarea class="in" name="instructions" rows="7" required>${esc(a.instructions)}</textarea></label>
        <div class="full"><b style="font-size:13px;color:var(--hi);font-weight:500">Puede consultar</b><div class="tgrid">${toolBox(false)}</div></div>
        <div class="full"><b style="font-size:13px;color:var(--hi);font-weight:500">Puede hacer</b><div class="tgrid">${toolBox(true)}</div></div>
        <label class="f"><span>Estado</span><label class="row" style="gap:8px;font-size:13px"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}> Activo</label></label></div>
      <p class="err" data-err></p>
      <div class="row" style="justify-content:space-between;margin-top:12px"><span>${!isNew && a.id ? '<button class="btn sm danger" type="button" data-del><i class="ph-light ph-trash"></i>Borrar</button>' : ''}</span>
        <span class="row"><button class="btn" type="button" data-no>Cancelar</button><button class="btn pri" data-yes>Guardar</button></span></div></form>`;
    document.body.appendChild(d);
    const f = $('form', d), close = () => { d.close(); d.remove(); };
    $('[data-no]', d).onclick = close; d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    $('[data-tplreset]', d)?.addEventListener('click', () => {
      const t = meta.templates.find((x) => x.key === a.template);
      f.instructions.value = t.instructions;
      f.querySelectorAll('[name=tools]').forEach((x) => { x.checked = t.tools.includes(x.value); });
      toast('Plantilla aplicada: revisa y guarda');
    });
    $('[data-del]', d)?.addEventListener('click', async () => { if (await A.sure(`¿Borrar el agente «${a.name}» y su historial?`, 'Borrar')) { await A.api(`agents/${a.id}`, { method: 'DELETE' }); close(); toast('Agente borrado'); done(); } });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = { name: f.name.value, org_id: f.org_id.value, schedule: f.schedule.value, autonomy: f.autonomy.value, instructions: f.instructions.value,
        tools: [...f.querySelectorAll('[name=tools]:checked')].map((x) => x.value), active: f.active.checked, ...(isNew && a.template ? { template: a.template } : {}) };
      if (!body.tools.length) { $('[data-err]', d).textContent = 'Elige al menos una herramienta.'; return; }
      try { await A.api(isNew ? 'agents' : `agents/${a.id}`, { method: isNew ? 'POST' : 'PATCH', body }); close(); toast('Agente guardado'); done(); }
      catch (x) { $('[data-err]', d).textContent = x.message; }
    };
    d.showModal();
  }

  function pick() { A.$('#iaSeg').innerHTML = ''; window.Hub.seg($('#iaSeg'), VIEWS, (k) => { view = k; render(); }, view); render(); }
  // Si se llegó desde un enlace viejo (#chats, #ajustes, #api), abre esa sección.
  const wanted = () => { try { const v = sessionStorage.getItem('dwl_ia_view'); sessionStorage.removeItem('dwl_ia_view'); return v; } catch { return null; } };
  return { show: () => { const w = wanted(); if (w) view = w; return A.$('#iaSeg').children.length && !w ? render() : pick(); }, hide: () => EMBED.forEach((id) => A.unmount(id)) };
});
