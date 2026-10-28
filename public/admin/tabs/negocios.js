// Panel Diwilo · pestaña «negocios». La carga admin/core.js la primera vez que se abre.
Admin.tab('negocios', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge, ask, sure } = A;

  /* ---------- NEGOCIOS (las apps de Diwilo) ---------- */
  const ROLE = { owner: 'Dueño', admin: 'Administrador', staff: 'Personal' };
  const USTATUS = { active: 'Activo', invited: 'Invitación pendiente', inactive: 'Inactivo' };
  const fmtCOP = (n) => '$' + fmtN(n);
  const fmtDay = (iso) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  let plat = null, bizHome = true, bizApp = 'pedidos', biz = [], bizToday = '', bizSel = null;
  let lastMonthIncome = 0;
  const ARCHIVE_DAYS = 20;
  let showArchived = false;

  // Qué puede hacer cada rol (permisos). Residentes tiene el detalle; las demás apps usan el general.
  const PERMS = {
    residentes: {
      owner: 'Todo: configuración, equipo, cobros y cartera, propiedades, unidades y borrar registros. Es el titular de la cuenta.',
      admin: 'Igual que el dueño (configuración, equipo, cobros, borrar), sin ser el titular de la cuenta.',
      staff: 'Operación diaria: unidades, pagos, solicitudes, PQRS, reservas, mascotas y comunicados. No configura, no maneja el equipo, no genera ni anula cobros y no borra.',
    },
    _: {
      owner: 'Todo, incluida la configuración y el equipo. Es el titular de la cuenta.',
      admin: 'Administra el negocio y el equipo, sin ser el titular.',
      staff: 'Uso diario de la app, sin configuración ni manejo del equipo.',
    },
  };
  const permText = (role) => (PERMS[bizApp] || PERMS._)[role] || PERMS._[role] || '';
  const ICON = { owner: 'bi-award', admin: 'bi-shield-check', staff: 'bi-person' };

  // Editor de bloqueo: fecha hasta la que la app funciona (inclusive) o "No bloquear".
  function lockHtml(b) {
    const free = !b.paid_until;
    return `<form class="lock" data-lock="${esc(b.id)}">
      <h3 style="margin:0">Bloqueo de la app</h3>
      <label class="nolock"><input type="checkbox" name="nolock" ${free ? 'checked' : ''}> No bloquear (sin fecha límite, no se cobra)</label>
      <label class="dw-field">Activa hasta (incluido)<input class="form-control" type="date" name="paid_until" value="${esc(b.paid_until || '')}" ${free ? 'disabled' : ''}></label>
      <div class="chips">
        <button class="btn btn-sm btn-outline-secondary" type="button" data-add="1">+1 mes</button><button class="btn btn-sm btn-outline-secondary" type="button" data-add="3">+3 meses</button>
        <button class="btn btn-sm btn-outline-secondary" type="button" data-add="12">+1 año</button><button class="btn btn-sm btn-outline-danger" type="button" data-lockNow>Bloquear ya</button>
      </div>
      <p class="when" data-when></p>
      <div class="dw-row"><button class="btn btn-primary btn-sm" type="submit"><i class="bi bi-check-lg"></i>Guardar bloqueo</button><span class="text-danger small" data-err></span></div>
    </form>`;
  }
  function addMonthsIso(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const f = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
    f.setUTCDate(Math.min(d, last));
    return f.toISOString().slice(0, 10);
  }
  const nextDay = (iso) => new Date(Date.parse(iso + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  function lockWhen(f) {
    const free = f.elements.nolock.checked, d = f.elements.paid_until.value;
    f.elements.paid_until.disabled = free;
    $('[data-when]', f).innerHTML = free ? 'La app <b>no se bloquea</b>.'
      : !d ? 'Elige una fecha o marca “No bloquear”.'
      : d < bizToday ? `<b>Bloqueada</b> desde el ${fmtDay(nextDay(d))}: está en solo lectura.`
      : `Funciona normal hasta el <b>${fmtDay(d)}</b> y se bloquea (solo lectura) el <b>${fmtDay(nextDay(d))}</b>.`;
  }
  function wireLock(root) {
    $$('form[data-lock]', root).forEach((f) => {
      lockWhen(f);
      f.addEventListener('input', () => lockWhen(f));
      f.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add]');
        if (add) {
          const cur = f.elements.paid_until.value;
          f.elements.nolock.checked = false;
          f.elements.paid_until.value = addMonthsIso(cur && cur >= bizToday ? cur : bizToday, +add.dataset.add);
          lockWhen(f);
        }
        if (e.target.closest('[data-locknow]')) {
          f.elements.nolock.checked = false;
          f.elements.paid_until.value = new Date(Date.parse(bizToday + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
          lockWhen(f);
        }
      });
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const err = $('[data-err]', f); err.textContent = '';
        const value = f.elements.nolock.checked ? null : f.elements.paid_until.value;
        if (!f.elements.nolock.checked && !value) { err.textContent = 'Elige una fecha o marca “No bloquear”.'; return; }
        const b = biz.find((x) => x.id === f.dataset.lock);
        if (value && value < bizToday && (await ask({ title: 'Bloquear la app', text: `${b.name} quedará en solo lectura desde ya.`, ok: 'Bloquear', danger: true })) === null) return;
        try {
          await api(bizPath(b.id), { method: 'PATCH', body: { paid_until: value } });
          toast(value ? `Activa hasta ${fmtDay(value)}` : 'Sin bloqueo');
          loadBiz();
        } catch (x) { err.textContent = x.message; }
      });
    });
  }

  // Tabla de usuarios con sus permisos. Desde Diwilo solo se maneja al dueño; el equipo se crea en la app.
  function usersHtml(b) {
    if (!b.users.length) return '<p class="text-body-secondary" style="margin:0">Sin usuarios.</p>';
    return `<div class="table-responsive"><table class="utbl"><thead><tr><th>Usuario</th><th>Permisos</th><th>Estado</th><th></th></tr></thead><tbody>
      ${b.users.map((u) => `<tr>
        <td><b style="font-weight:500;color:var(--hi)">${esc(u.name || u.email.split('@')[0])}</b><br><span class="text-body-secondary" style="font-size:12px">${esc(u.email)}</span>
          ${u.role === 'owner' ? `<button class="icon-btn" type="button" data-uemail="${esc(u.id)}" data-biz-id="${esc(b.id)}" title="Cambiar correo del dueño" aria-label="Cambiar el correo de ${esc(u.email)}"><i class="bi bi-pencil"></i></button>` : ''}</td>
        <td><span class="rolechip"><i class="bi ${ICON[u.role] || 'bi-person'}"></i>${ROLE[u.role] || esc(u.role)}</span>
          <span class="perm">${esc(permText(u.role))}</span></td>
        <td><span class="st ${u.status === 'active' ? 'ok' : u.status === 'invited' ? 'soon' : 'free'}">${USTATUS[u.status] || esc(u.status)}</span></td>
        <td style="white-space:nowrap">${u.role === 'owner' ? linkBtn(u, 'data-xlink') : `<button class="btn btn-sm btn-outline-secondary" data-mkowner="${esc(u.id)}" data-biz-id="${esc(b.id)}" title="Le pasa la propiedad del negocio"><i class="bi bi-award"></i>Hacer dueño</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="text-body-secondary" style="margin:8px 0 0;font-size:12px"><i class="bi bi-info-circle"></i> El equipo (administradores y personal) lo crea el dueño o un administrador dentro de la app.</p>`;
  }

  function subState(b, today = bizToday) {
    if (!b.paid_until) return { k: 'free', t: 'Sin límite' };
    if (b.read_only || b.paid_until < today) return { k: 'bad', t: 'Solo lectura' };
    const left = daysBetween(today, b.paid_until);
    return left <= 7 ? { k: 'soon', t: left === 0 ? 'Vence hoy' : `Vence en ${left} d` } : { k: 'ok', t: 'Al día' };
  }
  const appCfg = () => plat.apps.find((a) => a.key === bizApp);
  const bizPath = (id, rest = '') => `platform/${bizApp}/businesses/${encodeURIComponent(id)}${rest}`;

  // kind: 'registro' (aún no tiene contraseña) | 'reset' (restablecer) | 'ingreso' (dirección para entrar)
  const LINK_TEXT = {
    registro: ['Link de registro', 'Al abrirlo crea su contraseña y entra. Sirve una sola vez.', 'Te invito a la app. Crea tu contraseña aquí:'],
    reset: ['Link para restablecer contraseña', 'Al abrirlo elige una contraseña nueva. Sirve una sola vez; su contraseña actual sigue funcionando hasta que lo use.', 'Restablece tu contraseña aquí:'],
    ingreso: ['Link de ingreso', 'Dirección para entrar con correo y contraseña; después de entrar lleva a cada quien a su negocio. Se puede compartir las veces que quieras.', 'Entra a la app aquí:'],
  };
  function inviteHtml(url, who, kind = 'registro') {
    if (!url) return '';
    const [title, hint, wa] = LINK_TEXT[kind];
    return `<div class="newkey"><p style="margin:0 0 6px"><b style="color:var(--hi);font-weight:500">${title}</b>${who ? ` para ${esc(who)}` : ''}. ${hint}</p>
      <code class="font-monospace small" style="font-size:12px;color:var(--hi)">${esc(url)}</code>
      <div class="dw-row" style="margin-top:8px"><button class="btn btn-sm btn-outline-secondary" type="button" data-copy="${esc(url)}"><i class="bi bi-clipboard"></i>Copiar</button>
      <a class="btn btn-sm btn-outline-secondary" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(wa + ' ' + url)}"><i class="bi bi-whatsapp"></i>WhatsApp</a></div></div>`;
  }
  const linkKind = (u) => (u.status === 'active' ? 'reset' : 'registro');
  const linkBtn = (u, attr) => u.status === 'active'
    ? `<button class="btn btn-sm btn-outline-secondary" ${attr}="${esc(u.id)}" title="Genera un link para que elija una contraseña nueva"><i class="bi bi-key"></i>Restablecer contraseña</button>`
    : `<button class="btn btn-sm btn-outline-secondary" ${attr}="${esc(u.id)}" title="Genera el link para que cree su contraseña"><i class="bi bi-envelope"></i>Link de registro</button>`;
  // Dirección general de ingreso de la app (sin token ni negocio): la persona entra con su correo y
  // contraseña y la app la lleva a su negocio (o le deja elegir si tiene varios).
  function loginUrl(b) {
    const base = appCfg().url;
    if (!base) return null;
    // Academia atiende cada negocio en su propia dirección: /<slug>
    return bizApp === 'academia' && b?.slug ? `${base}/${b.slug}` : `${base}/`;
  }
  // Genera (en la app) un link nuevo para crear o restablecer la contraseña de u.
  async function issueLink(b, u, box) {
    const r = await api(bizPath(b.id, '/users'), { method: 'POST', body: { email: u.email, role: u.role } });
    const el = $(box); el.hidden = false; el.innerHTML = inviteHtml(r.invite_url, u.email, linkKind(u));
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function showInvite(url, who, kind) { const el = $('#inviteBox'); el.hidden = !url; el.innerHTML = inviteHtml(url, who, kind); }

  async function loadPlatform() {
    plat = await api('platform');
    drawApps();
  }
  function drawApps() {
    $('#appSeg').innerHTML = `<button class="btn btn-sm btn-outline-secondary ${bizHome && negView === 'negocios' ? 'active' : ''}" data-home title="Resumen de todas las apps"><i class="bi bi-grid"></i>Todas</button>`
      + plat.apps.map((a) => `<button class="btn btn-sm ${a.key === bizApp && !(bizHome && negView === 'negocios') ? 'active' : ''} btn-outline-secondary" data-app="${a.key}">${esc(a.name)}</button>`).join('');
  }
  const APP_ICON = { pedidos: 'bi-bag', nutricion: 'bi-heart-pulse', citas: 'bi-calendar-check', residentes: 'bi-building', academia: 'bi-mortarboard' };
  // Inicio: todas las apps con sus negocios, activos y alertas.
  async function loadHome() {
    const box = $('#homeApps'); $('#homeErr').textContent = '';
    box.innerHTML = '<div class="dw-empty" style="grid-column:1/-1">Cargando…</div>';
    const data = await Promise.all(plat.apps.map(async (a) => {
      if (!a.connected) return { a, list: [], today: '', inc: 0, off: true };
      const d = await api(`platform/${a.key}/businesses`).catch(() => null);
      return { a, list: d?.businesses || [], today: d?.today || '', inc: d?.month_income || 0, err: !d };
    }));
    if (!bizHome) return;
    const rows = data.map((x) => ({ ...x, st: x.list.map((b) => subState(b, x.today)) }));
    const cnt = (x, k) => x.st.filter((s) => s.k === k).length;
    const all = (k) => rows.reduce((n, x) => n + cnt(x, k), 0);
    $('#homeKpis').innerHTML = [['Negocios', fmtN(rows.reduce((n, x) => n + x.list.length, 0))], ['Al día', fmtN(all('ok') + all('free'))], ['Vencen en 7 días', fmtN(all('soon'))],
      ['Solo lectura', fmtN(all('bad'))], ['Cobrado este mes', fmtCOP(rows.reduce((n, x) => n + x.inc, 0))]]
      .map(([l, v]) => `<div class="dw-card kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    box.innerHTML = rows.map((x) => {
      const alert = cnt(x, 'soon') + cnt(x, 'bad');
      return `<button type="button" class="dw-card appcard" data-pick="${esc(x.a.key)}">
        <span class="dw-row" style="gap:12px;flex-wrap:nowrap"><i class="bi ${APP_ICON[x.a.key] || 'bi-app'}" style="font-size:26px;color:var(--lilac)"></i><b style="font-weight:500;color:var(--hi);font-size:16px">${esc(x.a.name)}</b></span>
        <span class="dw-row"><span class="st free">${x.list.length} ${x.list.length === 1 ? 'negocio' : 'negocios'}</span><span class="st ok">${cnt(x, 'ok') + cnt(x, 'free')} al día</span>
          ${x.off ? '<span class="st bad">Sin conectar</span>' : x.err ? '<span class="st bad">Error al cargar</span>' : alert ? `<span class="st soon">${alert} requieren atención</span>` : ''}</span></button>`;
    }).join('');
  }
  $('#homeApps').addEventListener('click', (e) => {
    const c = e.target.closest('[data-pick]'); if (!c) return;
    bizApp = c.dataset.pick; bizHome = false; bizSel = null; bizFilter = 'todos'; bizQ = ''; $('#bizSearch').value = '';
    $('#bizNew').hidden = true; showInvite(null);
    setNegView('negocios');
  });

  async function loadBiz() {
    $('#bizErr').textContent = '';
    $('#bizBody').innerHTML = '<div class="dw-empty" style="grid-column:1/-1">Cargando…</div>';
    const app = appCfg();
    $$('[data-appname]').forEach((e) => { e.textContent = app.name; });
    $('#bizSlug').hidden = !app.slug;
    $('#bizSlug').querySelector('input').required = app.slug === 'required';
    if (!app.connected) {
      biz = []; renderBiz();
      $('#bizErr').textContent = `${app.name} no está conectada: falta el service binding o la URL en wrangler.jsonc.`;
      return;
    }
    try {
      const d = await api(`platform/${bizApp}/businesses`);
      biz = d.businesses; bizToday = d.today; lastMonthIncome = d.month_income;
      renderBiz(d.month_income);
      loadArchived();
    } catch (e) {
      biz = []; renderBiz();
      if (e.message !== 'sesión') $('#bizErr').textContent = e.message;
    }
  }

  // Filtro por estado y búsqueda de la lista (los KPIs y los chips usan el mismo filtro).
  let bizFilter = 'todos', bizQ = '';
  const FILTERS = [['todos', 'Todos'], ['ok', 'Al día'], ['free', 'Sin límite'], ['soon', 'Por vencer'], ['bad', 'Solo lectura']];
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function renderBiz(monthIncome = 0, keepDetail = false) {
    const st = biz.map((b) => subState(b));
    const count = (k) => st.filter((s) => s.k === k).length;
    const tiles = [['Negocios', fmtN(biz.length), 'todos'], ['Al día', fmtN(count('ok') + count('free')), 'ok'],
      ['Vencen en 7 días', fmtN(count('soon')), 'soon'], ['Solo lectura', fmtN(count('bad')), 'bad'],
      ['Cobrado este mes', fmtCOP(monthIncome)]];
    $('#bizKpis').innerHTML = tiles.map(([l, v, f]) => f
      ? `<button type="button" class="dw-card kpi text-start" data-kfilter="${f}" style="cursor:pointer" title="Filtrar la lista"><div class="v">${v}</div><div class="l">${l}</div></button>`
      : `<div class="dw-card kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    $('#bizFilters').innerHTML = FILTERS.map(([k, l]) => `<button type="button" class="btn btn-sm btn-outline-secondary ${k === bizFilter ? 'active' : ''}" data-bfilter="${k}" aria-pressed="${k === bizFilter}">${l} (${k === 'todos' ? biz.length : count(k)})</button>`).join('');
    const q = norm(bizQ.trim());
    const rows = biz.map((b, i) => [b, i]).filter(([b, i]) => (bizFilter === 'todos' || st[i].k === bizFilter)
      && (!q || norm([b.name, b.slug, ...b.users.map((u) => u.email + ' ' + (u.name || ''))].join(' ')).includes(q)));
    $('#bizBody').innerHTML = rows.length ? rows.map(([b, i]) => {
      const owner = b.users.find((u) => u.role === 'owner');
      const s = st[i];
      return `<div class="dw-card bizcard ${b.id === bizSel ? 'sel' : ''}" data-biz="${esc(b.id)}" tabindex="0" role="button" aria-label="Ver ficha de ${esc(b.name)}">
        <div><b style="font-weight:500;color:var(--hi);font-size:15px">${esc(b.name)}</b>${b.slug ? `<br><span class="text-body-secondary font-monospace small">/${esc(b.slug)}</span>` : ''}
          <div class="text-body-secondary" style="font-size:13px;margin-top:2px">${owner ? esc(owner.email) : '—'}</div></div>
        <div><span class="st ${s.k}">${s.t}</span><span class="estado-fecha">${b.paid_until ? `${s.k === 'bad' ? 'Venció' : 'Termina'} ${fmtDay(b.paid_until)}` : 'No se bloquea'}</span>
          ${b.plan?.nombre ? `<div class="text-body-secondary" style="font-size:12px;margin-top:3px">Plan ${esc(b.plan.nombre)}${b.plan.estado === 'error' ? ' · <span style="color:var(--bad)">módulos con error</span>' : ''}</div>` : ''}</div>
        <div class="text-body-secondary" style="font-size:12px">${b.users.length} ${b.users.length === 1 ? 'usuario' : 'usuarios'} · Último pago ${b.last_payment ? fmtDate(b.last_payment) : '—'}</div>
        ${owner ? `<div class="dw-row"><button class="btn btn-sm btn-primary" data-sso="${esc(b.id)}" title="Abre la app con la sesión del dueño, sin contraseña (también si aún no la ha creado)"><i class="bi bi-box-arrow-in-right"></i>Entrar como dueño</button>${linkBtn(owner, 'data-olink')}</div>` : ''}</div>`;
    }).join('') : `<div class="dw-empty" style="grid-column:1/-1">${biz.length ? 'Ningún negocio coincide con el filtro.' : `Aún no hay negocios en ${esc(appCfg().name)}. Crea el primero con “Nuevo negocio”.`}</div>`;
    if (bizSel && biz.some((b) => b.id === bizSel)) { if (!keepDetail) renderDetail(); } else { bizSel = null; $('#bizDetail').hidden = true; }
  }
  const redraw = () => renderBiz(lastMonthIncome, true);
  $('#bizFilters').addEventListener('click', (e) => { const b = e.target.closest('[data-bfilter]'); if (b) { bizFilter = b.dataset.bfilter; redraw(); } });
  $('#bizKpis').addEventListener('click', (e) => { const b = e.target.closest('[data-kfilter]'); if (b) { bizFilter = bizFilter === b.dataset.kfilter ? 'todos' : b.dataset.kfilter; redraw(); } });
  $('#bizSearch').addEventListener('input', (e) => { bizQ = e.target.value; redraw(); });

  /* ---------- Módulos del negocio (plan + excepciones; la API está en worker/src/modulos.js) ---------- */
  const ORIGEN = { plan: ['ok', 'Del plan'], agregado: ['soon', 'Agregado'], quitado: ['bad', 'Quitado'], fuera: ['free', 'No incluido'] };
  const MST = { ok: ['ok', 'Sincronizado'], pendiente: ['soon', 'Pendiente'], error: ['bad', 'Error al enviar'], sin_soporte: ['free', 'App sin módulos'] };
  async function loadMods(b) {
    const box = $('#bizMods'); if (!box) return;
    const app = bizApp, id = b.id;
    let d, planes = [];
    try {
      [d, planes] = await Promise.all([api(`modulos/${app}/negocios/${encodeURIComponent(id)}`), api(`modulos/${app}`).then((x) => x.planes)]);
    } catch (e) {
      // El negocio aún no está en módulos (app sin módulos o sin sincronizar)
      box.innerHTML = `<h3>Módulos</h3><p class="text-body-secondary" style="margin:0 0 10px;font-size:13px">${esc(e.message)}</p><button class="btn btn-sm btn-outline-secondary" data-modsync><i class="bi bi-arrow-clockwise"></i>Sincronizar ${esc(appCfg().name)}</button>`;
      $('[data-modsync]', box).onclick = async (ev) => {
        ev.target.disabled = true;
        try { const r = await api(`modulos/${app}/sincronizar`, { method: 'POST' }); toast(r.soporta === false ? 'Esta app aún no tiene módulos: tiene todo activo' : `${r.revisados} negocios revisados`); } catch (x) { toast(x.message); }
        if (bizSel === id) loadMods(b);
      };
      return;
    }
    if (bizSel !== id || bizApp !== app) return;
    const [sc, st] = MST[d.negocio.estado] || ['free', d.negocio.estado];
    const on = d.modulos.filter((m) => m.activo).length;
    box.innerHTML = `<div class="dw-row" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">Módulos <span class="text-body-secondary" style="font-size:12px;font-weight:400">· ${on} de ${d.modulos.length} activos</span></h3>
        <span class="st ${sc}">${st}</span></div>
      ${d.negocio.error ? `<p class="text-danger small" style="font-size:12px;margin:6px 0 0">${esc(d.negocio.error)}</p>` : ''}
      <form class="dw-row" data-mplan style="gap:8px;margin:12px 0">
        <label class="dw-field" style="min-width:240px;flex:1">Plan<select class="form-select" name="plan_id">${planes.map((p) => `<option value="${p.id}" ${p.id === d.plan_id ? 'selected' : ''}>${esc(p.nombre)} · ${fmtCOP(p.precio)}/mes${p.todos ? ' · todos los módulos' : ''}</option>`).join('')}</select></label>
        <button class="btn btn-primary btn-sm" style="align-self:flex-end">Cambiar plan</button></form>
      <div style="display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${d.modulos.map((m) => {
        const [c, t] = ORIGEN[m.origen];
        return `<div class="dw-card" style="padding:12px;display:grid;gap:6px;${m.activo ? '' : 'opacity:.75'}">
          <div class="dw-row" style="justify-content:space-between;gap:6px"><b style="font-weight:500;color:var(--hi)">${esc(m.nombre)}</b><span class="st ${c}">${t}</span></div>
          <span class="text-body-secondary" style="font-size:12px">${m.tipo === 'compartido' ? 'Diwilo Modulos' : 'Propio de la app'}${m.registros != null ? ` · ${fmtN(m.registros)} registros` : ''}${m.hasta ? ` · hasta ${esc(m.hasta)}` : ''}</span>
          <div>${m.activo ? `<button class="btn btn-sm btn-outline-danger" data-mq="${esc(m.modulo)}">Quitar</button>` : `<button class="btn btn-sm btn-outline-secondary" data-ma="${esc(m.modulo)}">Agregar</button>`}</div></div>`;
      }).join('')}</div>
      ${d.excepciones.length ? `<h3 style="margin:14px 0 6px">Excepciones al plan</h3>${d.excepciones.map((e) => `<div class="urow"><span class="e"><span class="st ${e.modo === 'agregar' ? 'soon' : 'bad'}">${e.modo === 'agregar' ? 'Agregado' : 'Quitado'}</span>
        <b style="font-weight:500">${esc(d.modulos.find((m) => m.modulo === e.modulo)?.nombre || e.modulo)}</b>${e.desde || e.hasta ? ` · ${esc(e.desde || '…')} → ${esc(e.hasta || '…')}` : ''}<br><span style="font-size:12px">${esc(e.nota || '')} · ${esc(e.por || '')}</span></span>
        <button class="btn btn-sm btn-outline-secondary" data-mundo="${e.id}" title="Volver a lo del plan"><i class="bi bi-arrow-counterclockwise"></i></button></div>`).join('')}` : ''}
      <p class="text-body-secondary" style="font-size:12px;margin:10px 0 0">Quitar un módulo no borra sus datos: si se vuelve a activar, todo sigue ahí. Todo cambio queda en la bitácora de Módulos.</p>`;
    const reload = async (r, msg) => { toast(r?.estado === 'error' ? `Guardado, pero la app no respondió: ${r.error}` : msg); loadBiz(); };
    $('[data-mplan]', box).onsubmit = async (e) => {
      e.preventDefault();
      const p = planes.find((x) => x.id === +e.target.plan_id.value);
      if (!p || p.id === d.plan_id) return;
      const pierde = d.modulos.filter((m) => m.activo && m.origen !== 'agregado' && !(p.todos || p.modulos.includes(m.modulo)));
      if (!(await sure(`¿Pasar a «${b.name}» al plan «${p.nombre}» (${fmtCOP(p.precio)}/mes)?${pierde.length ? `\n\nDejará de ver: ${pierde.map((m) => m.nombre + (m.registros ? ` (${fmtN(m.registros)} registros, no se borran)` : '')).join(', ')}.` : ''}`, 'Cambiar plan', !!pierde.length))) return;
      try { await reload(await api(`modulos/${app}/negocios/${encodeURIComponent(id)}`, { method: 'PUT', body: { plan_id: p.id } }), 'Plan cambiado'); } catch (x) { toast(x.message); }
    };
    box.addEventListener('click', async (e) => {
      const q = e.target.closest('[data-mq]'), a = e.target.closest('[data-ma]'), u = e.target.closest('[data-mundo]');
      if (u) {
        if (!(await sure('¿Quitar esta excepción? El negocio vuelve a tener lo de su plan.', 'Quitar excepción', false))) return;
        try { await reload(await api(`modulos/${app}/negocios/${encodeURIComponent(id)}/excepciones/${u.dataset.mundo}`, { method: 'DELETE' }), 'Vuelve a lo del plan'); } catch (x) { toast(x.message); }
        return;
      }
      if (!q && !a) return;
      const m = d.modulos.find((x) => x.modulo === (q ? q.dataset.mq : a.dataset.ma)), modo = q ? 'quitar' : 'agregar';
      const nota = await ask({ title: `${q ? 'Quitar' : 'Agregar'} «${m.nombre}»`, input: true, ok: q ? 'Quitar' : 'Agregar', danger: !!q, placeholder: q ? 'Motivo: pidió bajar de plan, no lo usa…' : 'Motivo: prueba de 30 días, cortesía…',
        text: `${q && m.registros ? `Tiene ${fmtN(m.registros)} registros en este módulo: no se borran.\n` : ''}Escribe el motivo (queda en la bitácora). Para ponerle fechas usa Módulos → Negocios.` });
      if (nota === null) return;
      if (!nota) { toast('Escribe el motivo'); return; }
      try { await reload(await api(`modulos/${app}/negocios/${encodeURIComponent(id)}/excepciones`, { method: 'POST', body: { modulo: m.modulo, modo, nota } }), q ? 'Módulo quitado' : 'Módulo agregado'); } catch (x) { toast(x.message); }
    });
  }

  /* ---------- Bitácora del negocio: cambios de plan y módulos + pagos ---------- */
  const BIZ_TABS = [['negocio', 'Negocio', 'bi-shop'], ['plan', 'Plan', 'bi-credit-card'], ['modulos', 'Módulos', 'bi-grid-1x2'], ['bitacora', 'Bitácora', 'bi-clock-history']];
  let bizTab = 'negocio';
  async function loadLog(b) {
    const box = $('#bizLog'); if (!box) return;
    const app = bizApp;
    try {
      const [lg, pays] = await Promise.all([api(`modulos/bitacora?app=${app}`).catch(() => ({ rows: [] })), api(bizPath(b.id, '/payments')).catch(() => [])]);
      if (bizSel !== b.id || bizApp !== app) return;
      const items = [...lg.rows.filter((r) => r.business_id === b.id).map((r) => ({ ts: r.ts, text: r.accion, who: r.por || '' })),
        ...pays.map((p) => ({ ts: p.ts, text: `Pago registrado · ${fmtCOP(p.amount)} · ${p.months} ${p.months === 1 ? 'mes' : 'meses'}${p.note ? ' · ' + p.note : ''} (hasta ${fmtDay(p.paid_until_after)})`, who: '' }))]
        .sort((x, y) => Date.parse(y.ts) - Date.parse(x.ts) || y.ts - x.ts);
      box.innerHTML = '<h3>Bitácora</h3>' + (items.length ? items.map((l) => `<div class="urow"><span class="e">${esc(l.text)}<br><span class="text-body-secondary" style="font-size:12px">${fmtDate(l.ts)}${l.who ? ' · ' + esc(l.who) : ''}</span></span></div>`).join('') : '<p class="text-body-secondary" style="margin:0">Sin movimientos todavía.</p>');
    } catch (x) { box.innerHTML = `<h3>Bitácora</h3><p class="text-danger small">${esc(x.message)}</p>`; }
  }

  async function renderDetail() {
    const b = biz.find((x) => x.id === bizSel); if (!b) return;
    const app = appCfg(), s = subState(b), price = b.plan?.precio ?? plat.prices[bizApp] ?? 0;
    const el = $('#bizDetail'); el.hidden = false;
    el.innerHTML = `<div class="dw-row" style="justify-content:space-between">
        <h2>${esc(b.name)} <span class="text-body-secondary" style="font-size:13px">· ${esc(app.name)}</span></h2>
        <div class="dw-row">${b.users.some((u) => u.role === 'owner') ? `<button class="btn btn-sm btn-primary" data-sso="${esc(b.id)}"><i class="bi bi-box-arrow-in-right"></i>Entrar como dueño</button>` : ''}${loginUrl(b) ? `<button class="btn btn-sm btn-outline-secondary" data-loginlink><i class="bi bi-box-arrow-in-right"></i>Link de ingreso</button>` : ''}${app.url && b.slug && bizApp === 'citas' ? `<a class="btn btn-sm btn-outline-secondary" target="_blank" rel="noopener" href="${esc(app.url)}/${esc(b.slug)}"><i class="bi bi-box-arrow-up-right"></i>Ver reservas</a>` : ''}<button class="btn btn-sm btn-outline-secondary" data-close>Cerrar</button></div></div>
      <div class="btn-group" id="bizTabs" role="tablist" aria-label="Detalle del negocio" style="margin:14px 0 0">${BIZ_TABS.map(([k, l, ic]) => `<button type="button" role="tab" class="btn btn-sm btn-outline-secondary ${k === bizTab ? 'active' : ''}" aria-selected="${k === bizTab}" data-btab="${k}"><i class="bi ${ic}"></i>${l}</button>`).join('')}</div>
      <div data-bpane="negocio" ${bizTab === 'negocio' ? '' : 'hidden'}><div class="bizgrid">
        <div class="sub">
          <h3>Usuarios</h3>
          <div id="bizUsers">${usersHtml(b)}</div>
          <div id="userInvite"></div>
          <form class="dw-form" id="userForm" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
            <p class="text-body-secondary dw-full" style="margin:0;font-size:12px">Cambiar el dueño: se le envía un link para crear su contraseña. El dueño actual queda como ${app.roles.includes('admin') ? 'administrador' : 'personal'}.</p>
            <label class="dw-field">Correo del nuevo dueño<input class="form-control" type="email" name="email" required></label>
            <label class="dw-field">Nombre<input class="form-control" name="name" maxlength="100"></label>
            <div class="dw-row dw-full"><button class="btn btn-outline-secondary" type="submit"><i class="bi bi-award"></i>Asignar como dueño</button><span class="text-danger small" data-err></span></div>
          </form>
        </div>
        <div class="sub">
          <h3>Datos</h3>
          <form class="dw-row" id="renameForm" style="flex-wrap:nowrap"><input class="form-control" name="name" value="${esc(b.name)}" maxlength="120" required aria-label="Nombre"><button class="btn btn-sm btn-outline-secondary" type="submit">Renombrar</button></form>
          ${b.slug ? `<form id="slugForm" style="display:grid;gap:6px">
            <label class="text-body-secondary" for="slugIn" style="font-size:12px">Dirección del negocio · <span class="font-monospace small">${esc((app.url || '').replace(/^https?:\/\//, ''))}/…</span></label>
            <div class="dw-row" style="flex-wrap:nowrap"><input class="form-control font-monospace small" id="slugIn" name="slug" value="${esc(b.slug)}" maxlength="40" pattern="[a-z0-9\-]{3,40}" required spellcheck="false" autocomplete="off"><button class="btn btn-sm btn-outline-secondary" type="submit">Cambiar</button></div>
            <span class="text-body-secondary" style="font-size:12px">Los links y QR con la dirección vieja siguen funcionando: redirigen a la nueva.</span></form>` : ''}
          <p class="text-body-secondary" style="margin:0;font-size:12px">Creado ${fmtDay(b.created_at.slice(0, 10))} · Total cobrado ${fmtCOP(b.total_paid)}</p>
          <h3 style="margin-top:6px">Eliminar</h3>
          <p class="text-body-secondary" style="margin:0;font-size:12px">Se archiva: nadie puede entrar y sale de la lista. Se puede restaurar durante ${ARCHIVE_DAYS} días; después se borra con todos sus datos.</p>
          <button class="btn btn-sm btn-outline-danger" type="button" data-archive="${esc(b.id)}"><i class="bi bi-trash"></i>Eliminar negocio</button>
        </div>
      </div></div>
      <div data-bpane="plan" ${bizTab === 'plan' ? '' : 'hidden'}><div class="bizgrid">
        <div class="sub">
          <h3>Suscripción</h3>
          <div class="dw-row"><span class="st ${s.k}">${s.t}</span><span class="text-body-secondary">Pagado hasta ${fmtDay(b.paid_until)}</span></div>
          ${b.plan?.nombre ? `<p class="text-body-secondary" style="margin:6px 0 0;font-size:13px">Plan <b>${esc(b.plan.nombre)}</b> · ${fmtCOP(b.plan.precio)}/mes${b.plan.estado === 'error' ? ' · <span style="color:var(--bad)">los módulos no se pudieron enviar</span>' : ''}</p>` : ''}
          <form class="dw-form" id="payForm" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
            <label class="dw-field">Meses<input class="form-control" type="number" name="months" min="1" max="24" value="1" required></label>
            <label class="dw-field">Monto (COP)<input class="form-control" type="number" name="amount" min="0" step="1000" value="${price}"></label>
            <label class="dw-field dw-full">Nota<input class="form-control" name="note" maxlength="300" placeholder="Transferencia, Nequi…"></label>
            <div class="dw-row dw-full"><button class="btn btn-primary" type="submit"><i class="bi bi-currency-dollar"></i>Registrar pago</button><span class="text-danger small" data-err></span></div>
          </form>
          ${lockHtml(b)}
        </div>
        <div class="sub">
          <h3>Historial de pagos</h3>
          <div id="payHist" class="text-body-secondary">Cargando…</div>
        </div>
      </div></div>
      <div data-bpane="modulos" ${bizTab === 'modulos' ? '' : 'hidden'}><div class="sub" id="bizMods" style="margin-top:14px"><h3>Módulos</h3><p class="text-body-secondary" style="margin:0">Cargando…</p></div></div>
      <div data-bpane="bitacora" ${bizTab === 'bitacora' ? '' : 'hidden'}><div class="sub" id="bizLog" style="margin-top:14px"><h3>Bitácora</h3><p class="text-body-secondary" style="margin:0">Cargando…</p></div></div>`;
    wireLock(el);
    loadMods(b);
    if (bizTab === 'bitacora') loadLog(b);
    const pay = $('#payForm', el);
    pay.elements.months.addEventListener('input', () => { pay.elements.amount.value = price * (parseInt(pay.elements.months.value, 10) || 0); });
    try {
      const h = await api(bizPath(b.id, '/payments'));
      $('#payHist', el).innerHTML = h.length ? h.map((p) => `<div class="urow"><span class="e">${fmtCOP(p.amount)} · ${p.months} ${p.months === 1 ? 'mes' : 'meses'}${p.note ? ' · ' + esc(p.note) : ''}<br><span style="font-size:12px">${fmtDate(p.ts)} → hasta ${fmtDay(p.paid_until_after)}</span></span></div>`).join('') : 'Sin pagos registrados.';
    } catch { $('#payHist', el).textContent = 'No se pudo cargar.'; }
  }



  const load = async () => {
    try { if (!plat) await loadPlatform(); } catch (e) { $('#bizErr').textContent = e.message; return; }
    loadBiz();
  };
  $('#appSeg').addEventListener('click', (e) => {
    if (e.target.closest('[data-home]')) { bizHome = true; bizSel = null; setNegView('negocios'); return; }
    const b = e.target.closest('[data-app]'); if (!b) return;
    bizApp = b.dataset.app; bizHome = false; bizSel = null; $('#bizNew').hidden = true; showInvite(null);
    if (showArchived) $('#bizArchived').innerHTML = '<p class="text-body-secondary" style="margin:0">Cargando…</p>';
    if (negView !== 'negocios') { drawApps(); modsView(); } else setNegView('negocios');
  });
  $('#bizNewBtn').addEventListener('click', async () => {
    const f = $('#bizNew'); f.hidden = false; f.reset(); f.elements.trial_days.value = plat.trials?.[bizApp] ?? plat.trial_days; f.elements.name.focus();
    // Plan de módulos (si la app ya maneja módulos)
    const box = $('#bizPlan'); box.hidden = true;
    try {
      const d = await api(`modulos/${bizApp}`);
      if (d.soporta && d.planes.length) {
        f.elements.plan_id.innerHTML = d.planes.map((p) => `<option value="${p.id}" ${p.por_defecto ? 'selected' : ''}>${esc(p.nombre)} · ${fmtCOP(p.precio)}/mes</option>`).join('');
        box.hidden = false;
      }
    } catch {}
  });
  $('[data-cancel]', $('#bizNew')).addEventListener('click', () => { $('#bizNew').hidden = true; });
  $('#bizNew').addEventListener('submit', async (e) => {
    e.preventDefault(); const err = $('[data-err]', e.target); err.textContent = '';
    const body = formData(e.target);
    try {
      const r = await api(`platform/${bizApp}/businesses`, { method: 'POST', body });
      e.target.hidden = true; toast('Negocio creado');
      showInvite(r.invite_url, body.owner_email, 'registro');
      bizSel = r.id; await loadBiz();
    } catch (x) { err.textContent = x.message; }
  });
  $('#bizBody').addEventListener('click', (e) => {
    const tr = e.target.closest('[data-biz]'); if (!tr) return;
    bizSel = tr.dataset.biz; $$('#bizBody [data-biz]').forEach((x) => x.classList.toggle('sel', x === tr));
    renderDetail(); $('#bizDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  // Botón "Link de registro / Restablecer contraseña" del dueño, directo en la tabla.
  $('#bizBody').addEventListener('keydown', (e) => { const c = e.target.closest('[data-biz]'); if (c && e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); c.click(); } });
  $('#bizBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-olink]'); if (!btn) return;
    e.stopImmediatePropagation();
    const b = biz.find((x) => x.users.some((u) => u.id === btn.dataset.olink));
    const u = b.users.find((x) => x.id === btn.dataset.olink);
    btn.disabled = true;
    try { await issueLink(b, u, '#inviteBox'); } catch (x) { toast(x.message); } finally { btn.disabled = false; }
  }, true);
  $('#bizDetail').addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) { bizSel = null; $('#bizDetail').hidden = true; $$('#bizBody [data-biz]').forEach((x) => x.classList.remove('sel')); return; }
    const b = biz.find((x) => x.id === bizSel);
    const tb = e.target.closest('[data-btab]');
    if (tb) {
      bizTab = tb.dataset.btab;
      $$('[data-btab]', $('#bizDetail')).forEach((x) => { const on = x === tb; x.classList.toggle('active', on); x.setAttribute('aria-selected', on); });
      $$('[data-bpane]', $('#bizDetail')).forEach((x) => { x.hidden = x.dataset.bpane !== bizTab; });
      if (bizTab === 'bitacora') loadLog(b);
      return;
    }
    if (e.target.closest('[data-loginlink]')) { const el = $('#userInvite'); el.innerHTML = inviteHtml(loginUrl(b), b.name, 'ingreso'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    const inv = e.target.closest('[data-uinvite], [data-xlink]');
    if (inv) {
      const u = b.users.find((x) => x.id === (inv.dataset.uinvite || inv.dataset.xlink));
      inv.disabled = true;
      try { await issueLink(b, u, '#userInvite'); } catch (x) { toast(x.message); } finally { inv.disabled = false; }
      return;
    }
  });
  $('#bizDetail').addEventListener('submit', async (e) => {
    if (e.target.matches('form[data-lock]')) return;
    e.preventDefault(); const f = e.target, b = biz.find((x) => x.id === bizSel), err = $('[data-err]', f);
    if (err) err.textContent = '';
    try {
      if (f.id === 'payForm') {
        const r = await api(bizPath(b.id, '/payments'), { method: 'POST', body: formData(f) });
        toast('Pago registrado: hasta ' + fmtDay(r.paid_until));
      } else if (f.id === 'slugForm') {
        const slug = f.elements.slug.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
        if (slug === b.slug) return;
        const ok = await ask({ title: 'Cambiar la dirección', text: `${b.name} pasará de /${b.slug} a /${slug}. La dirección vieja redirige a la nueva, así que los links y QR que ya compartieron siguen funcionando.`, ok: 'Cambiar dirección' });
        if (ok === null) return;
        await api(bizPath(b.id), { method: 'PATCH', body: { slug } });
        toast(`Dirección cambiada: /${slug}`);
      } else if (f.id === 'renameForm') {
        await api(bizPath(b.id), { method: 'PATCH', body: { name: f.elements.name.value.trim() } });
        toast('Nombre actualizado');
      } else if (f.id === 'userForm') {
        const body = formData(f);
        const cur = b.users.find((u) => u.role === 'owner');
        if (cur && cur.email !== body.email.toLowerCase() && (await ask({ title: 'Cambiar el dueño', text: `${body.email} será el dueño de ${b.name}. ${cur.email} quedará como ${appCfg().roles.includes('admin') ? 'administrador' : 'personal'}.`, ok: 'Asignar dueño' })) === null) return;
        const r = await api(bizPath(b.id, '/users'), { method: 'POST', body });
        await loadBiz();
        $('#userInvite').innerHTML = inviteHtml(r.invite_url, body.email, 'registro');
        toast('Dueño asignado');
        return;
      }
      loadBiz();
    } catch (x) { if (err) err.textContent = x.message; else toast(x.message); }
  });
  document.addEventListener('click', (e) => { const c = e.target.closest('#inviteBox [data-copy], #userInvite [data-copy], [data-xinvite] [data-copy]'); if (c) copy(c.dataset.copy); });

  // Pasar la propiedad a alguien del equipo.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-mkowner]'); if (!btn) return;
    e.stopImmediatePropagation();
    const b = biz.find((x) => x.id === btn.dataset.bizId), u = b?.users.find((x) => x.id === btn.dataset.mkowner);
    if (!u) return;
    const cur = b.users.find((x) => x.role === 'owner');
    if ((await ask({ title: 'Pasar la propiedad', text: `${u.email} será el dueño de ${b.name}.${cur ? ` ${cur.email} quedará como ${appCfg().roles.includes('admin') ? 'administrador' : 'personal'}.` : ''}`, ok: 'Hacer dueño' })) === null) return;
    btn.disabled = true;
    try { await api(bizPath(b.id, `/users/${encodeURIComponent(u.id)}`), { method: 'PATCH', body: { role: 'owner' } }); toast(`${u.email} ahora es el dueño`); loadBiz(); }
    catch (x) { toast(x.message); btn.disabled = false; }
  }, true);

  /* ---------- eliminar (archivar), archivados, correo y entrar como dueño ---------- */
  // Entrar como el dueño: la pestaña se abre ya (para que el navegador no la bloquee) y luego se le da la dirección.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-sso]'); if (!btn) return;
    e.stopImmediatePropagation();
    const w = window.open('about:blank', '_blank');
    btn.disabled = true;
    try {
      const r = await api(bizPath(btn.dataset.sso, '/sso'), { method: 'POST' });
      if (w) { w.opener = null; w.location.href = r.url; } else location.href = r.url;
    } catch (x) { if (w) w.close(); toast(x.message); }
    finally { btn.disabled = false; }
  }, true);

  // Cambiar el correo de un usuario (en la tabla y en el detalle).
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-uemail]'); if (!btn) return;
    e.stopImmediatePropagation();
    const b = biz.find((x) => x.id === btn.dataset.bizId), u = b?.users.find((x) => x.id === btn.dataset.uemail);
    if (!u) return;
    const mail = await ask({ title: 'Cambiar correo', text: `Nuevo correo para ${u.name || u.email}. Con él entrará a la app; la contraseña no cambia.`, input: true, value: u.email, ok: 'Guardar correo' });
    if (!mail || mail.toLowerCase() === u.email) return;
    try {
      await api(bizPath(b.id, `/users/${encodeURIComponent(u.id)}`), { method: 'PATCH', body: { new_email: mail.trim().toLowerCase() } });
      toast('Correo actualizado'); loadBiz();
    } catch (x) { toast(x.message); }
  }, true);

  // Eliminar = archivar. Se confirma escribiendo el nombre del negocio.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-archive]'); if (!btn) return;
    const b = biz.find((x) => x.id === btn.dataset.archive); if (!b) return;
    const typed = await ask({
      title: `Eliminar «${b.name}»`,
      text: `Nadie de ${appCfg().name} podrá entrar desde ya. Durante ${ARCHIVE_DAYS} días lo puedes restaurar en «Archivados»; después se borran el negocio, sus usuarios y todos sus datos.\n\nEscribe el nombre del negocio para confirmar:`,
      input: true, placeholder: b.name, ok: 'Eliminar negocio', danger: true, match: b.name,
    });
    if (typed === null) return;
    btn.disabled = true;
    try {
      const r = await api(bizPath(b.id), { method: 'DELETE' });
      toast(`Archivado. Se borra el ${fmtDay(r.purge_on)}`);
      bizSel = null; $('#bizDetail').hidden = true; loadBiz();
    } catch (x) { toast(x.message); btn.disabled = false; }
  });

  async function loadArchived() {
    const el = $('#bizArchived');
    try {
      const d = await api(`platform/${bizApp}/businesses?archived=1`);
      setBadge('bizArchCount', d.businesses.length);
      if (!showArchived) return;
      el.innerHTML = `<div class="dw-row" style="justify-content:space-between;margin-bottom:10px"><h2>Archivados en ${esc(appCfg().name)}</h2><span class="text-body-secondary" style="font-size:12px">Se borran solos, con todos sus datos, a los ${ARCHIVE_DAYS} días</span></div>`
        + (d.businesses.length ? `<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Negocio</th><th>Dueño</th><th>Archivado</th><th>Se borra</th><th></th></tr></thead><tbody>${d.businesses.map((b) => {
          const owner = b.users.find((u) => u.role === 'owner');
          const left = b.purge_on ? daysBetween(d.today, b.purge_on) : null;
          return `<tr><td><b style="font-weight:500;color:var(--hi)">${esc(b.name)}</b></td><td>${owner ? esc(owner.email) : '—'}</td>
            <td class="text-body-secondary">${b.archived_at ? fmtDate(Date.parse(b.archived_at)) : '—'}</td>
            <td><span class="st ${left !== null && left <= 3 ? 'bad' : 'soon'}">${b.purge_on ? `${fmtDay(b.purge_on)}${left !== null ? ` · ${left <= 0 ? 'hoy' : `en ${left} d`}` : ''}` : '—'}</span></td>
            <td><button class="btn btn-sm btn-outline-secondary" data-restore="${esc(b.id)}"><i class="bi bi-arrow-counterclockwise"></i>Restaurar</button></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="text-body-secondary" style="margin:0">No hay negocios archivados.</p>');
    } catch (x) { if (showArchived) el.innerHTML = `<p class="text-danger small">${esc(x.message)}</p>`; }
  }
  $('#bizArchBtn').addEventListener('click', () => {
    showArchived = !showArchived;
    $('#bizArchBtn').classList.toggle('active', showArchived);
    $('#bizArchBtn').setAttribute('aria-pressed', showArchived);
    $('#bizArchived').hidden = !showArchived;
    if (showArchived) { $('#bizArchived').innerHTML = '<p class="text-body-secondary" style="margin:0">Cargando…</p>'; loadArchived(); }
  });
  $('#bizArchived').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-restore]'); if (!btn) return;
    btn.disabled = true;
    try { await api(bizPath(btn.dataset.restore, '/restore'), { method: 'POST' }); toast('Negocio restaurado'); loadBiz(); }
    catch (x) { toast(x.message); btn.disabled = false; }
  });

  /* ---------- vistas: Negocios | Planes | Catálogo | Bitácora (los módulos viven aquí) ---------- */
  const NEG_VIEWS = [['negocios', 'Negocios', 'bi-buildings'], ['planes', 'Planes', 'bi-layers'], ['catalogo', 'Módulos', 'bi-grid-1x2'], ['bitacora', 'Bitácora', 'bi-clock-history']];
  let negView = 'negocios';
  const canNeg = () => A.me?.owner || A.me?.modules.includes('negocios');
  const canMods = () => A.me?.owner || A.me?.modules.includes('modulos');
  function drawSeg() {
    $('#negSeg').innerHTML = NEG_VIEWS.filter(([k]) => (k === 'negocios' ? canNeg() : canMods()))
      .map(([k, l, i]) => `<button class="btn btn-sm ${k === negView ? 'active' : ''} btn-outline-secondary" data-nv="${k}"><i class="bi ${i}"></i>${l}</button>`).join('');
    $('#negSeg').hidden = !(canNeg() && canMods());
  }
  async function modsView() {
    const m = await A.mount('modulos', $('#modHost'));
    await m.tab.setView(bizApp, negView);
  }
  async function setNegView(v) {
    negView = v; if (v !== 'negocios') bizHome = false;
    drawSeg(); drawApps();
    const isNeg = v === 'negocios';
    $('#appHome').hidden = !(isNeg && bizHome);
    $('#bizView').hidden = !isNeg || bizHome; $('#modHost').hidden = isNeg;
    ['bizNewBtn', 'bizArchBtn'].forEach((id) => { $('#' + id).hidden = !isNeg || bizHome; });
    if (isNeg) {
      A.unmount('modulos');
      if (bizHome) return loadHome().catch((x) => { if (x.message !== 'sesión') $('#homeErr').textContent = x.message; });
      return loadBiz();
    }
    $('#bizArchived').hidden = true;
    try { await modsView(); } catch (e) { if (e.message !== 'sesión') toast(e.message); }
  }
  $('#negSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-nv]'); if (b) setNegView(b.dataset.nv); });

  /* ---------- Precios y pruebas: resumen general (por app, por plan y por negocio) en un modal ---------- */
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  async function openPricing() {
    const d = document.createElement('dialog'); d.className = 'ask pricedlg';
    d.innerHTML = '<form method="dialog"><h2>Precios y pruebas</h2><p class="text-body-secondary">Cargando…</p></form>';
    document.body.appendChild(d); d.showModal();
    d.addEventListener('cancel', (e) => { e.preventDefault(); d.close(); d.remove(); });
    const apps = plat.apps;
    const data = await Promise.all(apps.map(async (a) => {
      if (!a.connected) return { a, planes: [], biz: [], today: '' };
      const [mods, bz] = await Promise.all([api(`modulos/${a.key}`).catch(() => null), api(`platform/${a.key}/businesses`).catch(() => null)]);
      return { a, planes: mods?.planes || [], biz: bz?.businesses || [], today: bz?.today || '' };
    }));
    const rows = [];
    for (const { a, biz: list, today } of data) for (const b of list) {
      const price = b.plan?.precio ?? plat.prices[a.key] ?? 0;
      const k = !b.paid_until ? 'free' : (b.read_only || b.paid_until < today) ? 'bad' : daysBetween(today, b.paid_until) <= 7 ? 'soon' : 'ok';
      rows.push({ app: a.name, negocio: b.name, plan: b.plan?.nombre || 'Precio de la app', precio: price, k, hasta: b.paid_until || '', pagos: b.total_paid || 0 });
    }
    const ESTADO = { ok: 'Al día', soon: 'Por vencer', bad: 'Solo lectura', free: 'Sin límite' };
    const mrr = rows.filter((r) => r.k === 'ok' || r.k === 'soon').reduce((n, r) => n + r.precio, 0);
    d.innerHTML = `<form method="dialog">
      <div class="dw-row" style="justify-content:space-between"><h2 style="margin:0">Precios y pruebas</h2><button class="btn-close" type="button" data-no aria-label="Cerrar"></button></div>
      <p class="text-body-secondary" style="margin:6px 0 0">Cada app tiene su precio base y sus días de prueba; cada negocio puede tener un plan con otro precio (se elige en su ficha). El precio se sugiere al registrar un pago y los días de prueba aplican a los negocios nuevos de esa app.</p>
      <div class="dw-grid" style="--min:150px;margin:14px 0">${[['Apps', fmtN(apps.length)], ['Negocios', fmtN(rows.length)], ['Mensual estimado', fmtCOP(mrr)], ['Total cobrado', fmtCOP(rows.reduce((n, r) => n + r.pagos, 0))]]
        .map(([l, v]) => `<div class="dw-card kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
      <h3>Por app <span class="text-body-secondary fw-normal" style="font-size:12px">· editable</span></h3>
      <div class="table-responsive"><table class="table dw-table align-middle"><thead><tr><th>App</th><th style="width:190px">Precio mensual (COP)</th><th style="width:150px">Días de prueba</th><th>Planes</th><th class="text-end">Negocios</th></tr></thead><tbody>
        ${data.map(({ a, planes, biz: list }) => `<tr><td data-label="App" class="dw-td-main"><b>${esc(a.name)}</b>${a.connected ? '' : ' <span class="badge text-bg-secondary fw-normal">sin conectar</span>'}</td>
          <td data-label="Precio mensual"><input class="form-control form-control-sm" type="number" min="0" step="1000" name="price_${a.key}" value="${plat.prices[a.key] || 0}"></td>
          <td data-label="Días de prueba"><input class="form-control form-control-sm" type="number" min="0" max="365" name="trial_${a.key}" value="${plat.trials?.[a.key] ?? plat.trial_days}"></td>
          <td data-label="Planes">${planes.length ? planes.map((p) => `<span class="badge text-bg-secondary fw-normal" title="${p.todos ? 'Todos los módulos' : fmtN(p.modulos.length) + ' módulos'}">${esc(p.nombre)} · ${fmtCOP(p.precio)}</span>`).join(' ') : '<span class="text-body-secondary">Sin planes</span>'}</td>
          <td data-label="Negocios" class="text-end">${fmtN(list.length)}</td></tr>`).join('')}
      </tbody></table></div>
      <h3>Por negocio</h3>
      <div class="table-responsive"><table class="table dw-table align-middle"><thead><tr><th>App</th><th>Negocio</th><th>Plan</th><th class="text-end">Precio / mes</th><th>Estado</th></tr></thead><tbody>
        ${rows.length ? rows.map((r) => `<tr><td data-label="App">${esc(r.app)}</td><td data-label="Negocio" class="dw-td-main"><b>${esc(r.negocio)}</b></td><td data-label="Plan">${esc(r.plan)}</td><td data-label="Precio / mes" class="text-end">${fmtCOP(r.precio)}</td>
          <td data-label="Estado"><span class="st ${r.k}">${ESTADO[r.k]}</span>${r.hasta ? `<span class="estado-fecha">${r.k === 'bad' ? 'Venció' : 'Termina'} ${fmtDay(r.hasta)}</span>` : ''}</td></tr>`).join('') : '<tr><td data-label="" colspan="5" class="dw-empty">Aún no hay negocios.</td></tr>'}
      </tbody></table></div>
      <p class="text-danger small" data-err></p>
      <div class="dw-row" style="justify-content:space-between;margin-top:8px"><button class="btn btn-outline-secondary" type="button" data-csv><i class="bi bi-download"></i>Descargar CSV</button>
        <span class="dw-row"><button class="btn btn-outline-secondary" type="button" data-no>Cerrar</button><button class="btn btn-primary" data-save><i class="bi bi-check-lg"></i>Guardar precios y pruebas</button></span></div></form>`;
    const close = () => { d.close(); d.remove(); };
    $$('[data-no]', d).forEach((b) => (b.onclick = close));
    $('[data-csv]', d).onclick = () => {
      const head = ['App', 'Negocio', 'Plan', 'Precio mensual COP', 'Estado', 'Termina', 'Total cobrado COP'];
      const csv = '\ufeff' + [head, ...rows.map((r) => [r.app, r.negocio, r.plan, r.precio, ESTADO[r.k], r.hasta, r.pagos])].map((l) => l.map(csvCell).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `diwilo-precios-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
    };
    $('form', d).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const body = {}; $$('input[name]', d).forEach((i) => { body[i.name] = i.value.trim(); });
        const r = await api('platform/config', { method: 'POST', body });
        plat.prices = r.prices; plat.trials = r.trials; plat.trial_days = r.trial_days;
        toast('Precios y pruebas guardados'); close();
      } catch (x) { $('[data-err]', d).textContent = x.message; }
    });
  }
  $('#priceBtn').addEventListener('click', () => { if (plat) openPricing().catch((x) => toast(x.message)); });

  const show = async () => {
    try { if (!plat) await loadPlatform(); } catch (e) { $('#bizErr').textContent = e.message; return; }
    let want = null; try { want = sessionStorage.getItem('dwl_neg_view'); sessionStorage.removeItem('dwl_neg_view'); } catch {}
    if (want && NEG_VIEWS.some(([k]) => k === want)) negView = want;
    if (!canNeg()) negView = negView === 'negocios' ? 'planes' : negView;
    if (!canMods() && negView !== 'negocios') negView = 'negocios';
    await setNegView(negView);
  };
  return { show, hide: () => A.unmount('modulos') };
});
