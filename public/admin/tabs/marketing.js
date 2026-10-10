// Panel Diwilo · pestaña «Marketing» (Marketing Hub). Funciona por organización: Diwilo o cada negocio.
Admin.tab('marketing', (A) => {
  const { $, $$, esc, toast, api, fmtDate, rank } = A;
  const H = window.Hub;
  const { money, num, pct, day } = H;
  let org = H.current(), view = 'resumen';
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
    ['campanas', 'Campañas', 'ph-megaphone'], ['tareas', 'Tareas', 'ph-check-square'], ['automatizaciones', 'Automatizaciones y agentes', 'ph-robot'],
    ['herramientas', 'Suscripciones y herramientas', 'ph-plugs'], ['informes', 'Informes', 'ph-file-text']];

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
    automations: [
      { k: 'name', label: 'Nombre', required: true, full: true }, { k: 'trigger', label: 'Cuando…', type: 'select', options: Object.entries(TRIGGER) },
      { k: 'action', label: 'Entonces…', type: 'select', options: Object.entries(ACTION) }, { k: 'days', label: 'Días (N)', type: 'int', hint: 'sin contacto / plazo de la tarea' },
      { k: 'percent', label: 'Porcentaje (X)', type: 'int', hint: 'presupuesto usado' },
      { k: 'task_title', label: 'Título de la tarea u oportunidad', full: true, placeholder: 'Contactar a {nombre}', hint: 'usa {nombre}, {campana}, {porcentaje}, {factura}, {tercero}' },
      { k: 'active', label: 'Estado', type: 'bool', check: 'Activa', default: true }],
    tools: [
      { k: 'name', label: 'Herramienta', required: true, placeholder: 'Meta Business, Google Ads, Chatwoot…' }, { k: 'category', label: 'Tipo', type: 'select', options: Object.entries(TOOL_CAT) },
      { k: 'vendor', label: 'Proveedor' }, { k: 'plan', label: 'Plan' }, { k: 'cost', label: 'Costo (COP)', type: 'money' },
      { k: 'cycle', label: 'Ciclo', type: 'select', options: [['mensual', 'Mensual'], ['anual', 'Anual'], ['por uso', 'Por uso']] },
      { k: 'renews_on', label: 'Renueva', type: 'date' }, { k: 'status', label: 'Estado', type: 'select', options: [['activa', 'Activa'], ['prueba', 'En prueba'], ['cancelada', 'Cancelada']] },
      { k: 'account_email', label: 'Cuenta (correo)', type: 'email' }, { k: 'url', label: 'Enlace', type: 'url' },
      { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers' }, { k: 'notes', label: 'Notas', type: 'long' }],
  };

  async function render() {
    const el = $('#mkView');
    el.innerHTML = '';
    if (view === 'resumen') return summary(el);
    if (view === 'contactos') {
      H.table({ el, org: () => org, entity: 'contacts', title: 'contacto', newText: 'Nuevo contacto', refs: ['campaigns'], fields: F.contacts,
        filters: [{ k: 'stage', options: opts(STAGE_C, 'Todas las etapas') }],
        extraButtons: org === 'diwilo' ? '<button class="btn" data-import><i class="ph-light ph-download-simple"></i>Traer leads del sitio</button>' : '',
        empty: 'Aún no hay clientes ni leads. Los leads del formulario del sitio llegan solos a Diwilo.',
        columns: [
          { label: 'Nombre', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b>${r.company ? `<br><span class="muted" style="font-size:12px">${esc(r.company)}</span>` : ''}` },
          { label: 'Contacto', html: (r) => [r.email && `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`, r.phone && `<a href="https://wa.me/${esc(r.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(r.phone)}</a>`].filter(Boolean).join('<br>') || '<span class="muted">—</span>' },
          { label: 'Etapa', html: (r) => chip(r.stage === 'cliente' ? 'ok' : r.stage === 'perdido' ? 'free' : 'soon', STAGE_C[r.stage] || r.stage) },
          { label: 'Origen', html: (r, R) => `${esc(r.source || '—')}${r.campaign_id ? `<br><span class="muted" style="font-size:12px">${refName(R, 'campaigns', r.campaign_id)}</span>` : ''}` },
          { label: 'Último contacto', html: (r) => (r.last_contact_at ? day(r.last_contact_at) : '<span class="muted">—</span>') },
          { label: 'Creado', cls: 'muted', html: (r) => fmtDate(r.created_at) }],
        rowActions: (r) => `<button class="btn sm" data-act="contacted" title="Marcar contacto de hoy"><i class="ph-light ph-phone-call"></i></button> <button class="btn sm" data-act="deal" title="Crear oportunidad"><i class="ph-light ph-funnel"></i></button>`,
        onAction: async (a, r, btn) => {
          if (a === 'contacted') { await api(`${P()}/contacts/${r.id}`, { method: 'PATCH', body: { last_contact_at: H.todayCo() } }); toast('Contacto registrado'); btn.closest('tr').querySelector('td:nth-child(5)').textContent = day(H.todayCo()); }
          if (a === 'deal') {
            const out = await H.form({ title: 'Nueva oportunidad', fields: F.deals, values: { title: `Oportunidad: ${r.name}`, contact_id: r.id, campaign_id: r.campaign_id, stage: 'nuevo' }, org });
            if (out) { await api(`${P()}/deals`, { method: 'POST', body: out }); H.dropRefs(org, 'deals'); toast('Oportunidad creada'); }
          }
        } }).load();
      $('[data-import]', el)?.addEventListener('click', async (e) => { e.target.disabled = true; try { const r = await api(`${P()}/marketing/import-leads`, { method: 'POST' }); toast(`${r.imported} leads nuevos de ${r.total}`); render(); } catch (x) { toast(x.message); } e.target.disabled = false; });
      return;
    }
    if (view === 'oportunidades') return pipeline(el);
    if (view === 'campanas') return campaigns(el);
    if (view === 'tareas') {
      return H.table({ el, org: () => org, entity: 'tasks', title: 'tarea', newText: 'Nueva tarea', refs: ['contacts', 'deals'], fields: F.tasks,
        filters: [{ k: 'done', options: [['0', 'Pendientes'], ['1', 'Hechas'], ['', 'Todas']] }], defaults: () => ({ due_date: H.todayCo() }),
        empty: 'Sin tareas. Las automatizaciones también crean tareas aquí.',
        columns: [
          { label: '', html: (r) => `<input type="checkbox" data-act="toggle" ${r.done ? 'checked' : ''} aria-label="Hecha">` },
          { label: 'Tarea', html: (r) => `<span style="${r.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(r.title)}</span>${r.source && r.source !== 'manual' ? ' <span class="tag" title="Creada por una automatización">auto</span>' : ''}` },
          { label: 'Para', html: (r) => (r.due_date ? (r.due_date < H.todayCo() && !r.done ? chip('bad', day(r.due_date)) : day(r.due_date)) : '—') },
          { label: 'Relacionado', html: (r, R) => [r.contact_id && refName(R, 'contacts', r.contact_id), r.deal_id && refName(R, 'deals', r.deal_id, 'title')].filter(Boolean).join('<br>') || '<span class="muted">—</span>' },
          { label: 'Responsable', html: (r) => esc(r.assignee || '—') }],
        onAction: async (a, r, el2) => { if (a === 'toggle') { await api(`${P()}/tasks/${r.id}`, { method: 'PATCH', body: { done: el2.checked } }); r.done = el2.checked ? 1 : 0; toast(el2.checked ? 'Tarea hecha' : 'Tarea pendiente'); } } }).load();
    }
    if (view === 'automatizaciones') {
      el.insertAdjacentHTML('beforeend', `<div class="card hubnote"><b>Cómo funcionan.</b> «Llega un lead nuevo» se ejecuta al instante (por ejemplo, con cada lead del formulario del sitio). Las demás se revisan cada día a las 3:00 a. m. y crean tareas sin repetirlas. «Cada lunes + Informe del agente de IA» deja un informe semanal en Informes.
        <div class="row" style="margin-top:10px"><button class="btn sm" data-preset="lead">+ Tarea por cada lead nuevo</button><button class="btn sm" data-preset="followup">+ Seguimiento a 3 días</button><button class="btn sm" data-preset="budget">+ Aviso al 80% del presupuesto</button><button class="btn sm" data-preset="weekly">+ Informe semanal con IA</button></div></div><div data-t></div>`);
      const t = H.table({ el: $('[data-t]', el), org: () => org, entity: 'automations', title: 'automatización', newText: 'Nueva automatización', fields: F.automations,
        empty: 'Sin automatizaciones. Usa los atajos de arriba para crear las más comunes.',
        columns: [
          { label: 'Automatización', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b>` },
          { label: 'Cuando', html: (r) => esc(TRIGGER[r.trigger] || r.trigger).replace('N', r.days ?? 'N').replace('X%', `${r.percent ?? 'X'}%`) },
          { label: 'Entonces', html: (r) => esc(ACTION[r.action] || r.action) },
          { label: 'Estado', html: (r) => (r.active ? chip('ok', 'Activa') : chip('free', 'Pausada')) },
          { label: 'Ejecuciones', cls: 'num', html: (r) => `${num(r.runs)}${r.last_run_at ? `<br><span class="muted" style="font-size:12px">${fmtDate(r.last_run_at)}</span>` : ''}` }] });
      t.load();
      const PRESETS = {
        lead: { name: 'Contactar cada lead nuevo', trigger: 'lead_nuevo', action: 'crear_tarea', days: 0, task_title: 'Contactar a {nombre}', active: true },
        followup: { name: 'Seguimiento a leads sin contacto', trigger: 'sin_contacto', action: 'crear_tarea', days: 3, task_title: 'Hacer seguimiento a {nombre}', active: true },
        budget: { name: 'Aviso de presupuesto', trigger: 'presupuesto_campana', action: 'crear_tarea', percent: 80, task_title: 'La campaña {campana} va en {porcentaje}% del presupuesto', active: true },
        weekly: { name: 'Informe semanal de marketing', trigger: 'semanal', action: 'informe_ia', active: true },
      };
      el.addEventListener('click', async (e) => { const b = e.target.closest('[data-preset]'); if (!b) return; await api(`${P()}/automations`, { method: 'POST', body: PRESETS[b.dataset.preset] }); toast('Automatización creada'); t.load(); });
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

  async function campaigns(el) {
    el.innerHTML = '<div data-c></div><h2 style="margin:22px 0 10px">Gasto real registrado</h2><div data-s></div>';
    const spend = H.table({ el: $('[data-s]', el), org: () => org, entity: 'spend', title: 'gasto', newText: 'Registrar gasto', refs: ['campaigns'], fields: F.spend,
      defaults: () => ({ date: H.todayCo() }), empty: 'Registra el gasto real de cada campaña (por día o por semana). Luego llegará solo desde Meta y Google Ads.',
      columns: [{ label: 'Fecha', html: (r) => day(r.date) }, { label: 'Campaña', html: (r, R) => refName(R, 'campaigns', r.campaign_id) },
        { label: 'Gasto', cls: 'num', html: (r) => money(r.amount) }, { label: 'Leads', cls: 'num', html: (r) => num(r.leads) },
        { label: 'Clics', cls: 'num', html: (r) => num(r.clicks) }, { label: 'Nota', html: (r) => esc(r.note || '') }] });
    H.table({ el: $('[data-c]', el), org: () => org, entity: 'campaigns', title: 'campaña', newText: 'Nueva campaña', fields: F.campaigns,
      filters: [{ k: 'channel', options: opts(CHANNEL, 'Todos los canales') }], defaults: () => ({ start_date: H.todayCo() }),
      empty: 'Sin campañas todavía.', onChanged: () => spend.load(),
      columns: [
        { label: 'Campaña', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b>${r.utm_campaign ? `<br><span class="muted mono">utm: ${esc(r.utm_campaign)}</span>` : ''}` },
        { label: 'Canal', html: (r) => esc(CHANNEL[r.channel] || r.channel) },
        { label: 'Estado', html: (r) => chip(r.status === 'activa' ? 'ok' : r.status === 'pausada' ? 'soon' : 'free', r.status) },
        { label: 'Presupuesto', cls: 'num', html: (r) => money(r.budget) },
        { label: 'Fechas', html: (r) => `${day(r.start_date)}${r.end_date ? ` → ${day(r.end_date)}` : ''}` }],
      rowActions: () => '<button class="btn sm" data-act="spend"><i class="ph-light ph-currency-circle-dollar"></i>Gasto</button>',
      onAction: async (a, r) => {
        if (a !== 'spend') return;
        const out = await H.form({ title: `Gasto de ${r.name}`, fields: F.spend, values: { campaign_id: r.id, date: H.todayCo() }, org });
        if (out) { await api(`${P()}/spend`, { method: 'POST', body: out }); toast('Gasto registrado'); spend.load(); }
      } }).load();
    spend.load();
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

  function pick() { H.seg($('#mkSeg'), VIEWS, (k) => { view = k; render(); }, view); render(); }

  async function load() {
    try { org = await H.orgPicker($('#mkOrg'), (id) => { org = id; render(); }); } catch (x) { $('#mkView').innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
    if (!$('#mkSeg').children.length) pick(); else render();
  }
  return { show: load };
});
