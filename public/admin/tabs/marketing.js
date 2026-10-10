// Panel Diwilo · pestaña «Marketing» (Marketing Hub). Funciona por organización: Diwilo o cada negocio.
Admin.tab('marketing', (A) => {
  const { $, $$, esc, toast, api, fmtDate, rank } = A;
  const H = window.Hub;
  const { money, num, pct, day } = H;
  let org = H.current(), view = (() => { try { const v = sessionStorage.getItem('dwl_mk_view'); sessionStorage.removeItem('dwl_mk_view'); return v || 'resumen'; } catch { return 'resumen'; } })();
  const P = () => `hub/${encodeURIComponent(org)}`;

  const STAGE_C = { lead: 'Lead', cliente: 'Cliente', perdido: 'Perdido' };
  const STAGE_D = { nuevo: 'Nuevo', calificado: 'Calificado', propuesta: 'Propuesta', negociacion: 'Negociación', ganado: 'Ganado', perdido: 'Perdido' };
  const CHANNEL = { meta_ads: 'Meta Ads', google_ads: 'Google Ads', whatsapp: 'WhatsApp', correo: 'Correo', organico: 'Orgánico', otro: 'Otro' };
  const TOOL_CAT = { marketing: 'Marketing', crm: 'CRM', infraestructura: 'Infraestructura', software: 'Software', api: 'API', ia: 'IA', otro: 'Otro' };
  const TRIGGER = { lead_nuevo: 'Llega un lead nuevo', sin_contacto: 'Lead sin contacto por N días', presupuesto_campana: 'Campaña usó el X% del presupuesto', factura_vencida: 'Factura vencida', semanal: 'Cada lunes' };
  const ACTION = { crear_tarea: 'Crear una tarea', crear_oportunidad: 'Crear una oportunidad', informe_ia: 'Informe del agente de IA' };
  const opts = (o, first) => [...(first ? [['', first]] : []), ...Object.entries(o)];
  const chip = (cls, t) => `<span class="st ${cls}">${esc(t)}</span>`;
  const refName = (R, ent, id, key = 'name') => (id ? esc(R[ent]?.find((x) => x.id === id)?.[key] || `#${id}`) : '<span class="muted">—</span>');

  const VIEWS = [['resumen', 'Resumen', 'ph-chart-line-up'], ['contactos', 'Clientes y leads', 'ph-address-book'], ['oportunidades', 'Oportunidades', 'ph-funnel'],
    ['campanas', 'Campañas', 'ph-megaphone'], ['tareas', 'Tareas y automatizaciones', 'ph-check-square'],
    ['herramientas', 'Suscripciones y herramientas', 'ph-plugs'], ['informes', 'Informes', 'ph-file-text'],
    ['tarjetas', 'Tarjetas', 'ph-identification-card']];
  // Las tarjetas de presentación son de Diwilo (las de cada negocio viven en su app). Los links de rastreo están en Campañas.
  const DIWILO_ONLY = new Set(['tarjetas']);
  const EMBED = { tarjetas: 'cards' };
  const EMBEDDED = ['links', 'cards'];
  const LEAD_ST = { nuevo: ['soon', 'Nuevo'], contactado: ['ok', 'Contactado'], propuesta: ['ok', 'Propuesta'], ganado: ['ok', 'Ganado'], perdido: ['free', 'Perdido'] };

  // Plantillas de tareas prediseñadas: varias tareas en secuencia (título, días después de empezar).
  // Variables: {nombre} cliente o lead · {campana} · {porcentaje} · {factura} · {tercero}
  const PLAYBOOKS = {
    lead: ['Nuevo lead', [['Escribir o llamar a {nombre} (WhatsApp)', 0], ['Enviar información o propuesta a {nombre}', 1], ['Seguimiento a {nombre}', 3], ['Último intento con {nombre}', 7]]],
    propuesta: ['Propuesta comercial', [['Preparar la propuesta para {nombre}', 0], ['Enviar la propuesta a {nombre}', 1], ['Llamar a {nombre} para resolver dudas', 3], ['Cerrar o descartar con {nombre}', 7]]],
    onboarding: ['Cliente nuevo (arranque)', [['Bienvenida a {nombre}', 0], ['Reunión de arranque con {nombre}', 2], ['Configurar la cuenta y los accesos de {nombre}', 3], ['Revisión de los primeros 15 días con {nombre}', 15]]],
    seguimiento: ['Seguimiento sin respuesta', [['Hacer seguimiento a {nombre}', 0]]],
    campana: ['Campaña nueva', [['Definir público, mensaje y presupuesto de {campana}', 0], ['Crear las piezas y los links de rastreo de {campana}', 1], ['Lanzar {campana}', 2], ['Revisar resultados de {campana}', 7], ['Informe final de {campana}', 30]]],
    presupuesto: ['Alerta de presupuesto', [['Revisar la campaña {campana}: va en {porcentaje}% del presupuesto', 0]]],
    cobro: ['Cobro de factura', [['Recordatorio amable de la factura {factura} a {tercero}', 0], ['Llamar a {tercero} por la factura {factura}', 3], ['Escalar el cobro de la factura {factura}', 10]]],
  };
  const stepsOf = (a) => { try { const v = JSON.parse(a.task_title); if (Array.isArray(v)) return v; } catch {} return a.task_title ? [{ t: a.task_title, d: a.trigger === 'lead_nuevo' ? a.days || 0 : 0 }] : []; };

  const F = {
    contacts: [
      { k: 'name', label: 'Nombre', required: true }, { k: 'company', label: 'Empresa' }, { k: 'email', label: 'Correo', type: 'email' }, { k: 'phone', label: 'Teléfono' },
      { k: 'stage', label: 'Etapa', type: 'select', options: Object.entries(STAGE_C) }, { k: 'source', label: 'Origen', placeholder: 'Sitio web, referido, Meta Ads…' },
      { k: 'campaign_id', label: 'Campaña', ref: 'campaigns' }, { k: 'owner', label: 'Responsable' }, { k: 'last_contact_at', label: 'Último contacto', type: 'date' },
      { k: 'tags', label: 'Etiquetas', placeholder: 'restaurante, medellín' }, { k: 'notes', label: 'Notas', type: 'long' }],
    deals: [
      { k: 'title', label: 'Oportunidad', required: true, full: true }, { k: 'contact_id', label: 'Cliente o lead', ref: 'contacts' }, { k: 'value', label: 'Valor (COP)', type: 'money' },
      { k: 'stage', label: 'Etapa', type: 'select', options: Object.entries(STAGE_D) }, { k: 'campaign_id', label: 'Campaña', ref: 'campaigns' },
      { k: 'expected_close', label: 'Cierre esperado', type: 'date' }, { k: 'notes', label: 'Notas', type: 'long' }],
    campaigns: [
      { k: 'name', label: 'Campaña', required: true, full: true }, { k: 'channel', label: 'Canal', type: 'select', options: Object.entries(CHANNEL) },
      { k: 'status', label: 'Estado', type: 'select', options: [['activa', 'Activa'], ['pausada', 'Pausada'], ['terminada', 'Terminada']] },
      { k: 'budget', label: 'Presupuesto (COP)', type: 'money' }, { k: 'goal_leads', label: 'Meta de leads', type: 'int' },
      { k: 'start_date', label: 'Inicio', type: 'date' }, { k: 'end_date', label: 'Fin', type: 'date' },
      { k: 'utm_campaign', label: 'utm_campaign', hint: 'los leads del sitio con este UTM se asignan solos' }, { k: 'notes', label: 'Notas', type: 'long' }],
    spend: [
      { k: 'campaign_id', label: 'Campaña', ref: 'campaigns', required: true }, { k: 'date', label: 'Fecha', type: 'date', required: true },
      { k: 'amount', label: 'Gasto real (COP)', type: 'money', required: true }, { k: 'leads', label: 'Leads', type: 'int' },
      { k: 'clicks', label: 'Clics', type: 'int' }, { k: 'impressions', label: 'Impresiones', type: 'int' }, { k: 'note', label: 'Nota', full: true }],
    tasks: [
      { k: 'title', label: 'Tarea', required: true, full: true }, { k: 'due_date', label: 'Para', type: 'date' }, { k: 'assignee', label: 'Responsable' },
      { k: 'contact_id', label: 'Cliente o lead', ref: 'contacts' }, { k: 'deal_id', label: 'Oportunidad', ref: 'deals' }, { k: 'done', label: 'Estado', type: 'bool', check: 'Hecha' },
      { k: 'notes', label: 'Notas', type: 'long' }],
    tools: [
      { k: 'name', label: 'Herramienta', required: true, placeholder: 'Meta Business, Google Ads, Chatwoot…' }, { k: 'category', label: 'Tipo', type: 'select', options: Object.entries(TOOL_CAT) },
      { k: 'vendor', label: 'Proveedor' }, { k: 'plan', label: 'Plan' }, { k: 'cost', label: 'Costo (COP)', type: 'money' },
      { k: 'cycle', label: 'Ciclo', type: 'select', options: [['mensual', 'Mensual'], ['anual', 'Anual'], ['por uso', 'Por uso']] },
      { k: 'renews_on', label: 'Renueva', type: 'date' }, { k: 'status', label: 'Estado', type: 'select', options: [['activa', 'Activa'], ['prueba', 'En prueba'], ['cancelada', 'Cancelada']] },
      { k: 'account_email', label: 'Cuenta (correo)', type: 'email' }, { k: 'url', label: 'Enlace', type: 'url' },
      { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers' }, { k: 'notes', label: 'Notas', type: 'long' }],
  };

  async function render() {
    // Contenedor nuevo en cada sección: así no se acumulan los escuchadores de clics de las anteriores.
    const old = $('#mkView'), el = old.cloneNode(false);
    old.replaceWith(el);
    EMBEDDED.forEach((id) => A.unmount(id));
    el.innerHTML = '';
    if (DIWILO_ONLY.has(view) && org !== 'diwilo') { view = 'resumen'; return pick(); }
    if (EMBED[view]) { try { await A.mount(EMBED[view], el); } catch (x) { if (x.message !== 'sesión') el.innerHTML = `<p class="err">${esc(x.message)}</p>`; } return; }
    if (view === 'resumen') return summary(el);
    if (view === 'contactos') {
      const t = H.table({ el, org: () => org, entity: 'contacts', title: 'contacto', newText: 'Nuevo contacto', refs: ['campaigns'], fields: F.contacts,
        filters: [{ k: 'stage', options: opts(STAGE_C, 'Todas las etapas') }, ...(org === 'diwilo' ? [{ k: 'origin', options: [['', 'Todos los orígenes'], ['form', 'Formulario del sitio'], ['manual', 'Agregados a mano']] }] : [])],
        extraButtons: '<button class="btn" data-csv><i class="ph-light ph-download-simple"></i>Exportar CSV</button>',
        empty: org === 'diwilo' ? 'Aún no hay clientes ni leads. Los del formulario del sitio llegan solos.' : 'Aún no hay clientes ni leads de este negocio.',
        columns: [
          { label: 'Nombre', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b>${r.company ? `<br><span class="muted" style="font-size:12px">${esc(r.company)}</span>` : ''}` },
          { label: 'Contacto', html: (r) => [r.email && `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`, r.phone && `<a href="https://wa.me/${esc(r.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(r.phone)}</a>`].filter(Boolean).join('<br>') || '<span class="muted">—</span>' },
          { label: 'Etapa', html: (r) => chip(r.stage === 'cliente' ? 'ok' : r.stage === 'perdido' ? 'free' : 'soon', STAGE_C[r.stage] || r.stage)
            + (r.lead_status ? `<br><span class="muted" style="font-size:12px">Formulario: ${esc(LEAD_ST[r.lead_status]?.[1] || r.lead_status)}</span>` : '') },
          { label: 'Mensaje', html: (r) => (r.notes ? `<span class="muted clamp2" title="${esc(r.notes)}">${esc(r.notes)}</span>` : '<span class="muted">—</span>') },
          { label: 'Origen', html: (r, R) => `${esc(r.source || '—')}${r.campaign_id ? `<br><span class="muted" style="font-size:12px">${refName(R, 'campaigns', r.campaign_id)}</span>` : ''}` },
          { label: 'Último contacto', html: (r) => (r.last_contact_at ? day(r.last_contact_at) : '<span class="muted">—</span>') },
          { label: 'Llegó', cls: 'muted', html: (r) => fmtDate(r.created_at) }],
        rowActions: () => `<button class="btn sm" data-act="contacted" title="Marcar contacto de hoy"><i class="ph-light ph-phone-call"></i></button> <button class="btn sm" data-act="plan" title="Crear sus tareas con una plantilla"><i class="ph-light ph-list-checks"></i></button> <button class="btn sm" data-act="deal" title="Crear oportunidad"><i class="ph-light ph-funnel"></i></button>`,
        onAction: async (a, r) => {
          if (a === 'contacted') { await api(`${P()}/contacts/${r.id}`, { method: 'PATCH', body: { last_contact_at: H.todayCo() } }); toast('Contacto registrado'); A.refreshLeadBadge?.(); t.load(); }
          if (a === 'plan') usePlaybook({ contact: r });
          if (a === 'deal') {
            const out = await H.form({ title: 'Nueva oportunidad', fields: F.deals, values: { title: `Oportunidad: ${r.name}`, contact_id: r.id, campaign_id: r.campaign_id, stage: 'nuevo' }, org });
            if (out) { await api(`${P()}/deals`, { method: 'POST', body: out }); H.dropRefs(org, 'deals'); toast('Oportunidad creada'); }
          }
        }, onChanged: () => A.refreshLeadBadge?.() });
      t.load();
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-csv]')) return;
        const cols = [['Nombre', 'name'], ['Empresa', 'company'], ['Correo', 'email'], ['Teléfono', 'phone'], ['Etapa', 'stage'], ['Estado formulario', 'lead_status'], ['Origen', 'source'], ['Responsable', 'owner'], ['Último contacto', 'last_contact_at'], ['Notas', 'notes']];
        const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csv = [cols.map((c) => c[0]).join(';'), ...t.rows().map((r) => [...cols.map(([, k]) => q(r[k])), q(new Date(r.created_at).toISOString())].join(';'))].join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `clientes-y-leads-${org.replace(/[^a-z0-9]+/gi, '-')}.csv`; a.click();
      });
      return;
    }
    if (view === 'oportunidades') return pipeline(el);
    if (view === 'campanas') return campaigns(el);
    if (view === 'tareas') {
      el.innerHTML = '<div data-tasks></div><h2 style="margin:26px 0 6px">Automatizaciones</h2><div class="card hubnote" data-anote></div><div data-autos></div>';
      const tasks = H.table({ el: $('[data-tasks]', el), org: () => org, entity: 'tasks', title: 'tarea', newText: 'Nueva tarea', refs: ['contacts', 'deals'], fields: F.tasks,
        filters: [{ k: 'done', options: [['0', 'Pendientes'], ['1', 'Hechas'], ['', 'Todas']] }], defaults: () => ({ due_date: H.todayCo() }),
        extraButtons: '<button class="btn" data-playbook><i class="ph-light ph-list-checks"></i>Usar plantilla</button>',
        empty: 'Sin tareas pendientes. Crea una, usa una plantilla o deja que las automatizaciones las creen.',
        columns: [
          { label: '', html: (r) => `<input type="checkbox" data-act="toggle" ${r.done ? 'checked' : ''} aria-label="Hecha">` },
          { label: 'Tarea', html: (r) => `<span style="${r.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(r.title)}</span>${r.source && r.source.startsWith('auto') ? ' <span class="tag" title="Creada por una automatización">auto</span>' : r.source === 'plantilla' ? ' <span class="tag">plantilla</span>' : ''}` },
          { label: 'Para', html: (r) => (r.due_date ? (r.due_date < H.todayCo() && !r.done ? chip('bad', day(r.due_date)) : day(r.due_date)) : '—') },
          { label: 'Relacionado', html: (r, R) => [r.contact_id && refName(R, 'contacts', r.contact_id), r.deal_id && refName(R, 'deals', r.deal_id, 'title')].filter(Boolean).join('<br>') || '<span class="muted">—</span>' },
          { label: 'Responsable', html: (r) => esc(r.assignee || '—') }],
        onAction: async (a, r, el2) => { if (a === 'toggle') { await api(`${P()}/tasks/${r.id}`, { method: 'PATCH', body: { done: el2.checked } }); r.done = el2.checked ? 1 : 0; toast(el2.checked ? 'Tarea hecha' : 'Tarea pendiente'); } } });
      tasks.load();
      $('[data-tasks]', el).addEventListener('click', (e) => { if (e.target.closest('[data-playbook]')) usePlaybook({ onDone: () => tasks.load() }); });
      $('[data-anote]', el).innerHTML = `Cada automatización crea <b>una o varias tareas</b> (sus pasos, a N días) o una oportunidad. «Llega un lead nuevo» corre al instante; las demás se revisan cada día a las 3:00 a. m. y no repiten tareas abiertas.
        <div class="row" style="margin-top:10px;flex-wrap:wrap">${[['lead', 'Plan para cada lead nuevo'], ['followup', 'Seguimiento a 3 días sin contacto'], ['budget', 'Aviso al 80% del presupuesto'], ['cobro', 'Cobro de facturas vencidas'], ['weekly', 'Informe semanal con IA']].map(([k, l]) => `<button class="btn sm" data-preset="${k}">+ ${l}</button>`).join('')}</div>`;
      const autos = H.table({ el: $('[data-autos]', el), org: () => org, entity: 'automations', title: 'automatización', newText: 'Nueva automatización', fields: [],
        onEdit: (row, done) => editAutomation(row, done),
        empty: 'Sin automatizaciones. Usa los atajos de arriba para crear las más comunes.',
        columns: [
          { label: 'Automatización', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b>` },
          { label: 'Cuando', html: (r) => esc(TRIGGER[r.trigger] || r.trigger).replace('N', r.days ?? 'N').replace('X%', `${r.percent ?? 'X'}%`) },
          { label: 'Entonces', html: (r) => (r.action === 'crear_tarea' ? `${esc(ACTION[r.action])}<br><span class="muted" style="font-size:12px">${stepsOf(r).map((x) => `${esc(x.t)}${x.d ? ` (día ${x.d})` : ''}`).join(' → ') || '—'}</span>` : esc(ACTION[r.action] || r.action)) },
          { label: 'Estado', html: (r) => (r.active ? chip('ok', 'Activa') : chip('free', 'Pausada')) },
          { label: 'Ejecuciones', cls: 'num', html: (r) => `${num(r.runs)}${r.last_run_at ? `<br><span class="muted" style="font-size:12px">${fmtDate(r.last_run_at)}</span>` : ''}` }] });
      autos.load();
      const steps = (k) => JSON.stringify(PLAYBOOKS[k][1].map(([t, d]) => ({ t, d })));
      const PRESETS = {
        lead: { name: 'Plan para cada lead nuevo', trigger: 'lead_nuevo', action: 'crear_tarea', task_title: steps('lead'), active: true },
        followup: { name: 'Seguimiento a leads sin contacto', trigger: 'sin_contacto', action: 'crear_tarea', days: 3, task_title: steps('seguimiento'), active: true },
        budget: { name: 'Aviso de presupuesto', trigger: 'presupuesto_campana', action: 'crear_tarea', percent: 80, task_title: steps('presupuesto'), active: true },
        cobro: { name: 'Cobro de facturas vencidas', trigger: 'factura_vencida', action: 'crear_tarea', task_title: steps('cobro'), active: true },
        weekly: { name: 'Informe semanal de marketing', trigger: 'semanal', action: 'informe_ia', active: true },
      };
      $('[data-anote]', el).addEventListener('click', async (e) => { const b = e.target.closest('[data-preset]'); if (!b) return; await api(`${P()}/automations`, { method: 'POST', body: PRESETS[b.dataset.preset] }); toast('Automatización creada'); autos.load(); });
      return;
    }
    if (view === 'herramientas') {
      return H.table({ el, org: () => org, entity: 'tools', title: 'herramienta', newText: 'Nueva herramienta', refs: ['cost_centers'], fields: F.tools,
        filters: [{ k: 'category', options: opts(TOOL_CAT, 'Todos los tipos') }],
        empty: 'Registra aquí las suscripciones y cuentas externas de esta organización (Meta Business, Google Ads, CRM, hosting, APIs, IA…).',
        columns: [
          { label: 'Herramienta', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b>${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener" data-stop><i class="ph-light ph-arrow-square-out"></i></a>` : ''}<br><span class="muted" style="font-size:12px">${esc([r.vendor, r.plan].filter(Boolean).join(' · ') || '')}</span>` },
          { label: 'Tipo', html: (r) => `<span class="tag">${esc(TOOL_CAT[r.category] || r.category)}</span>` },
          { label: 'Costo', cls: 'num', html: (r) => `${money(r.cost)}<br><span class="muted" style="font-size:12px">${esc(r.cycle)}</span>` },
          { label: 'Renueva', html: (r) => day(r.renews_on) },
          { label: 'Cuenta', html: (r) => esc(r.account_email || '—') },
          { label: 'Estado', html: (r) => chip(r.status === 'activa' ? 'ok' : r.status === 'prueba' ? 'soon' : 'free', r.status) },
          { label: 'Centro de costo', html: (r, R) => refName(R, 'cost_centers', r.cost_center_id) }] }).load();
    }
    if (view === 'informes') return reports(el);
  }

  // Crea de una vez todas las tareas de una plantilla (para un cliente o una campaña).
  async function usePlaybook({ contact, onDone } = {}) {
    const [contacts, camps] = await Promise.all([H.refs(org, 'contacts'), H.refs(org, 'campaigns')]);
    const d = document.createElement('dialog');
    d.className = 'ask hubdlg';
    d.innerHTML = `<form method="dialog"><h2>Usar una plantilla de tareas</h2>
      <div class="form hubform">
        <label class="f full">Plantilla<select class="in" name="pb">${Object.entries(PLAYBOOKS).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <label class="f">Cliente o lead<select class="in" name="contact"><option value="">—</option>${contacts.map((c) => `<option value="${c.id}" ${contact?.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="f">Campaña<select class="in" name="camp"><option value="">—</option>${camps.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="f">Empieza<input class="in" type="date" name="start" value="${H.todayCo()}"></label>
        <label class="f">Responsable<input class="in" name="assignee"></label>
        <div class="full pbprev" data-prev></div></div>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" type="button" data-no>Cancelar</button><button class="btn pri" data-yes>Crear tareas</button></div></form>`;
    document.body.appendChild(d);
    const f = $('form', d);
    const vars = () => ({ nombre: contacts.find((c) => String(c.id) === f.contact.value)?.name || '{nombre}', campana: camps.find((c) => String(c.id) === f.camp.value)?.name || '{campana}' });
    const fill = (tpl) => tpl.replace(/\{(\w+)\}/g, (m, k) => vars()[k] ?? m);
    const add = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    const prev = () => { $('[data-prev]', d).innerHTML = `<ol class="pbsteps">${PLAYBOOKS[f.pb.value][1].map(([t, n]) => `<li><span>${esc(fill(t))}</span><span class="muted">${day(add(f.start.value || H.todayCo(), n))}</span></li>`).join('')}</ol>`; };
    if (contact) f.pb.value = contact.stage === 'cliente' ? 'onboarding' : 'lead';
    prev(); f.addEventListener('input', prev);
    const close = () => { d.close(); d.remove(); };
    $('[data-no]', d).onclick = close; d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const list = PLAYBOOKS[f.pb.value][1];
      try {
        for (const [t, n] of list) await api(`${P()}/tasks`, { method: 'POST', body: { title: fill(t), due_date: add(f.start.value || H.todayCo(), n), contact_id: f.contact.value || null, assignee: f.assignee.value, source: 'plantilla' } });
        close(); toast(`${list.length} tareas creadas`); onDone?.();
      } catch (x) { toast(x.message); }
    };
    d.showModal();
  }

  // Editor de una automatización: disparador, acción y sus pasos (varias tareas a N días).
  async function editAutomation(row, done) {
    const a = row || { trigger: 'lead_nuevo', action: 'crear_tarea', active: 1, task_title: JSON.stringify(PLAYBOOKS.lead[1].map(([t, d]) => ({ t, d }))) };
    let steps = stepsOf(a);
    const d = document.createElement('dialog');
    d.className = 'ask hubdlg';
    d.innerHTML = `<form method="dialog"><h2>${row ? 'Editar automatización' : 'Nueva automatización'}</h2>
      <div class="form hubform">
        <label class="f full">Nombre<input class="in" name="name" value="${esc(a.name || '')}" required></label>
        <label class="f">Cuando…<select class="in" name="trigger">${Object.entries(TRIGGER).map(([k, l]) => `<option value="${k}" ${a.trigger === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="f" data-days>N (días sin contacto)<input class="in" type="number" min="1" name="days" value="${esc(a.days ?? 3)}"></label>
        <label class="f" data-pct>X (% del presupuesto)<input class="in" type="number" min="1" max="200" name="percent" value="${esc(a.percent ?? 80)}"></label>
        <label class="f">Entonces…<select class="in" name="action">${Object.entries(ACTION).map(([k, l]) => `<option value="${k}" ${a.action === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="f"><span>Estado</span><label class="row" style="gap:8px;font-size:13px"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}> Activa</label></label>
        <div class="full" data-stepsbox>
          <div class="row" style="justify-content:space-between;margin-bottom:6px"><b style="font-size:13px;color:var(--hi);font-weight:500" data-stitle>Tareas que crea</b>
            <select class="in" data-pb style="width:auto;font-size:12px"><option value="">Cargar una plantilla…</option>${Object.entries(PLAYBOOKS).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
          <div data-steps></div>
          <button class="btn sm" type="button" data-addstep><i class="ph-light ph-plus"></i>Agregar tarea</button>
          <p class="muted" style="font-size:11px;margin:6px 0 0">Usa {nombre}, {campana}, {porcentaje}, {factura} o {tercero}. «Día» es cuántos días después de dispararse vence la tarea.</p></div></div>
      <p class="err" data-err></p>
      <div class="row" style="justify-content:space-between;margin-top:12px"><span>${row ? '<button class="btn sm danger" type="button" data-del><i class="ph-light ph-trash"></i>Borrar</button>' : ''}</span>
        <span class="row"><button class="btn" type="button" data-no>Cancelar</button><button class="btn pri" data-yes>Guardar</button></span></div></form>`;
    document.body.appendChild(d);
    const f = $('form', d);
    const drawSteps = () => {
      $('[data-steps]', d).innerHTML = steps.map((st, i) => `<div class="steprow" data-i="${i}"><span class="muted">${i + 1}.</span><input class="in" data-t value="${esc(st.t)}" placeholder="Título de la tarea"><label class="muted">día<input class="in" type="number" min="0" max="365" data-d value="${esc(st.d)}"></label><button class="btn sm" type="button" data-rm title="Quitar"><i class="ph-light ph-x"></i></button></div>`).join('') || '<p class="muted" style="margin:0 0 8px;font-size:12px">Sin tareas.</p>';
    };
    const sync = () => { steps = [...$$('.steprow', d)].map((r) => ({ t: $('[data-t]', r).value.trim(), d: Number($('[data-d]', r).value) || 0 })); };
    const show = () => {
      $('[data-days]', d).hidden = f.trigger.value !== 'sin_contacto';
      $('[data-pct]', d).hidden = f.trigger.value !== 'presupuesto_campana';
      $('[data-stepsbox]', d).hidden = f.action.value === 'informe_ia';
      $('[data-stitle]', d).textContent = f.action.value === 'crear_oportunidad' ? 'Título de la oportunidad (el primero)' : 'Tareas que crea';
    };
    drawSteps(); show();
    f.addEventListener('change', (e) => {
      if (e.target.matches('[data-pb]') && e.target.value) { steps = PLAYBOOKS[e.target.value][1].map(([t, n]) => ({ t, d: n })); if (!f.name.value) f.name.value = PLAYBOOKS[e.target.value][0]; e.target.value = ''; drawSteps(); }
      show();
    });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-addstep]')) { sync(); steps.push({ t: '', d: steps.length ? steps[steps.length - 1].d + 1 : 0 }); drawSteps(); $$('[data-t]', d).pop()?.focus(); }
      if (e.target.closest('[data-rm]')) { sync(); steps.splice(Number(e.target.closest('.steprow').dataset.i), 1); drawSteps(); }
    });
    const close = () => { d.close(); d.remove(); };
    $('[data-no]', d).onclick = close; d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    $('[data-del]', d)?.addEventListener('click', async () => { if (await A.sure('¿Borrar esta automatización? Las tareas que ya creó se quedan.', 'Borrar')) { await api(`${P()}/automations/${row.id}`, { method: 'DELETE' }); close(); toast('Borrada'); done(); } });
    f.onsubmit = async (e) => {
      e.preventDefault(); sync();
      const list = steps.filter((x) => x.t);
      if (f.action.value !== 'informe_ia' && !list.length) { $('[data-err]', d).textContent = 'Agrega al menos una tarea.'; return; }
      const body = { name: f.name.value.trim(), trigger: f.trigger.value, action: f.action.value, days: f.days.value, percent: f.percent.value, active: f.active.checked, task_title: list.length ? JSON.stringify(list) : '' };
      try { await api(row ? `${P()}/automations/${row.id}` : `${P()}/automations`, { method: row ? 'PATCH' : 'POST', body }); close(); toast('Automatización guardada'); done(); }
      catch (x) { $('[data-err]', d).textContent = x.message; }
    };
    d.showModal();
  }

  async function summary(el) {
    el.innerHTML = `<div class="row hubbar"><label class="f" style="margin:0">Desde<input class="in" type="date" data-from></label><label class="f" style="margin:0">Hasta<input class="in" type="date" data-to></label><span class="grow"></span><button class="btn" data-report><i class="ph-light ph-robot"></i>Pedir informe al agente</button></div>
      <div class="grid" style="--min:160px;margin-bottom:14px" data-kpis></div>
      <div class="grid" style="--min:420px;margin-bottom:14px">
        <div class="card"><h2>Embudo de oportunidades</h2><div data-funnel></div></div>
        <div class="card"><h2>Gasto vs leads por canal</h2><div data-ch></div></div></div>
      <div class="card tbl-wrap" style="margin-bottom:14px"><h2 style="margin-bottom:10px">Campañas: presupuesto, gasto real, costo por lead y retorno</h2><div data-camps></div></div>
      <div class="grid" style="--min:300px"><div class="card"><h2>De dónde llegan (periodo)</h2><div class="rank" data-src></div></div><div class="card"><h2>Clientes y leads</h2><div class="rank" data-stage></div></div></div>`;
    const from = $('[data-from]', el), to = $('[data-to]', el);
    async function load() {
      const qs = new URLSearchParams(); if (from.value) qs.set('from', from.value); if (to.value) qs.set('to', to.value);
      let s; try { s = await api(`${P()}/marketing/summary?${qs}`); } catch (x) { $('[data-kpis]', el).innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
      from.value = s.from; to.value = s.to;
      const open = s.deals.pipeline.reduce((a, p) => a + p.value, 0);
      H.kpis($('[data-kpis]', el), [
        ['Leads nuevos', num(s.contacts.new), s.site ? `${num(s.site.leads)} del formulario del sitio` : ''],
        ['Leads abiertos', num(s.contacts.by_stage.lead || 0)], ['Clientes', num(s.contacts.by_stage.cliente || 0)],
        ['Oportunidades abiertas', money(open), `${num(s.deals.pipeline.reduce((a, p) => a + p.n, 0))} en curso`],
        ['Ganado en el periodo', money(s.deals.won_value), `${num(s.deals.won)} cerradas · ${pct(s.deals.win_rate)} de éxito`],
        ['Gasto del periodo', money(s.totals.spend_period), `Presupuesto total ${money(s.totals.budget)}`],
        ['Costo por lead', money(s.totals.cpl)], ['Retorno (ROI)', pct(s.totals.roi), `Ingresos atribuidos ${money(s.totals.revenue)}`],
        ['Tareas', num(s.tasks.open), s.tasks.overdue ? `<span style="color:var(--bad)">${num(s.tasks.overdue)} vencidas</span>` : 'al día'],
        ['Herramientas', money(s.tools.monthly), `${num(s.tools.active)} activas · al mes`]]);
      const maxF = Math.max(1, ...s.deals.pipeline.map((p) => p.n));
      $('[data-funnel]', el).innerHTML = s.deals.pipeline.map((p) => `<div class="funnel"><span>${STAGE_D[p.stage]}</span><div class="ftrack"><i style="width:${(p.n / maxF * 100).toFixed(1)}%"></i></div><b>${num(p.n)}</b><span class="muted">${money(p.value)}</span></div>`).join('')
        + `<p class="muted" style="font-size:12px;margin:8px 0 0">Ganadas ${num(s.deals.won)} · perdidas ${num(s.deals.lost)} en el periodo</p>`;
      H.bars($('[data-ch]', el), s.channels.map((c) => ({ label: CHANNEL[c.channel] || c.channel, a: c.spend, b: c.leads })), { la: 'Gasto', lb: 'Leads', fmt: (n) => num(n) });
      $('[data-camps]', el).innerHTML = s.campaigns.length ? `<table><thead><tr><th>Campaña</th><th>Canal</th><th>Estado</th><th class="num">Presupuesto</th><th>Uso</th><th class="num">Gasto</th><th class="num">Leads</th><th class="num">Costo/lead</th><th class="num">Ingresos</th><th class="num">ROI</th></tr></thead><tbody>
        ${s.campaigns.map((c) => `<tr><td><b style="font-weight:500;color:var(--hi)">${esc(c.name)}</b></td><td>${esc(CHANNEL[c.channel] || c.channel)}</td><td>${chip(c.status === 'activa' ? 'ok' : 'free', c.status)}</td>
          <td class="num">${money(c.budget)}</td><td style="min-width:120px">${H.meter(c.spend, c.budget)}</td><td class="num">${money(c.spend)}</td><td class="num">${num(c.leads)}${c.goal_leads ? `<span class="muted"> / ${num(c.goal_leads)}</span>` : ''}</td>
          <td class="num">${money(c.cpl)}</td><td class="num">${money(c.revenue)}</td><td class="num" style="color:${c.roi == null ? 'inherit' : c.roi >= 0 ? 'var(--good)' : 'var(--bad)'}">${pct(c.roi)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">Sin campañas. Créalas en «Campañas» y registra su gasto real para ver costo por lead y retorno.</p>';
      rank($('[data-src]', el), s.contacts.by_source.map((r) => ({ k: r.k, n: r.n })), esc);
      rank($('[data-stage]', el), Object.entries(s.contacts.by_stage).map(([k, n]) => ({ k: STAGE_C[k] || k, n })), esc);
    }
    from.onchange = to.onchange = load;
    $('[data-report]', el).onclick = async (e) => { e.target.disabled = true; toast('El agente está escribiendo el informe…'); try { await api(`${P()}/reports`, { method: 'POST', body: { kind: 'marketing' } }); view = 'informes'; pick(); } catch (x) { toast(x.message); } e.target.disabled = false; };
    load();
  }

  async function pipeline(el) {
    el.innerHTML = `<div class="row hubbar"><span class="muted">Arrastra cada oportunidad a su etapa. Haz clic para editarla.</span><span class="grow"></span><button class="btn pri" data-new><i class="ph-light ph-plus"></i>Nueva oportunidad</button></div><div class="kanban" data-k></div>`;
    async function load() {
      const [{ rows }, contacts] = await Promise.all([api(`${P()}/deals?limit=1000`), H.refs(org, 'contacts')]);
      const cname = (id) => contacts.find((c) => c.id === id)?.name;
      $('[data-k]', el).innerHTML = Object.entries(STAGE_D).map(([k, l]) => {
        const list = rows.filter((r) => r.stage === k);
        return `<div class="kcol" data-stage="${k}"><div class="khead"><b>${l}</b><span class="muted">${num(list.length)} · ${money(list.reduce((a, r) => a + r.value, 0))}</span></div>
          ${list.map((r) => `<div class="kcard" draggable="true" data-id="${r.id}"><b>${esc(r.title)}</b><span>${money(r.value)}</span>${cname(r.contact_id) ? `<span class="muted">${esc(cname(r.contact_id))}</span>` : ''}${r.expected_close ? `<span class="muted"><i class="ph-light ph-calendar-blank"></i> ${day(r.expected_close)}</span>` : ''}</div>`).join('')}</div>`;
      }).join('');
      el._rows = rows;
    }
    const edit = async (row) => {
      const out = await H.form({ title: row ? 'Editar oportunidad' : 'Nueva oportunidad', fields: F.deals, values: row || { stage: 'nuevo' }, org,
        onDelete: row ? () => api(`${P()}/deals/${row.id}`, { method: 'DELETE' }) : null });
      if (out === 'deleted') { toast('Borrada'); H.dropRefs(org, 'deals'); return load(); }
      if (!out) return;
      await api(row ? `${P()}/deals/${row.id}` : `${P()}/deals`, { method: row ? 'PATCH' : 'POST', body: out });
      H.dropRefs(org, 'deals'); toast('Guardado'); load();
    };
    $('[data-new]', el).onclick = () => edit(null);
    el.addEventListener('click', (e) => { const c = e.target.closest('.kcard'); if (c) edit(el._rows.find((r) => String(r.id) === c.dataset.id)); });
    el.addEventListener('dragstart', (e) => { const c = e.target.closest('.kcard'); if (c) e.dataTransfer.setData('text/plain', c.dataset.id); });
    el.addEventListener('dragover', (e) => { if (e.target.closest('.kcol')) e.preventDefault(); });
    el.addEventListener('drop', async (e) => {
      const col = e.target.closest('.kcol'); if (!col) return;
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      await api(`${P()}/deals/${id}`, { method: 'PATCH', body: { stage: col.dataset.stage } });
      toast(`Movida a ${STAGE_D[col.dataset.stage]}`); load();
    });
    load();
  }

  // Plataformas para los links de rastreo de cada campaña (los UTM los pone el servidor).
  const PLAT = [['instagram', 'Instagram', 'ph-instagram-logo'], ['facebook', 'Facebook', 'ph-facebook-logo'], ['tiktok', 'TikTok', 'ph-tiktok-logo'],
    ['whatsapp', 'WhatsApp', 'ph-whatsapp-logo'], ['google', 'Google Ads', 'ph-google-logo'], ['youtube', 'YouTube', 'ph-youtube-logo'],
    ['linkedin', 'LinkedIn', 'ph-linkedin-logo'], ['correo', 'Correo', 'ph-envelope-simple'], ['qr', 'QR impreso', 'ph-qr-code'], ['otro', 'Otro', 'ph-link-simple']];
  const SRC = { instagram: PLAT[0], facebook: PLAT[1], tiktok: PLAT[2], whatsapp: PLAT[3], google: PLAT[4], youtube: PLAT[5], linkedin: PLAT[6], email: PLAT[7], qr: PLAT[8] };
  function qrDownload(url, name) {
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    const cv = document.createElement('canvas'), n = q.getModuleCount(), cell = 16, pad = 32; cv.width = cv.height = n * cell + pad * 2;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(pad + c * cell, pad + r * cell, cell, cell);
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `qr-${name}.png`; a.click();
  }

  async function campaigns(el) {
    el.innerHTML = `<div data-c></div><div data-lp style="margin-top:14px"></div><h2 style="margin:22px 0 10px">Gasto real registrado</h2><div data-s></div>
      ${org === 'diwilo' ? '<h2 style="margin:26px 0 10px">Todos los links de rastreo</h2><div data-all></div>' : ''}`;
    let stats = {}, allLinks = null;
    const loadStats = async () => { try { const s = await api(`${P()}/marketing/summary`); stats = Object.fromEntries(s.campaigns.map((c) => [c.id, c])); } catch { stats = {}; } };
    const spend = H.table({ el: $('[data-s]', el), org: () => org, entity: 'spend', title: 'gasto', newText: 'Registrar gasto', refs: ['campaigns'], fields: F.spend,
      defaults: () => ({ date: H.todayCo() }), empty: 'Registra el gasto real de cada campaña (por día o por semana). Luego llegará solo desde Meta y Google Ads.',
      columns: [{ label: 'Fecha', html: (r) => day(r.date) }, { label: 'Campaña', html: (r, R) => refName(R, 'campaigns', r.campaign_id) },
        { label: 'Gasto', cls: 'num', html: (r) => money(r.amount) }, { label: 'Leads', cls: 'num', html: (r) => num(r.leads) },
        { label: 'Clics', cls: 'num', html: (r) => num(r.clicks) }, { label: 'Nota', html: (r) => esc(r.note || '') }] });
    const camps = H.table({ el: $('[data-c]', el), org: () => org, entity: 'campaigns', title: 'campaña', newText: 'Nueva campaña', fields: F.campaigns,
      filters: [{ k: 'channel', options: opts(CHANNEL, 'Todos los canales') }], defaults: () => ({ start_date: H.todayCo() }),
      empty: 'Sin campañas todavía. Crea una y genera sus links por plataforma (Instagram, Facebook, TikTok…).',
      onChanged: async () => { await loadStats(); camps.load(); spend.load(); },
      columns: [
        { label: 'Campaña', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b>${r.utm_campaign ? `<br><span class="muted mono">utm: ${esc(r.utm_campaign)}</span>` : ''}` },
        { label: 'Canal', html: (r) => esc(CHANNEL[r.channel] || r.channel) },
        { label: 'Estado', html: (r) => chip(r.status === 'activa' ? 'ok' : r.status === 'pausada' ? 'soon' : 'free', r.status) },
        { label: 'Presupuesto', cls: 'num', html: (r) => money(r.budget) },
        { label: 'Links · clics', cls: 'num', html: (r) => (stats[r.id] ? `${num(stats[r.id].links)} · <b style="color:var(--hi);font-weight:500">${num(stats[r.id].clicks)}</b>` : '—') },
        { label: 'Leads', cls: 'num', html: (r) => num(stats[r.id]?.leads || 0) },
        { label: 'Fechas', html: (r) => `${day(r.start_date)}${r.end_date ? ` → ${day(r.end_date)}` : ''}` }],
      rowActions: () => '<button class="btn sm pri" data-act="links"><i class="ph-light ph-link-simple"></i>Links</button> <button class="btn sm" data-act="spend"><i class="ph-light ph-currency-circle-dollar"></i>Gasto</button>',
      onAction: async (a, r) => {
        if (a === 'links') return showLinks(r.id);
        if (a !== 'spend') return;
        const out = await H.form({ title: `Gasto de ${r.name}`, fields: F.spend, values: { campaign_id: r.id, date: H.todayCo() }, org });
        if (out) { await api(`${P()}/spend`, { method: 'POST', body: out }); toast('Gasto registrado'); spend.load(); }
      } });

    // Panel de links de una campaña: un link por plataforma, con sus clics y su QR.
    async function showLinks(id) {
      const box = $('[data-lp]', el);
      let d; try { d = await api(`${P()}/campaigns/${id}/links`); } catch (x) { toast(x.message); return; }
      const base = location.origin;
      box.innerHTML = `<div class="card camplinks"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h2><i class="ph-light ph-link-simple"></i> Links de rastreo · ${esc(d.campaign.name)}</h2><button class="btn sm" data-close>Cerrar</button></div>
        <p class="muted" style="margin:0 0 12px;font-size:12px">Cada plataforma tiene su link corto con los UTM puestos (utm_campaign <span class="mono">${esc(d.campaign.utm_campaign)}</span>). Cada clic se cuenta aquí y los leads que lleguen por él quedan en esta campaña.</p>
        <div class="platbtns">${PLAT.map(([k, l, ic]) => `<button class="btn sm" data-plat="${k}"><i class="ph-light ${ic}"></i>${esc(l)}</button>`).join('')}</div>
        ${d.links.length ? `<div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Plataforma</th><th>Link corto</th><th>Lleva a</th><th class="num">Clics</th><th></th></tr></thead><tbody>${d.links.map((l) => {
          const [, label, ic] = SRC[l.utm_source] || ['', l.utm_source || 'Otro', 'ph-link-simple'];
          const short = `${base}/l/${l.slug}`;
          return `<tr data-link="${l.id}" data-short="${esc(short)}" data-slug="${esc(l.slug)}"><td><i class="ph-light ${ic}"></i> ${esc(label)}</td>
            <td><button class="btn sm" data-copy><i class="ph-light ph-copy"></i>/l/${esc(l.slug)}</button></td>
            <td class="muted" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.target)}">${esc(l.target)}</td>
            <td class="num"><b style="color:var(--hi);font-weight:500">${num(l.clicks)}</b></td>
            <td style="white-space:nowrap"><button class="btn sm" data-qr title="Descargar QR"><i class="ph-light ph-qr-code"></i></button> <button class="btn sm danger" data-del title="Borrar"><i class="ph-light ph-trash"></i></button></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted" style="margin:12px 0 0">Aún no hay links: elige una plataforma arriba.</p>'}</div>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      box.onclick = async (e) => {
        if (e.target.closest('[data-close]')) { box.innerHTML = ''; return; }
        const pl = e.target.closest('[data-plat]');
        if (pl) {
          const label = PLAT.find((p) => p[0] === pl.dataset.plat)[1];
          const last = d.links[d.links.length - 1]?.target || (org === 'diwilo' ? 'https://diwilo.com/' : 'https://');
          const target = await A.ask({ title: `Link para ${label}`, text: '¿A qué página lleva? Los UTM se agregan solos.', input: true, value: last, ok: 'Crear link' });
          if (!target) return;
          try { const r = await api(`${P()}/campaigns/${id}/links`, { method: 'POST', body: { platform: pl.dataset.plat, target } }); await A.copy(`${base}/l/${r.slug}`); toast(`Link creado y copiado: /l/${r.slug}`); await loadStats(); camps.load(); showLinks(id); allLinks?.tab.show?.(); }
          catch (x) { toast(x.message); }
          return;
        }
        const tr = e.target.closest('[data-link]'); if (!tr) return;
        if (e.target.closest('[data-copy]')) return A.copy(tr.dataset.short);
        if (e.target.closest('[data-qr]')) return qrDownload(tr.dataset.short, tr.dataset.slug);
        if (e.target.closest('[data-del]') && await A.sure('¿Borrar este link y sus clics? El QR o el enlace dejarán de funcionar.', 'Borrar')) {
          await api('links?id=' + tr.dataset.link, { method: 'DELETE' }); toast('Link borrado'); await loadStats(); camps.load(); showLinks(id); allLinks?.tab.show?.();
        }
      };
    }
    await loadStats();
    camps.load();
    spend.load();
    if (org === 'diwilo') { try { allLinks = await A.mount('links', $('[data-all]', el)); } catch {} }
  }

  async function reports(el) {
    el.innerHTML = `<div class="row hubbar"><span class="muted">Informes escritos por el agente de IA con los números de esta organización.</span><span class="grow"></span>
      <button class="btn" data-r="finanzas"><i class="ph-light ph-robot"></i>Informe de finanzas</button><button class="btn pri" data-r="marketing"><i class="ph-light ph-robot"></i>Informe de marketing</button></div><div data-list></div>`;
    const md = await import('/assets/js/md.js');
    async function load() {
      const { rows } = await api(`${P()}/reports`);
      $('[data-list]', el).innerHTML = rows.length ? rows.map((r) => `<article class="card report"><div class="row" style="justify-content:space-between"><h2>${esc(r.title)}</h2><span class="row"><span class="muted" style="font-size:12px">${fmtDate(r.created_at)}</span><button class="btn sm danger" data-del="${r.id}"><i class="ph-light ph-trash"></i></button></span></div><div class="prose-admin">${md.renderMarkdown(r.content).html}</div></article>`).join('')
        : '<p class="empty card">Aún no hay informes. Pide uno arriba o crea la automatización «Informe semanal con IA».</p>';
    }
    el.addEventListener('click', async (e) => {
      const g = e.target.closest('[data-r]');
      if (g) { g.disabled = true; toast('El agente está escribiendo…'); try { await api(`${P()}/reports`, { method: 'POST', body: { kind: g.dataset.r } }); load(); } catch (x) { toast(x.message); } g.disabled = false; }
      const d = e.target.closest('[data-del]');
      if (d && await A.sure('¿Borrar este informe?', 'Borrar')) { await api(`${P()}/reports/${d.dataset.del}`, { method: 'DELETE' }); load(); }
    });
    load();
  }

  function pick() { H.seg($('#mkSeg'), VIEWS.filter(([k]) => org === 'diwilo' || !DIWILO_ONLY.has(k)), (k) => { view = k; render(); }, view); render(); }

  async function load() {
    try { org = await H.orgPicker($('#mkOrg'), (id) => { org = id; pick(); }); } catch (x) { $('#mkView').innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
    if (!$('#mkSeg').children.length) pick(); else render();
  }
  return { show: load, hide: () => EMBEDDED.forEach((id) => A.unmount(id)) };
});
