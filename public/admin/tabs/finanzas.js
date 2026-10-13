// Panel Diwilo · pestaña «Finanzas» (Finance Hub). Funciona por organización: Diwilo o cada negocio.
Admin.tab('finanzas', (A) => {
  const { $, $$, esc, toast, api, rank, sure } = A;
  const H = window.Hub;
  const { money, num, day, monthName } = H;
  let org = H.current(), view = 'resumen';
  const P = () => `hub/${encodeURIComponent(org)}`;
  const chip = (cls, t) => `<span class="st ${cls}">${esc(t)}</span>`;
  const refName = (R, ent, id, key = 'name') => (id ? esc(R[ent]?.find((x) => x.id === id)?.[key] || `#${id}`) : '<span class="muted">—</span>');
  const REC_CAT = { infraestructura: 'Infraestructura', software: 'Software', api: 'API', ia: 'IA', marketing: 'Marketing', otro: 'Otro' };
  const CC_KIND = { app: 'App', cliente: 'Cliente', proyecto: 'Proyecto', departamento: 'Departamento' };
  const INV_STATE = { pendiente: ['soon', 'Pendiente'], vencida: ['bad', 'Vencida'], pagada: ['ok', 'Pagada'], anulada: ['free', 'Anulada'] };

  const VIEWS = [['resumen', 'Resumen', 'ph-chart-pie-slice'], ['movimientos', 'Ingresos y gastos', 'ph-arrows-down-up'], ['facturas', 'Facturas y cartera', 'ph-receipt'],
    ['recurrentes', 'Gastos recurrentes', 'ph-repeat'], ['centros', 'Centros de costo y presupuestos', 'ph-tree-structure'], ['bancos', 'Bancos y conciliación', 'ph-bank'], ['exportar', 'Exportar', 'ph-export']];

  // Valores en dólares: se muestran en USD con su conversión a pesos (TRM oficial del día)
  const usd = (n) => `US$${Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usdLine = (r) => (r.currency === 'USD' && r.amount_usd ? `<br><span class="muted" style="font-size:12px">${usd(r.amount_usd)}${r.fx_rate ? ` · TRM ${Number(r.fx_rate).toLocaleString('es-CO', { maximumFractionDigits: 2 })}` : ''}</span>` : '');
  const F = {
    movements: [
      { k: 'kind', label: 'Tipo', type: 'select', options: [['gasto', 'Gasto'], ['ingreso', 'Ingreso']] }, { k: 'date', label: 'Fecha', type: 'date', required: true },
      { k: 'currency', label: 'Moneda', type: 'select', options: [['COP', 'Pesos (COP)'], ['USD', 'Dólares (USD)']] }, { k: 'amount_usd', label: 'Valor en dólares', type: 'usd', hint: 'solo si es en USD' },
      { k: 'amount', label: 'Monto (COP)', type: 'money', hint: 'en USD se calcula con la TRM del día' }, { k: 'category', label: 'Categoría', placeholder: 'Nómina, hosting, ventas…' },
      { k: 'description', label: 'Descripción', full: true }, { k: 'counterparty', label: 'Tercero', placeholder: 'Cliente o proveedor' },
      { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers' }, { k: 'account_id', label: 'Cuenta', ref: 'accounts' },
      { k: 'invoice_id', label: 'Factura', ref: 'invoices' }, { k: 'reconciled', label: 'Conciliado con el banco', type: 'bool', check: 'Sí' }],
    invoices: [
      { k: 'kind', label: 'Tipo', type: 'select', options: [['emitida', 'Emitida (por cobrar)'], ['recibida', 'Recibida (por pagar)']] }, { k: 'number', label: 'Número' },
      { k: 'counterparty', label: 'Cliente o proveedor', required: true }, { k: 'tax_id', label: 'NIT / CC' },
      { k: 'issue_date', label: 'Fecha de emisión', type: 'date', required: true }, { k: 'due_date', label: 'Vence', type: 'date' },
      { k: 'subtotal', label: 'Subtotal', type: 'money' }, { k: 'tax', label: 'Impuestos (IVA…)', type: 'money' }, { k: 'total', label: 'Total', type: 'money', hint: 'vacío = subtotal + impuestos' },
      { k: 'status', label: 'Estado', type: 'select', options: [['pendiente', 'Pendiente'], ['pagada', 'Pagada'], ['anulada', 'Anulada']] },
      { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers' }, { k: 'category', label: 'Categoría' }, { k: 'notes', label: 'Notas', type: 'long' }],
    recurring: [
      { k: 'name', label: 'Gasto', required: true, placeholder: 'Cloudflare Workers, OpenAI, Google Workspace…' }, { k: 'vendor', label: 'Proveedor' },
      { k: 'category', label: 'Tipo', type: 'select', options: Object.entries(REC_CAT) }, { k: 'currency', label: 'Moneda', type: 'select', options: [['COP', 'Pesos (COP)'], ['USD', 'Dólares (USD)']] }, { k: 'amount_usd', label: 'Valor en dólares', type: 'usd', hint: 'solo si es en USD' },
      { k: 'amount', label: 'Valor (COP)', type: 'money', hint: 'en USD se calcula con la TRM' }, { k: 'cycle', label: 'Ciclo', type: 'select', options: [['mensual', 'Mensual'], ['anual', 'Anual']] }, { k: 'next_date', label: 'Próximo cobro', type: 'date', required: true },
      { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers', hint: 'app, cliente o proyecto al que se carga' }, { k: 'account_id', label: 'Se paga desde', ref: 'accounts' },
      { k: 'active', label: 'Estado', type: 'bool', check: 'Activo', default: true }, { k: 'notes', label: 'Notas', type: 'long' }],
    cost_centers: [
      { k: 'name', label: 'Nombre', required: true }, { k: 'kind', label: 'Tipo', type: 'select', options: Object.entries(CC_KIND) },
      { k: 'code', label: 'Código', placeholder: 'opcional' }, { k: 'active', label: 'Estado', type: 'bool', check: 'Activo', default: true }, { k: 'notes', label: 'Notas', type: 'long' }],
    budgets: [
      { k: 'month', label: 'Mes', type: 'month', required: true }, { k: 'cost_center_id', label: 'Centro de costo', ref: 'cost_centers', empty: 'General' },
      { k: 'category', label: 'Categoría', placeholder: 'opcional' }, { k: 'amount', label: 'Presupuesto (COP)', type: 'money', required: true }],
    accounts: [
      { k: 'name', label: 'Nombre', required: true, placeholder: 'Bancolombia ahorros' }, { k: 'kind', label: 'Tipo', type: 'select', options: [['banco', 'Banco'], ['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['billetera', 'Billetera (Nequi, Daviplata)']] },
      { k: 'bank', label: 'Banco' }, { k: 'last4', label: 'Últimos 4 dígitos' }, { k: 'opening_balance', label: 'Saldo inicial (COP)', type: 'money' }],
  };

  async function render() {
    // Contenedor nuevo en cada sección: así no se acumulan los escuchadores de clics de las anteriores.
    const old = $('#fiView'), el = old.cloneNode(false);
    old.replaceWith(el);
    el.innerHTML = '';
    if (view === 'resumen') return summary(el);
    if (view === 'movimientos') {
      return H.table({ el, org: () => org, entity: 'movements', title: 'movimiento', newText: 'Nuevo movimiento', refs: ['cost_centers', 'accounts'], fields: F.movements,
        filters: [{ k: 'kind', options: [['', 'Ingresos y gastos'], ['ingreso', 'Ingresos'], ['gasto', 'Gastos']] }], defaults: () => ({ kind: 'gasto', date: H.todayCo() }),
        empty: 'Sin movimientos. Los gastos recurrentes y los pagos de facturas los crean solos.',
        columns: [
          { label: 'Fecha', html: (r) => day(r.date) },
          { label: 'Descripción', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.description || r.category || '—')}</b>${r.counterparty ? `<br><span class="muted" style="font-size:12px">${esc(r.counterparty)}</span>` : ''}` },
          { label: 'Categoría', html: (r) => (r.category ? `<span class="tag">${esc(r.category)}</span>` : '<span class="muted">—</span>') },
          { label: 'Centro de costo', html: (r, R) => refName(R, 'cost_centers', r.cost_center_id) },
          { label: 'Cuenta', html: (r, R) => refName(R, 'accounts', r.account_id) },
          { label: 'Monto', cls: 'num', html: (r) => `<b style="color:${r.kind === 'ingreso' ? 'var(--good)' : 'var(--ink)'}">${r.kind === 'ingreso' ? '+' : '−'}${money(r.amount)}</b>${usdLine(r)}` },
          { label: '', html: (r) => (r.reconciled ? '<i class="ph-light ph-check-circle" title="Conciliado" style="color:var(--good)"></i>' : '') }] }).load();
    }
    if (view === 'facturas') return invoices(el);
    if (view === 'recurrentes') {
      el.insertAdjacentHTML('beforeend', '<div class="card hubnote">Infraestructura, software, API e IA que se cobran solos. Cada día, a las 3:00 a. m., los que vencen se registran como gasto en su centro de costo y la fecha pasa al siguiente cobro.</div><div data-t></div>');
      return H.table({ el: $('[data-t]', el), org: () => org, entity: 'recurring', title: 'gasto recurrente', newText: 'Nuevo gasto recurrente', refs: ['cost_centers', 'accounts'], fields: F.recurring,
        filters: [{ k: 'category', options: [['', 'Todos los tipos'], ...Object.entries(REC_CAT)] }], defaults: () => ({ next_date: H.todayCo(), category: 'infraestructura' }),
        empty: 'Agrega lo que pagas cada mes o cada año: Cloudflare, dominios, Google Workspace, APIs de IA, WhatsApp…',
        columns: [
          { label: 'Gasto', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b><br><span class="muted" style="font-size:12px">${esc(r.vendor || '')}</span>` },
          { label: 'Tipo', html: (r) => `<span class="tag">${esc(REC_CAT[r.category] || r.category)}</span>` },
          { label: 'Valor', cls: 'num', html: (r) => (r.currency === 'USD' ? `<b style="font-weight:500">${usd(r.amount_usd)}</b> <span class="muted" style="font-size:12px">${esc(r.cycle)}</span><br><span class="muted" style="font-size:12px">≈ ${money(r.amount)} hoy</span>` : `${money(r.amount)}<br><span class="muted" style="font-size:12px">${esc(r.cycle)}</span>`) },
          { label: 'Próximo cobro', html: (r) => day(r.next_date) },
          { label: 'Centro de costo', html: (r, R) => refName(R, 'cost_centers', r.cost_center_id) },
          { label: 'Estado', html: (r) => (r.active ? chip('ok', 'Activo') : chip('free', 'Pausado')) }] }).load();
    }
    if (view === 'centros') {
      el.innerHTML = '<div data-cc></div><h2 style="margin:22px 0 10px">Presupuestos por mes</h2><div data-b></div>';
      const bud = H.table({ el: $('[data-b]', el), org: () => org, entity: 'budgets', title: 'presupuesto', newText: 'Nuevo presupuesto', refs: ['cost_centers'], fields: F.budgets,
        defaults: () => ({ month: H.todayCo().slice(0, 7) }), empty: 'Define cuánto puede gastar cada centro de costo al mes; el resumen lo compara con el gasto real.',
        columns: [{ label: 'Mes', html: (r) => monthName(r.month) }, { label: 'Centro de costo', html: (r, R) => (r.cost_center_id ? refName(R, 'cost_centers', r.cost_center_id) : 'General') },
          { label: 'Categoría', html: (r) => esc(r.category || '—') }, { label: 'Presupuesto', cls: 'num', html: (r) => money(r.amount) }] });
      H.table({ el: $('[data-cc]', el), org: () => org, entity: 'cost_centers', title: 'centro de costo', newText: 'Nuevo centro de costo', fields: F.cost_centers,
        filters: [{ k: 'kind', options: [['', 'Todos'], ...Object.entries(CC_KIND)] }], onChanged: () => bud.load(),
        empty: 'Crea centros por app, cliente, proyecto o departamento para saber cuánto cuesta y cuánto deja cada uno.',
        columns: [{ label: 'Centro de costo', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b>${r.code ? `<br><span class="muted mono">${esc(r.code)}</span>` : ''}` },
          { label: 'Tipo', html: (r) => `<span class="tag">${esc(CC_KIND[r.kind] || r.kind)}</span>` }, { label: 'Estado', html: (r) => (r.active ? chip('ok', 'Activo') : chip('free', 'Inactivo')) }] }).load();
      return bud.load();
    }
    if (view === 'bancos') return banks(el);
    if (view === 'exportar') return exportView(el);
  }

  async function summary(el) {
    el.innerHTML = `<div class="row hubbar"><label class="f" style="margin:0">Mes<input class="in" type="month" data-m></label><span class="grow"></span>
        ${org === 'diwilo' ? '<button class="btn" data-pays><i class="ph-light ph-download-simple"></i>Traer pagos de Negocios</button>' : ''}<button class="btn" data-report><i class="ph-light ph-robot"></i>Pedir informe al agente</button></div>
      <div class="grid" style="--min:160px;margin-bottom:14px" data-kpis></div>
      <div class="card" style="margin-bottom:14px"><h2>Flujo de caja</h2><p class="muted" style="margin:-4px 0 10px;font-size:12px">6 meses reales y 3 proyectados con los gastos recurrentes y las facturas por vencer.</p><div data-flow></div></div>
      <div class="grid" style="--min:420px;margin-bottom:14px">
        <div class="card tbl-wrap"><h2 style="margin-bottom:10px">Presupuesto vs gasto real por centro de costo</h2><div data-cc></div></div>
        <div class="card"><h2>Gastos del mes por categoría</h2><div class="rank" data-cat></div></div></div>
      <div class="grid" style="--min:300px;margin-bottom:14px">
        <div class="card"><h2>Por cobrar</h2><div data-ar></div></div>
        <div class="card"><h2>Por pagar</h2><div data-ap></div></div>
        <div class="card"><h2>Gastos recurrentes al mes</h2><div class="rank" data-rec></div></div></div>
      <div class="card tbl-wrap"><h2 style="margin-bottom:10px">Cuentas</h2><div data-acc></div></div>`;
    const m = $('[data-m]', el);
    async function load() {
      let s; try { s = await api(`${P()}/finance/summary${m.value ? `?month=${m.value}` : ''}`); } catch (x) { $('[data-kpis]', el).innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
      m.value = s.month;
      H.kpis($('[data-kpis]', el), [
        ['Ingresos del mes', money(s.totals.income)], ['Gastos del mes', money(s.totals.expense)],
        ['Resultado', `<span style="color:${s.totals.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(s.totals.net)}</span>`],
        ['Presupuesto del mes', money(s.totals.budget), s.totals.budget ? `usado ${Math.round(s.totals.expense / s.totals.budget * 100)}%` : 'sin presupuesto'],
        ['Por cobrar', money(s.receivable.total), s.receivable.overdue ? `<span style="color:var(--bad)">${money(s.receivable.overdue)} vencido</span>` : 'al día'],
        ['Por pagar', money(s.payable.total), s.payable.overdue ? `<span style="color:var(--bad)">${money(s.payable.overdue)} vencido</span>` : 'al día'],
        ['Recurrentes al mes', money(s.recurring_total)],
        ['Banco sin conciliar', num(s.bank_pending), s.bank_pending ? 'líneas del extracto' : 'todo conciliado']]);
      H.bars($('[data-flow]', el), s.cash_flow.map((r) => ({ label: monthName(r.month), a: r.income, b: r.expense, projected: r.projected })), { la: 'Ingresos', lb: 'Gastos' });
      $('[data-cc]', el).innerHTML = s.cost_centers.length ? `<table><thead><tr><th>Centro de costo</th><th class="num">Ingresos</th><th class="num">Gasto</th><th class="num">Presupuesto</th><th>Uso</th></tr></thead><tbody>
        ${s.cost_centers.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${money(c.income)}</td><td class="num">${money(c.expense)}</td><td class="num">${money(c.budget)}</td><td style="min-width:120px">${H.meter(c.expense, c.budget)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">Sin movimientos ni presupuestos este mes.</p>';
      rank($('[data-cat]', el), s.expense_by_category.map((r) => ({ k: r.k, n: r.n })), (k) => esc(k));
      $$('.rank[data-cat] .r span:nth-child(2)', el).forEach((sp) => { sp.textContent = money(Number(sp.textContent.replace(/\D/g, ''))); });
      const aging = (a, kind) => `<div class="aging">${[['al_dia', 'Al día'], ['d30', '1–30 días'], ['d60', '31–60'], ['d90', '61–90'], ['mas90', '+90']].map(([k, l]) => `<div><span class="muted">${l}</span><b style="${k !== 'al_dia' && a.buckets[k] ? 'color:var(--bad)' : ''}">${money(a.buckets[k])}</b></div>`).join('')}</div>
        ${a.items.length ? `<div class="urows">${a.items.map((i) => `<div class="urow"><span class="e">${esc(i.counterparty)} · ${esc(i.number || '#' + i.id)}<br><span style="font-size:12px">${i.late > 0 ? `<span style="color:var(--bad)">${i.late} días vencida</span>` : `vence ${day(i.due_date)}`}</span></span><b>${money(i.due)}</b></div>`).join('')}</div>` : `<p class="muted" style="margin:8px 0 0">Nada ${kind}.</p>`}`;
      $('[data-ar]', el).innerHTML = aging(s.receivable, 'por cobrar');
      $('[data-ap]', el).innerHTML = aging(s.payable, 'por pagar');
      rank($('[data-rec]', el), Object.entries(s.recurring_monthly).map(([k, n]) => ({ k: REC_CAT[k] || k, n })), esc);
      $$('.rank[data-rec] .r span:nth-child(2)', el).forEach((sp) => { sp.textContent = money(Number(sp.textContent.replace(/\D/g, ''))); });
      $('[data-acc]', el).innerHTML = s.accounts.length ? `<table><thead><tr><th>Cuenta</th><th>Tipo</th><th class="num">Saldo según registros</th></tr></thead><tbody>${s.accounts.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.kind)}</td><td class="num">${money(a.balance)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">Agrega tus cuentas en «Bancos y conciliación».</p>';
    }
    m.onchange = load;
    $('[data-pays]', el)?.addEventListener('click', async (e) => { e.target.disabled = true; try { const r = await api(`${P()}/finance/import-payments`, { method: 'POST' }); toast(`${r.imported} pagos nuevos registrados como ingreso`); load(); } catch (x) { toast(x.message); } e.target.disabled = false; });
    $('[data-report]', el).onclick = async (e) => { e.target.disabled = true; toast('El agente está escribiendo el informe…'); try { await api(`${P()}/reports`, { method: 'POST', body: { kind: 'finanzas' } }); toast('Informe listo: está en Marketing → Informes'); } catch (x) { toast(x.message); } e.target.disabled = false; };
    load();
  }
  async function invoices(el) {
    el.innerHTML = `<div class="card hubnote row" style="justify-content:space-between;gap:12px;flex-wrap:wrap"><span>Crea tus cuentas de cobro con sus líneas (en pesos o en dólares con la TRM del día), y descárgalas en PDF con tu diseño, consecutivo y datos de pago.</span>
      <span class="row" style="gap:6px"><button class="btn sm" data-sign><i class="ph-light ph-signature"></i>Mi firma</button><button class="btn sm" data-profile><i class="ph-light ph-identification-card"></i>Mis datos de facturación</button></span></div><div data-t></div>`;
    $('[data-profile]', el).onclick = () => billingProfile();
    $('[data-sign]', el).onclick = () => signatureDialog();
    const t = H.table({ el: $('[data-t]', el), org: () => org, entity: 'invoices', title: 'factura', newText: 'Nueva cuenta de cobro', refs: ['cost_centers'], fields: F.invoices,
      filters: [{ k: 'kind', options: [['', 'Por cobrar y por pagar'], ['emitida', 'Por cobrar (emitidas)'], ['recibida', 'Por pagar (recibidas)']] }],
      empty: 'Sin facturas. Crea tu primera cuenta de cobro o registra las que recibes (cuentas por pagar).',
      onEdit: (row, changed) => (row && row.kind === 'recibida' ? simpleInvoice(row, changed) : invoiceEditor(row, changed)),
      columns: [
        { label: 'Documento', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.number || '#' + r.id)}</b><br><span class="muted" style="font-size:12px">${r.kind === 'emitida' ? 'Por cobrar' : 'Por pagar'}</span>` },
        { label: 'Tercero', html: (r) => `${esc(r.counterparty)}${r.tax_id ? `<br><span class="muted mono">${esc(r.tax_id)}</span>` : ''}` },
        { label: 'Emisión', html: (r) => day(r.issue_date) }, { label: 'Vence', html: (r) => day(r.due_date) },
        { label: 'Total', cls: 'num', html: (r) => money(r.total) }, { label: 'Saldo', cls: 'num', html: (r) => money(Math.max(0, r.total - r.paid)) },
        { label: 'Estado', html: (r) => chip(...(INV_STATE[r.state] || ['free', r.state])) }],
      rowActions: (r) => `${r.kind === 'emitida' ? '<button class="btn sm" data-act="pdf"><i class="ph-light ph-file-pdf"></i>PDF</button> ' : ''}${['pendiente', 'vencida'].includes(r.state) ? `<button class="btn sm" data-act="pay"><i class="ph-light ph-hand-coins"></i>${r.kind === 'emitida' ? 'Registrar cobro' : 'Registrar pago'}</button>` : ''}`,
      onAction: async (a, r) => {
        if (a === 'pdf') return openPdf(r.id);
        if (a !== 'pay') return;
        const out = await H.form({ title: `${r.kind === 'emitida' ? 'Cobro' : 'Pago'} de ${r.number || '#' + r.id}`, org,
          fields: [{ k: 'date', label: 'Fecha', type: 'date', required: true }, { k: 'amount', label: 'Monto (COP)', type: 'money', required: true }, { k: 'account_id', label: 'Cuenta', ref: 'accounts' }],
          values: { date: H.todayCo(), amount: r.total - r.paid } });
        if (!out) return;
        try { await api(`${P()}/invoices/${r.id}/pay`, { method: 'POST', body: out }); toast('Registrado: queda como movimiento ligado a la factura'); t.load(); } catch (x) { toast(x.message); }
      } });
    t.load();

    const openPdf = (id) => window.open(`/admin/api/${P()}/invoices/${id}/pdf`, '_blank', 'noopener');
    // Factura recibida (por pagar): formulario simple de siempre
    async function simpleInvoice(row, changed) {
      const out = await H.form({ title: 'Editar factura por pagar', fields: F.invoices, values: row, org, onDelete: () => api(`${P()}/invoices/${row.id}`, { method: 'DELETE' }) });
      if (out === 'deleted') { toast('Borrado'); return changed(); }
      if (!out) return;
      try { await api(`${P()}/invoices/${row.id}`, { method: 'PATCH', body: out }); toast('Guardado'); changed(); } catch (x) { toast(x.message); }
    }

    // Editor de cuenta de cobro con líneas
    async function invoiceEditor(row, changed) {
      const prof = await api(`${P()}/billing/profile`).catch(() => ({ due_days: 15 }));
      const v = row ? { ...row } : { kind: 'emitida', issue_date: H.todayCo(), due_date: new Date(Date.now() - 5 * 3600000 + (prof.due_days || 15) * 86400000).toISOString().slice(0, 10) };
      let lines = []; try { lines = JSON.parse(v.items || '[]'); } catch {}
      if (!lines.length) lines = row ? [{ concepto: v.concept || 'Servicios', cantidad: 1, moneda: 'COP', valor: v.subtotal || v.total || 0 }] : [{ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }];
      const ccs = await H.refs(org, 'cost_centers').catch(() => []);
      const d = document.createElement('dialog');
      d.className = 'ask hubdlg invdlg';
      d.innerHTML = `<form method="dialog">
        <div class="row" style="justify-content:space-between;gap:10px"><h2>${row ? `Cuenta de cobro ${esc(row.number || '#' + row.id)}` : 'Nueva cuenta de cobro'}</h2>${row?.number ? '' : `<span class="muted" style="font-size:12px">Número: se asigna solo (${esc(prof.prefix || '')}…)</span>`}</div>
        <div class="invgrid">
          <label class="f full">Cliente<input class="in" name="counterparty" required value="${esc(v.counterparty || '')}" placeholder="Corporación Club Rotario Medellín El Poblado"></label>
          <label class="f">NIT o documento<input class="in" name="tax_id" value="${esc(v.tax_id || '')}" placeholder="890 982 559-7"></label>
          <label class="f">Ciudad<input class="in" name="client_city" value="${esc(v.client_city || '')}" placeholder="Medellín"></label>
          <label class="f">Correo del cliente<input class="in" name="client_email" type="email" value="${esc(v.client_email || '')}"></label>
          <label class="f">Fecha<input class="in" name="issue_date" type="date" required value="${esc(v.issue_date || '')}"></label>
          <label class="f">Pagar antes del<input class="in" name="due_date" type="date" value="${esc(v.due_date || '')}"></label>
          <label class="f full">Por concepto de <span class="muted" style="font-size:11px">párrafo que explica el cobro (opcional)</span><textarea class="in" name="concept" rows="2">${esc(v.concept || '')}</textarea></label>
        </div>
        <div class="invlines"><div class="invhead"><span>Concepto</span><span>Cant.</span><span>Moneda</span><span>Valor unitario</span><span class="n">Total</span><span></span></div><div data-lines></div>
          <button class="btn sm" type="button" data-add><i class="ph-light ph-plus"></i>Agregar línea</button></div>
        <div class="invsum"><span class="muted" data-trm></span><div><span class="muted">Impuestos (si aplica)</span> <input class="in" name="tax" type="number" min="0" step="1" value="${esc(v.tax || '')}" style="width:130px"></div>
          <div class="invtotal">Total <b data-total>$0</b></div></div>
        <div class="invgrid" style="margin-top:6px">
          <label class="f">Centro de costo<select class="in" name="cost_center_id"><option value="">—</option>${ccs.map((c) => `<option value="${c.id}" ${String(c.id) === String(v.cost_center_id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label class="f">Categoría<input class="in" name="category" value="${esc(v.category || '')}" placeholder="Desarrollo web, soporte…"></label>
          ${row ? `<label class="f">Estado<select class="in" name="status">${[['pendiente', 'Pendiente'], ['pagada', 'Pagada'], ['anulada', 'Anulada']].map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
          <label class="f full">Notas internas <span class="muted" style="font-size:11px">no salen en el PDF</span><textarea class="in" name="notes" rows="1">${esc(v.notes || '')}</textarea></label>
        </div>
        <p class="err" data-err></p>
        <div class="row" style="justify-content:space-between;margin-top:12px;flex-wrap:wrap;gap:8px">
          <span>${row ? '<button class="btn sm danger" type="button" data-del><i class="ph-light ph-trash"></i>Borrar</button>' : ''}</span>
          <span class="row" style="gap:8px"><button class="btn" type="button" data-no>Cancelar</button><button class="btn" value="save" data-save>Guardar</button><button class="btn pri" value="pdf" data-pdf><i class="ph-light ph-file-pdf"></i>Guardar y ver PDF</button></span></div></form>`;
      document.body.appendChild(d);
      const f = $('form', d), box = $('[data-lines]', d);
      let rate = null, rateDate = null;
      const num = (x) => Number(String(x ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
      const lineHtml = (l, i) => `<div class="invline" data-i="${i}">
          <span><input class="in" data-k="concepto" value="${esc(l.concepto || '')}" placeholder="Desarrollo del sitio web institucional"><input class="in sub" data-k="detalle" value="${esc(l.detalle || '')}" placeholder="Detalle (opcional)"></span>
          <input class="in" data-k="cantidad" type="number" min="0" step="any" value="${esc(l.cantidad ?? 1)}">
          <select class="in" data-k="moneda"><option value="COP" ${l.moneda !== 'USD' ? 'selected' : ''}>COP</option><option value="USD" ${l.moneda === 'USD' ? 'selected' : ''}>USD</option></select>
          <input class="in" data-k="valor" type="number" min="0" step="any" value="${esc(l.valor ?? '')}" placeholder="0">
          <b class="n" data-lt>$0</b><button class="btn sm" type="button" data-rm title="Quitar línea"><i class="ph-light ph-x"></i></button></div>`;
      const draw = () => { box.innerHTML = lines.map(lineHtml).join(''); calc(); };
      const read = () => { $$('.invline', box).forEach((r) => { const l = lines[+r.dataset.i]; $$('[data-k]', r).forEach((x) => { l[x.dataset.k] = x.value; }); }); };
      async function ensureRate() {
        const date = f.issue_date.value;
        if (!lines.some((l) => l.moneda === 'USD') || (rate && rateDate === date)) return;
        rateDate = date; rate = null; $('[data-trm]', d).textContent = 'Buscando la TRM…';
        try { rate = (await api(`${P()}/billing/fx?date=${date}`)).rate; } catch { rate = null; }
        calc();
      }
      function calc() {
        read();
        let total = 0;
        $$('.invline', box).forEach((r) => {
          const l = lines[+r.dataset.i], usd = l.moneda === 'USD';
          const lt = Math.round((usd ? num(l.valor) * (rate || l.trm || 0) : num(l.valor)) * (num(l.cantidad) || 1));
          total += lt; $('[data-lt]', r).textContent = money(lt);
        });
        total += num(f.tax.value);
        $('[data-total]', d).textContent = money(total);
        $('[data-trm]', d).textContent = lines.some((l) => l.moneda === 'USD') ? (rate ? `TRM oficial del ${day(rateDate)}: $${rate.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'TRM: se calcula al guardar') : '';
      }
      draw(); ensureRate();
      box.addEventListener('input', calc);
      box.addEventListener('change', (e) => { if (e.target.dataset.k === 'moneda') { read(); ensureRate(); } calc(); });
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; read(); lines.splice(+b.closest('.invline').dataset.i, 1); if (!lines.length) lines.push({ cantidad: 1, moneda: 'COP' }); draw(); });
      $('[data-add]', d).onclick = () => { read(); lines.push({ concepto: '', cantidad: 1, moneda: 'COP', valor: '' }); draw(); $$('.invline [data-k=concepto]', box).pop().focus(); };
      f.issue_date.addEventListener('change', () => { ensureRate(); });
      f.tax.addEventListener('input', calc);
      const close = () => { d.close(); d.remove(); };
      $('[data-no]', d).onclick = close;
      d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
      $('[data-del]', d)?.addEventListener('click', async () => { if (await sure(`¿Borrar la cuenta de cobro ${row.number || '#' + row.id}? No se puede deshacer.`, 'Borrar')) { await api(`${P()}/invoices/${row.id}`, { method: 'DELETE' }); close(); toast('Borrada'); changed(); } });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        read();
        const items = lines.filter((l) => String(l.concepto || '').trim()).map((l) => ({ concepto: l.concepto.trim(), detalle: (l.detalle || '').trim(), cantidad: num(l.cantidad) || 1, moneda: l.moneda, valor: num(l.valor), ...(l.moneda === 'USD' && rate ? { trm: rate } : {}) }));
        if (!items.length) { $('[data-err]', d).textContent = 'Agrega al menos una línea con su concepto.'; return; }
        if (items.some((i) => !(i.valor > 0))) { $('[data-err]', d).textContent = 'Cada línea necesita un valor mayor que cero.'; return; }
        const body = { kind: 'emitida', counterparty: f.counterparty.value.trim(), tax_id: f.tax_id.value.trim(), client_city: f.client_city.value.trim(), client_email: f.client_email.value.trim(),
          issue_date: f.issue_date.value, due_date: f.due_date.value, concept: f.concept.value.trim(), items, tax: num(f.tax.value), cost_center_id: f.cost_center_id.value, category: f.category.value.trim(), notes: f.notes.value.trim(),
          ...(row ? { status: f.status.value } : {}) };
        const wantPdf = e.submitter?.value === 'pdf';
        $$('button', d).forEach((b) => { b.disabled = true; });
        try {
          const r = await api(row ? `${P()}/invoices/${row.id}` : `${P()}/invoices`, { method: row ? 'PATCH' : 'POST', body });
          close(); toast(row ? 'Guardada' : 'Cuenta de cobro creada'); changed();
          if (wantPdf) openPdf(row ? row.id : r.id);
        } catch (x) { $('[data-err]', d).textContent = x.message; $$('button', d).forEach((b) => { b.disabled = false; }); }
      });
      d.showModal();
      f.counterparty.focus();
    }
  }

  // Firma para las cuentas de cobro: subir una foto (se le quita el fondo) o dibujarla
  async function signatureDialog() {
    const prof = await api(`${P()}/billing/profile`);
    const d = document.createElement('dialog');
    d.className = 'ask signdlg';
    d.innerHTML = `<form method="dialog"><h2>Mi firma</h2>
      <p class="muted" style="font-size:13px;margin:6px 0 12px">Sale sobre la línea de firma de tus cuentas de cobro. Firma en una hoja blanca con lapicero negro o azul y tómale una foto de cerca, o dibújala aquí.</p>
      <div class="seg" data-mode><button class="btn sm on" type="button" data-m="up"><i class="ph-light ph-upload-simple"></i>Subir foto</button><button class="btn sm" type="button" data-m="draw"><i class="ph-light ph-pen-nib"></i>Dibujarla</button></div>
      <div data-up style="margin-top:12px"><label class="signdrop"><input type="file" accept="image/*" hidden><i class="ph-light ph-image-square"></i><span>Toca para elegir la foto de tu firma</span></label></div>
      <div data-draw hidden style="margin-top:12px"><canvas class="signpad" width="1200" height="420"></canvas><div class="row" style="justify-content:space-between;margin-top:6px"><span class="muted" style="font-size:12px">Firma con el mouse o el dedo</span><button class="btn sm" type="button" data-clear>Borrar trazo</button></div></div>
      <div style="margin-top:14px"><span class="muted" style="font-size:12px">Así se verá</span><div class="signprev" data-prev>${prof.signature ? `<img src="${esc(prof.signature)}" alt="">` : '<span class="muted">Aún no hay firma</span>'}</div></div>
      <p class="err" data-err></p>
      <div class="row" style="justify-content:space-between;margin-top:12px;gap:8px;flex-wrap:wrap"><span>${prof.signature ? '<button class="btn sm danger" type="button" data-rm><i class="ph-light ph-trash"></i>Quitar firma</button>' : ''}</span>
        <span class="row" style="gap:8px"><button class="btn" type="button" data-no>Cancelar</button><button class="btn pri" data-yes disabled>Guardar firma</button></span></div></form>`;
    document.body.appendChild(d);
    let result = null, drawn = false;
    const close = () => { d.close(); d.remove(); };
    const preview = (url) => { result = url; $('[data-prev]', d).innerHTML = url ? `<img src="${url}" alt="">` : '<span class="muted">Aún no hay firma</span>'; $('[data-yes]', d).disabled = !url; };
    // Recorta al trazo, vuelve transparente el fondo claro, oscurece la tinta y la deja en PNG liviano
    function clean(src) {
      const w = src.width, h = src.height, c = src.getContext ? src : (() => { const k = document.createElement('canvas'); k.width = w; k.height = h; k.getContext('2d').drawImage(src, 0, 0); return k; })();
      const ctx = c.getContext('2d'), img = ctx.getImageData(0, 0, w, h), px = img.data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let i = 0; i < px.length; i += 4) {
        const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2], a = px[i + 3];
        const ink = a > 40 && l < 150;
        if (!ink) { px[i + 3] = 0; continue; }
        px[i + 3] = Math.min(255, Math.round((150 - l) * 2.2 + 90) * (a / 255));
        const p = i / 4, x = p % w, y = (p / w) | 0;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
      if (x1 < 0) throw new Error('No encontré la firma: usa una foto con buena luz, fondo blanco y tinta oscura.');
      ctx.putImageData(img, 0, 0);
      const pad = 10, cw = x1 - x0 + 1 + pad * 2, ch = y1 - y0 + 1 + pad * 2, scale = Math.min(1, 600 / cw, 220 / ch);
      const out = document.createElement('canvas'); out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
      out.getContext('2d').drawImage(c, x0 - pad, y0 - pad, cw, ch, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    }
    $('[data-mode]', d).onclick = (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      $$('[data-m]', d).forEach((x) => x.classList.toggle('on', x === b));
      $('[data-up]', d).hidden = b.dataset.m !== 'up'; $('[data-draw]', d).hidden = b.dataset.m !== 'draw';
    };
    $('[data-up] input', d).onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          preview(clean(c)); $('[data-err]', d).textContent = '';
        } catch (x) { $('[data-err]', d).textContent = x.message; }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => { $('[data-err]', d).textContent = 'No pude abrir esa imagen. Prueba con una foto JPG o PNG.'; };
      img.src = URL.createObjectURL(file);
    };
    // Dibujar
    const pad = $('.signpad', d), pctx = pad.getContext('2d');
    pctx.lineWidth = 5; pctx.lineCap = 'round'; pctx.lineJoin = 'round'; pctx.strokeStyle = '#14112b';
    let down = false, last = null;
    const pos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
    pad.addEventListener('pointerdown', (e) => { down = true; last = pos(e); pad.setPointerCapture(e.pointerId); });
    pad.addEventListener('pointermove', (e) => { if (!down) return; const p = pos(e); pctx.beginPath(); pctx.moveTo(...last); pctx.lineTo(...p); pctx.stroke(); last = p; drawn = true; });
    const end = () => { if (!down) return; down = false; if (drawn) try { preview(clean(pad)); } catch {} };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    $('[data-clear]', d).onclick = () => { pctx.clearRect(0, 0, pad.width, pad.height); drawn = false; preview(null); };
    $('[data-no]', d).onclick = close;
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    $('[data-rm]', d)?.addEventListener('click', async () => { try { await api(`${P()}/billing/profile`, { method: 'PUT', body: { signature: '' } }); toast('Firma quitada'); close(); } catch (x) { $('[data-err]', d).textContent = x.message; } });
    $('form', d).addEventListener('submit', async (e) => {
      e.preventDefault(); if (!result) return;
      try { await api(`${P()}/billing/profile`, { method: 'PUT', body: { signature: result } }); toast('Firma guardada: ya sale en tus cuentas de cobro'); close(); }
      catch (x) { $('[data-err]', d).textContent = x.message; }
    });
    d.showModal();
  }

  // Datos de quien cobra: salen en todas las cuentas de cobro de esta organización
  async function billingProfile() {
    const p = await api(`${P()}/billing/profile`);
    const out = await H.form({ title: 'Mis datos de facturación', org, okText: 'Guardar', values: p, fields: [
      { k: 'title', label: 'Nombre del documento', placeholder: 'Cuenta de cobro' }, { k: 'prefix', label: 'Prefijo del consecutivo', placeholder: 'DW-' },
      { k: 'next_number', label: 'Siguiente número', type: 'int' }, { k: 'due_days', label: 'Días para pagar', type: 'int' },
      { k: 'issuer_name', label: 'Nombre de quien cobra', full: true }, { k: 'issuer_doc_label', label: 'Tipo de documento', placeholder: 'NIT o C.C.' }, { k: 'issuer_doc', label: 'Número' },
      { k: 'issuer_doc_city', label: 'Expedido en' }, { k: 'signer_doc_label', label: 'Documento en la firma', placeholder: 'Cédula de ciudadanía' },
      { k: 'brand', label: 'Marca' }, { k: 'tagline', label: 'Frase de la marca' }, { k: 'city', label: 'Ciudad' },
      { k: 'phone', label: 'Teléfono' }, { k: 'email', label: 'Correo' }, { k: 'web', label: 'Sitio web' }, { k: 'whatsapp', label: 'WhatsApp para comprobantes', hint: 'con indicativo: 57…' },
      { k: 'bank', label: 'Banco' }, { k: 'account_type', label: 'Tipo de cuenta', type: 'select', options: [['ahorros', 'Ahorros'], ['corriente', 'Corriente']] }, { k: 'account_number', label: 'Número de cuenta' }, { k: 'breb_key', label: 'Llave Bre-B', hint: 'cédula, celular, correo o alfanumérica' },
      { k: 'legal', label: 'Nota legal (al final)', type: 'long' }] });
    if (!out) return;
    try { await api(`${P()}/billing/profile`, { method: 'PUT', body: out }); toast('Datos de facturación guardados'); } catch (x) { toast(x.message); }
  }

  async function banks(el) {
    el.innerHTML = `<div data-acc></div>
      <div class="card" style="margin-top:14px"><h2>Importar extracto (CSV)</h2>
        <p class="muted" style="margin:-4px 0 10px;font-size:12px">Descarga el extracto de tu banco en CSV o Excel (guárdalo como CSV). Elige la cuenta y el archivo, y marca qué columna es cada dato. Se concilia solo lo que coincide en valor, sentido y fecha (±3 días).</p>
        <div class="row" style="flex-wrap:wrap;gap:10px"><select class="in" data-acct style="width:auto"></select><input type="file" accept=".csv,text/csv" data-file></div>
        <div data-map style="margin-top:12px"></div></div>
      <div class="card tbl-wrap" style="margin-top:14px"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h2>Líneas del extracto</h2><select class="in" data-filter style="width:auto"></select></div><div data-lines></div></div>`;
    const accTable = H.table({ el: $('[data-acc]', el), org: () => org, entity: 'accounts', title: 'cuenta', newText: 'Nueva cuenta', fields: F.accounts,
      empty: 'Agrega tus cuentas bancarias, de efectivo o billeteras.', onChanged: fillAccounts,
      columns: [{ label: 'Cuenta', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.name)}</b>${r.last4 ? ` <span class="muted mono">···${esc(r.last4)}</span>` : ''}` },
        { label: 'Tipo', html: (r) => esc(r.kind) }, { label: 'Banco', html: (r) => esc(r.bank || '—') }, { label: 'Saldo inicial', cls: 'num', html: (r) => money(r.opening_balance) }] });
    accTable.load();
    async function fillAccounts() {
      H.dropRefs(org, 'accounts');
      const accs = await H.refs(org, 'accounts');
      $('[data-acct]', el).innerHTML = accs.length ? accs.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('') : '<option value="">Primero crea una cuenta</option>';
      $('[data-filter]', el).innerHTML = '<option value="">Todas las cuentas</option>' + accs.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    }
    await fillAccounts();
    // CSV: separador , o ; ; montos con . o , ; una columna de monto (con signo) o débito/crédito
    const parseCsv = (text) => {
      const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
      const rows = []; let row = [], cell = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
        else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
      }
      if (cell || row.length) { row.push(cell); rows.push(row); }
      return rows.filter((r) => r.some((c) => c.trim()));
    };
    const toNum = (s) => { s = String(s || '').replace(/[^\d,.-]/g, ''); if (!s) return 0; if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); return Number(s) || 0; };
    const toDate = (s) => { s = String(s || '').trim(); let m; if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return null; };
    $('[data-file]', el).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rows = parseCsv(await f.text());
      if (rows.length < 2) { toast('El archivo no tiene filas'); return; }
      const head = rows[0], guess = (re) => head.findIndex((h) => re.test(h.toLowerCase()));
      const sel = (name, idx, none) => `<label class="f">${name}<select class="in" data-c="${name}">${none ? '<option value="-1">— ninguna —</option>' : ''}${head.map((h, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${esc(h || 'Columna ' + (i + 1))}</option>`).join('')}</select></label>`;
      $('[data-map]', el).innerHTML = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${sel('Fecha', guess(/fecha|date/))}${sel('Descripción', guess(/desc|concepto|detalle/))}${sel('Valor', guess(/valor|monto|importe|amount/), true)}${sel('Débito', guess(/d[eé]bito|cargo|retiro|salida/), true)}${sel('Crédito', guess(/cr[eé]dito|abono|consign|entrada/), true)}${sel('Referencia', guess(/ref|doc|comprobante/), true)}</div>
        <p class="muted" style="font-size:12px">${rows.length - 1} filas. Si el banco trae una sola columna de valor, los retiros deben venir en negativo; si trae débito y crédito, déjalas marcadas y la de valor en «ninguna».</p>
        <button class="btn pri" data-go><i class="ph-light ph-upload-simple"></i>Importar y conciliar</button>`;
      $('[data-go]', el).onclick = async () => {
        const c = Object.fromEntries($$('[data-c]', el).map((s) => [s.dataset.c, Number(s.value)]));
        const lines = rows.slice(1).map((r) => {
          const amount = c.Valor >= 0 ? toNum(r[c.Valor]) : toNum(r[c['Crédito']]) - Math.abs(toNum(r[c['Débito']]));
          return { date: toDate(r[c.Fecha]), description: r[c['Descripción']] || '', amount: Math.round(amount), ref: c.Referencia >= 0 ? r[c.Referencia] : null };
        }).filter((l) => l.date && l.amount);
        if (!lines.length) { toast('No se encontraron filas con fecha y valor'); return; }
        try { const r = await api(`${P()}/finance/bank-import`, { method: 'POST', body: { account_id: Number($('[data-acct]', el).value), lines } }); toast(`${r.imported} líneas importadas · ${r.matched} conciliadas solas`); $('[data-map]', el).innerHTML = ''; e.target.value = ''; loadLines(); }
        catch (x) { toast(x.message); }
      };
    };
    async function loadLines() {
      const acc = $('[data-filter]', el).value;
      const [{ lines }, ccs] = await Promise.all([api(`${P()}/finance/bank-lines${acc ? `?account_id=${acc}` : ''}`), H.refs(org, 'cost_centers')]);
      $('[data-lines]', el).innerHTML = lines.length ? `<table><thead><tr><th>Fecha</th><th>Descripción</th><th class="num">Valor</th><th>Conciliación</th></tr></thead><tbody>${lines.map((l) => `<tr data-line="${l.id}">
          <td>${day(l.date)}</td><td>${esc(l.description || '—')}${l.ref ? `<br><span class="muted mono">${esc(l.ref)}</span>` : ''}</td>
          <td class="num" style="color:${l.amount > 0 ? 'var(--good)' : 'inherit'}">${money(l.amount)}</td>
          <td>${l.movement_id ? `<span class="st ok">Conciliada</span> <span class="muted" style="font-size:12px">${esc(l.m_description || l.m_category || '')}</span> <button class="btn sm" data-unlink>Deshacer</button>`
            : `<div class="row" style="gap:6px;flex-wrap:wrap">${(l.candidates || []).map((m) => `<button class="btn sm" data-match="${m.id}" title="${esc(m.description || '')}">${day(m.date)} · ${esc((m.description || m.counterparty || '').slice(0, 24))}</button>`).join('')}
               <select class="in" data-cc style="width:auto;font-size:12px"><option value="">Centro de costo…</option>${ccs.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
               <input class="in" data-cat placeholder="Categoría" style="width:130px;font-size:12px"><button class="btn sm pri" data-create>Crear movimiento</button></div>`}</td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">Aún no hay extractos importados.</p>';
    }
    $('[data-filter]', el).onchange = loadLines;
    $('[data-lines]', el).addEventListener('click', async (e) => {
      const tr = e.target.closest('[data-line]'); if (!tr) return;
      const id = tr.dataset.line;
      let body = null;
      if (e.target.closest('[data-match]')) body = { movement_id: Number(e.target.closest('[data-match]').dataset.match) };
      if (e.target.closest('[data-create]')) body = { create: { category: $('[data-cat]', tr).value.trim(), cost_center_id: $('[data-cc]', tr).value || null } };
      if (e.target.closest('[data-unlink]')) body = { unlink: true };
      if (!body) return;
      try { await api(`${P()}/finance/bank-lines/${id}/match`, { method: 'POST', body }); toast(body.unlink ? 'Conciliación deshecha' : 'Conciliada'); loadLines(); } catch (x) { toast(x.message); }
    });
    loadLines();
  }

  function exportView(el) {
    const t = H.todayCo(), first = t.slice(0, 8) + '01';
    el.innerHTML = `<div class="card" style="max-width:720px"><h2>Exportar para el contador</h2>
      <p class="muted" style="margin:-4px 0 14px;font-size:13px">Archivos CSV (separados por punto y coma, listos para Excel en español) con todos los movimientos o facturas del periodo, su centro de costo, cuenta y conciliación.</p>
      <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))"><label class="f">Desde<input class="in" type="date" data-from value="${first}"></label><label class="f">Hasta<input class="in" type="date" data-to value="${t}"></label></div>
      <div class="row" style="margin-top:12px"><button class="btn pri" data-x="movements"><i class="ph-light ph-download-simple"></i>Movimientos</button><button class="btn" data-x="invoices"><i class="ph-light ph-download-simple"></i>Facturas</button></div></div>`;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      const qs = new URLSearchParams({ kind: b.dataset.x, from: $('[data-from]', el).value, to: $('[data-to]', el).value });
      const r = await fetch(`/admin/api/${P()}/finance/export?${qs}`, { credentials: 'same-origin' });
      if (!r.ok) { toast('No se pudo exportar'); return; }
      const name = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'export.csv';
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
    });
  }

  function pick() { H.seg($('#fiSeg'), VIEWS, (k) => { view = k; render(); }, view); render(); }
  async function load() {
    try { org = await H.orgPicker($('#fiOrg'), (id) => { org = id; render(); }); } catch (x) { $('#fiView').innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
    if (!$('#fiSeg').children.length) pick(); else render();
  }
  return { show: load };
});
