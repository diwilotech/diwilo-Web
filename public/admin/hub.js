// Utilidades de los hubs (Marketing y Finanzas): organización activa, tablas con formulario y formatos.
// Lo usan /admin/tabs/marketing.js y /admin/tabs/finanzas.js.
(() => {
  const { $, $$, esc, api, toast, sure } = Admin;
  const money = (n) => (n == null ? '—' : (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CO'));
  const num = (n) => (n == null ? '—' : Number(n).toLocaleString('es-CO'));
  const pct = (n) => (n == null ? '—' : `${n}%`);
  const day = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const monthName = (ym) => new Date(ym + '-15T12:00:00Z').toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
  const todayCo = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

  /* ---------- organización activa (la misma en Marketing y Finanzas) ---------- */
  let orgs = null, orgsP = null;
  const KEY = 'dwl_hub_org';
  const current = () => { try { return sessionStorage.getItem(KEY) || 'diwilo'; } catch { return 'diwilo'; } };
  const setCurrent = (id) => { try { sessionStorage.setItem(KEY, id); } catch {} };
  async function loadOrgs(force) {
    if (orgs && !force) return orgs;
    orgsP = orgsP && !force ? orgsP : api('hub/orgs').then((d) => { orgs = d; orgsP = null; return d; });
    return orgsP;
  }
  // Selector agrupado por app. onChange(orgId) al cambiar.
  async function orgPicker(el, onChange) {
    const d = await loadOrgs();
    const groups = {};
    for (const o of d.orgs) (groups[o.kind === 'diwilo' ? '' : o.app_name || o.app] ||= []).push(o);
    if (!d.orgs.some((o) => o.id === current())) setCurrent('diwilo');
    el.innerHTML = `<label class="orgpick"><i class="ph-light ph-buildings"></i><select aria-label="Organización">${Object.entries(groups).map(([g, list]) =>
      g ? `<optgroup label="${esc(g)}">${list.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</optgroup>`
        : list.map((o) => `<option value="${esc(o.id)}">${esc(o.name)} · operación propia</option>`).join('')).join('')}</select></label>`
      + (d.errors?.length ? `<span class="muted" style="font-size:12px" title="${esc(d.errors.join(' · '))}"><i class="ph-light ph-warning"></i> Algunas apps no respondieron</span>` : '');
    const sel = $('select', el);
    sel.value = current();
    sel.onchange = () => { setCurrent(sel.value); onChange(sel.value); };
    return current();
  }
  const orgName = (id) => orgs?.orgs.find((o) => o.id === id)?.name || id;

  /* ---------- referencias (nombres de campañas, contactos, centros de costo...) ---------- */
  const refCache = {};
  async function refs(org, entity, force) {
    const k = `${org}/${entity}`;
    if (!refCache[k] || force) refCache[k] = api(`hub/${encodeURIComponent(org)}/${entity}?limit=1000`).then((d) => d.rows);
    return refCache[k];
  }
  const dropRefs = (org, entity) => { delete refCache[`${org}/${entity}`]; };
  const LABEL = { campaigns: 'name', contacts: 'name', cost_centers: 'name', accounts: 'name', deals: 'title', invoices: 'number' };

  /* ---------- formulario en ventana ---------- */
  // fields: [{ k, label, type: text|long|email|url|date|month|money|int|bool|select, options: [[v, label]], ref: 'campaigns', full }]
  function form({ title, fields, values = {}, org, okText = 'Guardar', danger, onDelete }) {
    return new Promise(async (resolve) => {
      const refLists = {};
      for (const f of fields.filter((x) => x.ref)) refLists[f.ref] = await refs(org, f.ref).catch(() => []);
      const d = document.createElement('dialog');
      d.className = 'ask hubdlg';
      const input = (f) => {
        const v = values[f.k] ?? f.default ?? '';
        const req = f.required ? 'required' : '';
        if (f.type === 'long') return `<textarea class="in" name="${f.k}" rows="3" ${req}>${esc(v)}</textarea>`;
        if (f.type === 'bool') return `<label class="row" style="gap:8px;font-size:13px"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}> ${esc(f.check || 'Sí')}</label>`;
        if (f.type === 'select' || f.ref) {
          const opts = f.ref ? [['', f.empty || '—'], ...refLists[f.ref].map((r) => [r.id, r[LABEL[f.ref]] || `#${r.id}`])] : f.options;
          return `<select class="in" name="${f.k}" ${req}>${opts.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
        }
        const type = { date: 'date', month: 'month', money: 'number', int: 'number', email: 'email', url: 'url' }[f.type] || 'text';
        return `<input class="in" type="${type}" name="${f.k}" value="${esc(v)}" ${f.type === 'money' ? 'min="0" step="1"' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${req}>`;
      };
      d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>
        <div class="form hubform">${fields.map((f) => `<label class="f ${f.full || f.type === 'long' ? 'full' : ''}">${esc(f.label)}${f.hint ? ` <span class="muted" style="font-size:11px">${esc(f.hint)}</span>` : ''}${input(f)}</label>`).join('')}</div>
        <p class="err" data-err></p>
        <div class="row" style="justify-content:space-between;margin-top:12px">
          <span>${onDelete ? '<button class="btn sm danger" type="button" data-del><i class="ph-light ph-trash"></i>Borrar</button>' : ''}</span>
          <span class="row"><button class="btn" type="button" data-no>Cancelar</button><button class="btn ${danger ? 'danger' : 'pri'}" data-yes>${esc(okText)}</button></span></div></form>`;
      document.body.appendChild(d);
      const close = (v) => { d.close(); d.remove(); resolve(v); };
      $('[data-no]', d).onclick = () => close(null);
      d.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
      if (onDelete) $('[data-del]', d).onclick = async () => { if (await sure('¿Borrar este registro? No se puede deshacer.', 'Borrar')) { try { await onDelete(); close('deleted'); } catch (x) { $('[data-err]', d).textContent = x.message; } } };
      $('form', d).addEventListener('submit', (e) => {
        e.preventDefault();
        const out = {};
        for (const f of fields) {
          const el = $(`[name="${f.k}"]`, d);
          out[f.k] = f.type === 'bool' ? el.checked : el.value.trim();
        }
        close(out);
      });
      d.showModal();
      $('input, select, textarea', d)?.focus();
    });
  }

  /* ---------- tabla de una entidad con buscar, crear, editar y borrar ---------- */
  // cfg: { el, org(), entity, title, newText, columns: [{ label, html(row, R), cls }], fields, filters: [{ k, options }], rowActions(row) -> html, onAction(name, row), defaults(), onChanged() }
  function table(cfg) {
    // Contenedor propio: los escuchadores quedan en él y se van con él.
    const host = document.createElement('div');
    cfg.el.replaceChildren(host);
    cfg = { ...cfg, el: host };
    const st = { q: '', f: {}, rows: [] };
    const R = {}; // referencias cargadas para mostrar nombres
    cfg.el.innerHTML = `<div class="row hubbar">
        <input class="in" data-q placeholder="Buscar…" style="max-width:240px">
        ${(cfg.filters || []).map((f) => `<select class="in" data-f="${f.k}" style="width:auto">${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`).join('')}
        <span class="grow"></span>${cfg.extraButtons || ''}
        ${cfg.readOnly ? '' : `<button class="btn pri" data-new><i class="ph-light ph-plus"></i>${esc(cfg.newText || 'Nuevo')}</button>`}</div>
      <div class="card tbl-wrap"><table><thead><tr>${cfg.columns.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}${cfg.rowActions ? '<th></th>' : ''}</tr></thead><tbody data-body><tr><td class="empty" colspan="99">Cargando…</td></tr></tbody></table></div>`;
    const base = () => `hub/${encodeURIComponent(cfg.org())}/${cfg.entity}`;
    async function load() {
      const qs = new URLSearchParams({ q: st.q });
      for (const [k, v] of Object.entries(st.f)) if (v) qs.set('f_' + k, v);
      try {
        const [d] = await Promise.all([api(`${base()}?${qs}`), ...(cfg.refs || []).map(async (r) => { R[r] = await refs(cfg.org(), r); })]);
        st.rows = d.rows;
        $('[data-body]', cfg.el).innerHTML = st.rows.length ? st.rows.map((r) => `<tr data-id="${r.id}" style="cursor:pointer">${cfg.columns.map((c) => `<td class="${c.cls || ''}">${c.html(r, R)}</td>`).join('')}${cfg.rowActions ? `<td style="white-space:nowrap" data-stop>${cfg.rowActions(r)}</td>` : ''}</tr>`).join('')
          : `<tr><td class="empty" colspan="99">${esc(cfg.empty || 'Aún no hay registros.')}</td></tr>`;
      } catch (x) { $('[data-body]', cfg.el).innerHTML = `<tr><td class="empty" colspan="99">${esc(x.message)}</td></tr>`; }
    }
    async function edit(row) {
      const vals = row ? { ...row } : { ...(cfg.defaults?.() || {}) };
      const out = await form({ title: row ? `Editar ${cfg.title}` : (cfg.newText || 'Nuevo'), fields: cfg.fields, values: vals, org: cfg.org(),
        onDelete: row && !cfg.noDelete ? () => api(`${base()}/${row.id}`, { method: 'DELETE' }) : null });
      if (out === 'deleted') { toast('Borrado'); changed(); return; }
      if (!out) return;
      try {
        await api(row ? `${base()}/${row.id}` : base(), { method: row ? 'PATCH' : 'POST', body: out });
        toast(row ? 'Guardado' : 'Creado'); changed();
      } catch (x) { toast(x.message); edit(row ? { ...row, ...out } : null); }
    }
    function changed() { dropRefs(cfg.org(), cfg.entity); load(); cfg.onChanged?.(); }
    let t;
    $('[data-q]', cfg.el).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); load(); }, 250); });
    $$('[data-f]', cfg.el).forEach((s) => s.addEventListener('change', () => { st.f[s.dataset.f] = s.value; load(); }));
    $('[data-new]', cfg.el)?.addEventListener('click', () => edit(null));
    cfg.el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const row = st.rows.find((r) => String(r.id) === tr.dataset.id);
      if (act) { cfg.onAction?.(act.dataset.act, row, act); return; }
      if (e.target.closest('[data-stop], a, input, button')) return;
      if (!cfg.readOnly) edit(row); else cfg.onOpen?.(row);
    });
    return { load, edit, rows: () => st.rows };
  }

  /* ---------- gráfico de barras dobles (ingresos/gastos, gasto/leads) ---------- */
  function bars(el, rows, { a = 'a', b = 'b', la = 'A', lb = 'B', fmt = money }) {
    if (!rows.length) { el.innerHTML = '<p class="empty">Sin datos todavía.</p>'; return; }
    const max = Math.max(1, ...rows.flatMap((r) => [r[a], r[b]]));
    el.innerHTML = `<div class="bars2">${rows.map((r) => `<div class="b2${r.projected ? ' proj' : ''}" title="${esc(r.label)} · ${la}: ${fmt(r[a])} · ${lb}: ${fmt(r[b])}${r.projected ? ' (proyectado)' : ''}">
        <div class="b2c"><i class="ba" style="height:${(r[a] / max * 100).toFixed(1)}%"></i><i class="bb" style="height:${(r[b] / max * 100).toFixed(1)}%"></i></div><span>${esc(r.label)}</span></div>`).join('')}</div>
      <div class="legend"><span><i class="ba"></i>${esc(la)}</span><span><i class="bb"></i>${esc(lb)}</span>${rows.some((r) => r.projected) ? '<span><i class="pj"></i>Proyectado</span>' : ''}</div>`;
  }
  // Barra de avance (presupuesto usado, etc.)
  const meter = (used, total) => {
    if (!total) return '<span class="muted">—</span>';
    const p = Math.round((used / total) * 100);
    return `<div class="meter ${p > 100 ? 'over' : p >= 80 ? 'warn' : ''}"><i style="width:${Math.min(100, p)}%"></i></div><span class="muted" style="font-size:12px">${p}%</span>`;
  };
  const kpis = (el, tiles) => { el.innerHTML = tiles.map(([l, v, sub]) => `<div class="card kpi"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="muted" style="font-size:12px;margin-top:4px">${sub}</div>` : ''}</div>`).join(''); };
  const seg = (el, items, onPick, initial) => {
    el.innerHTML = items.map(([k, l, ic]) => `<button class="btn sm ${k === initial ? 'on' : ''}" data-k="${k}">${ic ? `<i class="ph-light ${ic}"></i>` : ''}${esc(l)}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; $$('.btn', el).forEach((x) => x.classList.toggle('on', x === b)); onPick(b.dataset.k); };
  };

  window.Hub = { money, num, pct, day, monthName, todayCo, loadOrgs, orgPicker, orgName, current, refs, dropRefs, form, table, bars, meter, kpis, seg };
})();
