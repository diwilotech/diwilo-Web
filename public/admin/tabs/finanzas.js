// Panel Diwilo · pestaña «Finanzas» (Finance Hub). Funciona por organización: Diwilo o cada negocio.
Admin.tab('finanzas', (A) => {
  const { $, $$, esc, toast, api, rank } = A;
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

  const F = {
    movements: [
      { k: 'kind', label: 'Tipo', type: 'select', options: [['gasto', 'Gasto'], ['ingreso', 'Ingreso']] }, { k: 'date', label: 'Fecha', type: 'date', required: true },
      { k: 'amount', label: 'Monto (COP)', type: 'money', required: true }, { k: 'category', label: 'Categoría', placeholder: 'Nómina, hosting, ventas…' },
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
      { k: 'category', label: 'Tipo', type: 'select', options: Object.entries(REC_CAT) }, { k: 'amount', label: 'Valor (COP)', type: 'money', required: true },
      { k: 'cycle', label: 'Ciclo', type: 'select', options: [['mensual', 'Mensual'], ['anual', 'Anual']] }, { k: 'next_date', label: 'Próximo cobro', type: 'date', required: true },
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
    const el = $('#fiView');
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
          { label: 'Monto', cls: 'num', html: (r) => `<b style="color:${r.kind === 'ingreso' ? 'var(--good)' : 'var(--ink)'}">${r.kind === 'ingreso' ? '+' : '−'}${money(r.amount).replace('$', '$')}</b>` },
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
          { label: 'Valor', cls: 'num', html: (r) => `${money(r.amount)}<br><span class="muted" style="font-size:12px">${esc(r.cycle)}</span>` },
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
    el.innerHTML = '<div data-t></div>';
    const t = H.table({ el: $('[data-t]', el), org: () => org, entity: 'invoices', title: 'factura', newText: 'Nueva factura', refs: ['cost_centers'], fields: F.invoices,
      filters: [{ k: 'kind', options: [['', 'Por cobrar y por pagar'], ['emitida', 'Por cobrar (emitidas)'], ['recibida', 'Por pagar (recibidas)']] }],
      defaults: () => ({ kind: 'emitida', issue_date: H.todayCo(), due_date: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10) }),
      empty: 'Sin facturas. Registra las que emites (cuentas por cobrar) y las que recibes (cuentas por pagar).',
      columns: [
        { label: 'Factura', html: (r) => `<b style="font-weight:500;color:var(--hi)">${esc(r.number || '#' + r.id)}</b><br><span class="muted" style="font-size:12px">${r.kind === 'emitida' ? 'Por cobrar' : 'Por pagar'}</span>` },
        { label: 'Tercero', html: (r) => `${esc(r.counterparty)}${r.tax_id ? `<br><span class="muted mono">${esc(r.tax_id)}</span>` : ''}` },
        { label: 'Emisión', html: (r) => day(r.issue_date) }, { label: 'Vence', html: (r) => day(r.due_date) },
        { label: 'Total', cls: 'num', html: (r) => money(r.total) }, { label: 'Saldo', cls: 'num', html: (r) => money(Math.max(0, r.total - r.paid)) },
        { label: 'Estado', html: (r) => chip(...(INV_STATE[r.state] || ['free', r.state])) }],
      rowActions: (r) => (['pendiente', 'vencida'].includes(r.state) ? `<button class="btn sm" data-act="pay"><i class="ph-light ph-hand-coins"></i>${r.kind === 'emitida' ? 'Registrar cobro' : 'Registrar pago'}</button>` : ''),
      onAction: async (a, r) => {
        if (a !== 'pay') return;
        const out = await H.form({ title: `${r.kind === 'emitida' ? 'Cobro' : 'Pago'} de la factura ${r.number || '#' + r.id}`, org,
          fields: [{ k: 'date', label: 'Fecha', type: 'date', required: true }, { k: 'amount', label: 'Monto (COP)', type: 'money', required: true }, { k: 'account_id', label: 'Cuenta', ref: 'accounts' }],
          values: { date: H.todayCo(), amount: r.total - r.paid } });
        if (!out) return;
        try { await api(`${P()}/invoices/${r.id}/pay`, { method: 'POST', body: out }); toast('Registrado: queda como movimiento ligado a la factura'); t.load(); } catch (x) { toast(x.message); }
      } });
    t.load();
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
