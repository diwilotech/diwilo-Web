// Panel Diwilo · pestaña «negocios». La carga admin/core.js la primera vez que se abre.
Admin.tab('negocios', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge, ask, sure } = A;

  /* ---------- NEGOCIOS (las apps de Diwilo) ---------- */
  const ROLE = { owner: 'Dueño', admin: 'Administrador', staff: 'Personal' };
  const USTATUS = { active: 'Activo', invited: 'Invitación pendiente', inactive: 'Inactivo' };
  const fmtCOP = (n) => '$' + fmtN(n);
  const fmtDay = (iso) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  let plat = null, bizApp = 'pedidos', biz = [], bizToday = '', bizSel = null;
  const bizOpen = new Set(); // negocios con "Ver más" abierto
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
  const ICON = { owner: 'ph-crown-simple', admin: 'ph-shield-check', staff: 'ph-user' };

  // Editor de bloqueo: fecha hasta la que la app funciona (inclusive) o "No bloquear".
  function lockHtml(b) {
    const free = !b.paid_until;
    return `<form class="lock" data-lock="${esc(b.id)}">
      <h3 style="margin:0">Bloqueo de la app</h3>
      <label class="nolock"><input type="checkbox" name="nolock" ${free ? 'checked' : ''}> No bloquear (sin fecha límite, no se cobra)</label>
      <label class="f">Activa hasta (incluido)<input class="in" type="date" name="paid_until" value="${esc(b.paid_until || '')}" ${free ? 'disabled' : ''}></label>
      <div class="chips">
        <button class="btn sm" type="button" data-add="1">+1 mes</button><button class="btn sm" type="button" data-add="3">+3 meses</button>
        <button class="btn sm" type="button" data-add="12">+1 año</button><button class="btn sm danger" type="button" data-lockNow>Bloquear ya</button>
      </div>
      <p class="when" data-when></p>
      <div class="row"><button class="btn pri sm" type="submit"><i class="ph-light ph-check"></i>Guardar bloqueo</button><span class="err" data-err></span></div>
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
    if (!b.users.length) return '<p class="muted" style="margin:0">Sin usuarios.</p>';
    return `<div class="tbl-wrap"><table class="utbl"><thead><tr><th>Usuario</th><th>Permisos</th><th>Estado</th><th></th></tr></thead><tbody>
      ${b.users.map((u) => `<tr>
        <td><b style="font-weight:500;color:var(--hi)">${esc(u.name || u.email.split('@')[0])}</b><br><span class="muted" style="font-size:12px">${esc(u.email)}</span>
          ${u.role === 'owner' ? `<button class="icon-btn" type="button" data-uemail="${esc(u.id)}" data-biz-id="${esc(b.id)}" title="Cambiar correo del dueño" aria-label="Cambiar el correo de ${esc(u.email)}"><i class="ph-light ph-pencil-simple"></i></button>` : ''}</td>
        <td><span class="rolechip"><i class="ph-light ${ICON[u.role] || 'ph-user'}"></i>${ROLE[u.role] || esc(u.role)}</span>
          <span class="perm">${esc(permText(u.role))}</span></td>
        <td><span class="st ${u.status === 'active' ? 'ok' : u.status === 'invited' ? 'soon' : 'free'}">${USTATUS[u.status] || esc(u.status)}</span></td>
        <td style="white-space:nowrap">${u.role === 'owner' ? linkBtn(u, 'data-xlink') : `<button class="btn sm" data-mkowner="${esc(u.id)}" data-biz-id="${esc(b.id)}" title="Le pasa la propiedad del negocio"><i class="ph-light ph-crown-simple"></i>Hacer dueño</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted" style="margin:8px 0 0;font-size:12px"><i class="ph-light ph-info"></i> El equipo (administradores y personal) lo crea el dueño o un administrador dentro de la app.</p>`;
  }

  function subState(b) {
    if (!b.paid_until) return { k: 'free', t: 'Sin límite' };
    if (b.read_only || b.paid_until < bizToday) return { k: 'bad', t: 'Solo lectura' };
    const left = daysBetween(bizToday, b.paid_until);
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
    return `<div class="newkey"><p style="margin:0 0 6px"><b style="color:#fff;font-weight:500">${title}</b>${who ? ` para ${esc(who)}` : ''}. ${hint}</p>
      <code class="mono" style="font-size:12px;color:#fff">${esc(url)}</code>
      <div class="row" style="margin-top:8px"><button class="btn sm" type="button" data-copy="${esc(url)}"><i class="ph-light ph-copy"></i>Copiar</button>
      <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(wa + ' ' + url)}"><i class="ph-light ph-whatsapp-logo"></i>WhatsApp</a></div></div>`;
  }
  const linkKind = (u) => (u.status === 'active' ? 'reset' : 'registro');
  const linkBtn = (u, attr) => u.status === 'active'
    ? `<button class="btn sm" ${attr}="${esc(u.id)}" title="Genera un link para que elija una contraseña nueva"><i class="ph-light ph-key"></i>Restablecer contraseña</button>`
    : `<button class="btn sm" ${attr}="${esc(u.id)}" title="Genera el link para que cree su contraseña"><i class="ph-light ph-envelope-simple"></i>Link de registro</button>`;
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
    $('#appSeg').innerHTML = plat.apps.map((a) => `<button class="btn sm ${a.key === bizApp ? 'on' : ''}" data-app="${a.key}">${esc(a.name)}</button>`).join('');
    $('#priceFields').innerHTML = plat.apps.map((a) => `<label class="f">Precio mensual ${esc(a.name)} (COP)<input class="in" type="number" min="0" step="1000" name="price_${a.key}" value="${plat.prices[a.key] || 0}"></label>`).join('')
      + `<label class="f">Días de prueba<input class="in" type="number" min="0" max="365" name="trial_days" value="${plat.trial_days}"></label>`;
  }

  async function loadBiz() {
    $('#bizErr').textContent = '';
    $('#bizBody').innerHTML = '<tr><td colspan="7" class="empty">Cargando…</td></tr>';
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

  function renderBiz(monthIncome = 0) {
    const st = biz.map(subState);
    const tiles = [['Negocios', fmtN(biz.length)], ['Al día', fmtN(st.filter((s) => s.k === 'ok' || s.k === 'free').length)],
      ['Vencen en 7 días', fmtN(st.filter((s) => s.k === 'soon').length)], ['Solo lectura', fmtN(st.filter((s) => s.k === 'bad').length)],
      ['Cobrado este mes', fmtCOP(monthIncome)]];
    $('#bizKpis').innerHTML = tiles.map(([l, v]) => `<div class="card kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    $('#bizBody').innerHTML = biz.length ? biz.map((b, i) => {
      const owner = b.users.find((u) => u.role === 'owner');
      const open = bizOpen.has(b.id);
      const shown = b.users.slice(0, 2);
      return `<tr data-biz="${esc(b.id)}" class="${b.id === bizSel ? 'sel' : ''}" style="cursor:pointer">
        <td><b style="font-weight:500;color:var(--hi)">${esc(b.name)}</b>${b.slug ? `<br><span class="muted mono">/${esc(b.slug)}</span>` : ''}</td>
        <td>${owner ? esc(owner.email) : '<span class="muted">—</span>'}</td>
        <td><div class="uchips">${shown.map((u) => `<span class="uchip" title="${esc(u.email)} · ${ROLE[u.role] || u.role}"><i class="ph-light ${ICON[u.role] || 'ph-user'}"></i>${esc(u.name || u.email.split('@')[0])}</span>`).join('')}
          ${b.users.length > 2 ? `<span class="muted" style="font-size:12px">+${b.users.length - 2}</span>` : ''}
          <button class="more" type="button" data-more="${esc(b.id)}" aria-expanded="${open}">${open ? 'Ver menos' : 'Ver más'} <i class="ph-light ph-caret-down"></i></button></div></td>
        <td>${b.paid_until ? fmtDay(b.paid_until) : '<span class="muted">No se bloquea</span>'}</td>
        <td><span class="st ${st[i].k}">${st[i].t}</span>${b.plan?.nombre ? `<div class="muted" style="font-size:12px;margin-top:3px">Plan ${esc(b.plan.nombre)}${b.plan.estado === 'error' ? ' · <span style="color:var(--bad)">módulos con error</span>' : ''}</div>` : ''}</td>
        <td class="muted">${b.last_payment ? fmtDate(b.last_payment) : '—'}</td>
        <td style="white-space:nowrap">${owner ? `${owner.status === 'active' ? `<button class="btn sm pri" data-sso="${esc(b.id)}" title="Abre la app con la sesión del dueño, sin contraseña"><i class="ph-light ph-sign-in"></i>Entrar como dueño</button> ` : ''}${linkBtn(owner, 'data-olink')}` : '<span class="muted">—</span>'}</td></tr>
        ${open ? `<tr class="xrow" data-xbiz="${esc(b.id)}"><td colspan="7"><div class="xbox">
          <div><h3 style="margin:8px 0 8px">Usuarios y permisos <span class="muted" style="font-size:12px;font-weight:400">· ${b.users.length}</span></h3>${usersHtml(b)}<div data-xinvite style="margin-top:10px"></div></div>
          <div class="sub" style="margin-top:8px">${lockHtml(b)}</div></div></td></tr>` : ''}`;
    }).join('') : `<tr><td colspan="7" class="empty">Aún no hay negocios en ${esc(appCfg().name)}. Crea el primero con “Nuevo negocio”.</td></tr>`;
    wireLock($('#bizBody'));
    if (bizSel && biz.some((b) => b.id === bizSel)) renderDetail(); else { bizSel = null; $('#bizDetail').hidden = true; }
  }

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
      box.innerHTML = `<h3>Módulos</h3><p class="muted" style="margin:0 0 10px;font-size:13px">${esc(e.message)}</p><button class="btn sm" data-modsync><i class="ph-light ph-arrows-clockwise"></i>Sincronizar ${esc(appCfg().name)}</button>`;
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
    box.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">Módulos <span class="muted" style="font-size:12px;font-weight:400">· ${on} de ${d.modulos.length} activos</span></h3>
        <span class="st ${sc}">${st}</span></div>
      ${d.negocio.error ? `<p class="err" style="font-size:12px;margin:6px 0 0">${esc(d.negocio.error)}</p>` : ''}
      <form class="row" data-mplan style="gap:8px;margin:12px 0">
        <label class="f" style="min-width:240px;flex:1">Plan<select class="in" name="plan_id">${planes.map((p) => `<option value="${p.id}" ${p.id === d.plan_id ? 'selected' : ''}>${esc(p.nombre)} · ${fmtCOP(p.precio)}/mes${p.todos ? ' · todos los módulos' : ''}</option>`).join('')}</select></label>
        <button class="btn pri sm" style="align-self:flex-end">Cambiar plan</button></form>
      <div style="display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${d.modulos.map((m) => {
        const [c, t] = ORIGEN[m.origen];
        return `<div class="card" style="padding:12px;display:grid;gap:6px;${m.activo ? '' : 'opacity:.75'}">
          <div class="row" style="justify-content:space-between;gap:6px"><b style="font-weight:500;color:var(--hi)">${esc(m.nombre)}</b><span class="st ${c}">${t}</span></div>
          <span class="muted" style="font-size:12px">${m.tipo === 'compartido' ? 'Diwilo Modulos' : 'Propio de la app'}${m.registros != null ? ` · ${fmtN(m.registros)} registros` : ''}${m.hasta ? ` · hasta ${esc(m.hasta)}` : ''}</span>
          <div>${m.activo ? `<button class="btn sm danger" data-mq="${esc(m.modulo)}">Quitar</button>` : `<button class="btn sm" data-ma="${esc(m.modulo)}">Agregar</button>`}</div></div>`;
      }).join('')}</div>
      ${d.excepciones.length ? `<h3 style="margin:14px 0 6px">Excepciones al plan</h3>${d.excepciones.map((e) => `<div class="urow"><span class="e"><span class="st ${e.modo === 'agregar' ? 'soon' : 'bad'}">${e.modo === 'agregar' ? 'Agregado' : 'Quitado'}</span>
        <b style="font-weight:500">${esc(d.modulos.find((m) => m.modulo === e.modulo)?.nombre || e.modulo)}</b>${e.desde || e.hasta ? ` · ${esc(e.desde || '…')} → ${esc(e.hasta || '…')}` : ''}<br><span style="font-size:12px">${esc(e.nota || '')} · ${esc(e.por || '')}</span></span>
        <button class="btn sm" data-mundo="${e.id}" title="Volver a lo del plan"><i class="ph-light ph-arrow-counter-clockwise"></i></button></div>`).join('')}` : ''}
      <p class="muted" style="font-size:12px;margin:10px 0 0">Quitar un módulo no borra sus datos: si se vuelve a activar, todo sigue ahí. Todo cambio queda en la bitácora de Módulos.</p>`;
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

  async function renderDetail() {
    const b = biz.find((x) => x.id === bizSel); if (!b) return;
    const app = appCfg(), s = subState(b), price = b.plan?.precio ?? plat.prices[bizApp] ?? 0;
    const el = $('#bizDetail'); el.hidden = false;
    el.innerHTML = `<div class="row" style="justify-content:space-between">
        <h2>${esc(b.name)} <span class="muted" style="font-size:13px">· ${esc(app.name)}</span></h2>
        <div class="row">${b.users.some((u) => u.role === 'owner' && u.status === 'active') ? `<button class="btn sm pri" data-sso="${esc(b.id)}"><i class="ph-light ph-sign-in"></i>Entrar como dueño</button>` : ''}${loginUrl(b) ? `<button class="btn sm" data-loginlink><i class="ph-light ph-sign-in"></i>Link de ingreso</button>` : ''}${app.url && b.slug && bizApp === 'citas' ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(app.url)}/${esc(b.slug)}"><i class="ph-light ph-arrow-square-out"></i>Ver reservas</a>` : ''}${b.plan?.estado && b.plan.estado !== 'sin_soporte' ? `<button class="btn sm" data-mods><i class="ph-light ph-squares-four"></i>Módulos${b.plan.nombre ? ` · ${esc(b.plan.nombre)}` : ''}</button>` : ''}<button class="btn sm" data-close>Cerrar</button></div></div>
      <div class="bizgrid">
        <div class="sub">
          <h3>Suscripción</h3>
          <div class="row"><span class="st ${s.k}">${s.t}</span><span class="muted">Pagado hasta ${fmtDay(b.paid_until)}</span></div>
          ${b.plan?.nombre ? `<p class="muted" style="margin:6px 0 0;font-size:13px">Plan <b>${esc(b.plan.nombre)}</b> · ${fmtCOP(b.plan.precio)}/mes${b.plan.estado === 'error' ? ' · <span style="color:var(--bad)">los módulos no se pudieron enviar</span>' : ''}</p>` : ''}
          <form class="form" id="payForm" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
            <label class="f">Meses<input class="in" type="number" name="months" min="1" max="24" value="1" required></label>
            <label class="f">Monto (COP)<input class="in" type="number" name="amount" min="0" step="1000" value="${price}"></label>
            <label class="f full">Nota<input class="in" name="note" maxlength="300" placeholder="Transferencia, Nequi…"></label>
            <div class="row full"><button class="btn pri" type="submit"><i class="ph-light ph-currency-circle-dollar"></i>Registrar pago</button><span class="err" data-err></span></div>
          </form>
          ${lockHtml(b)}
        </div>
        <div class="sub">
          <h3>Usuarios</h3>
          <div id="bizUsers">${usersHtml(b)}</div>
          <div id="userInvite"></div>
          <form class="form" id="userForm" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
            <p class="muted full" style="margin:0;font-size:12px">Cambiar el dueño: se le envía un link para crear su contraseña. El dueño actual queda como ${app.roles.includes('admin') ? 'administrador' : 'personal'}.</p>
            <label class="f">Correo del nuevo dueño<input class="in" type="email" name="email" required></label>
            <label class="f">Nombre<input class="in" name="name" maxlength="100"></label>
            <div class="row full"><button class="btn" type="submit"><i class="ph-light ph-crown-simple"></i>Asignar como dueño</button><span class="err" data-err></span></div>
          </form>
        </div>
        <div class="sub">
          <h3>Datos</h3>
          <form class="row" id="renameForm" style="flex-wrap:nowrap"><input class="in" name="name" value="${esc(b.name)}" maxlength="120" required aria-label="Nombre"><button class="btn sm" type="submit">Renombrar</button></form>
          ${b.slug ? `<form id="slugForm" style="display:grid;gap:6px">
            <label class="muted" for="slugIn" style="font-size:12px">Dirección del negocio · <span class="mono">${esc((app.url || '').replace(/^https?:\/\//, ''))}/…</span></label>
            <div class="row" style="flex-wrap:nowrap"><input class="in mono" id="slugIn" name="slug" value="${esc(b.slug)}" maxlength="40" pattern="[a-z0-9\-]{3,40}" required spellcheck="false" autocomplete="off"><button class="btn sm" type="submit">Cambiar</button></div>
            <span class="muted" style="font-size:12px">Los links y QR con la dirección vieja siguen funcionando: redirigen a la nueva.</span></form>` : ''}
          <p class="muted" style="margin:0;font-size:12px">Creado ${fmtDay(b.created_at.slice(0, 10))} · Total cobrado ${fmtCOP(b.total_paid)}</p>
          <h3 style="margin-top:6px">Historial de pagos</h3>
          <div id="payHist" class="muted">Cargando…</div>
          <h3 style="margin-top:6px">Eliminar</h3>
          <p class="muted" style="margin:0;font-size:12px">Se archiva: nadie puede entrar y sale de la lista. Se puede restaurar durante ${ARCHIVE_DAYS} días; después se borra con todos sus datos.</p>
          <button class="btn sm danger" type="button" data-archive="${esc(b.id)}"><i class="ph-light ph-trash"></i>Eliminar negocio</button>
        </div>
      </div>
      <div class="sub" id="bizMods" style="margin-top:14px"><h3>Módulos</h3><p class="muted" style="margin:0">Cargando…</p></div>`;
    wireLock(el);
    loadMods(b);
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
    const b = e.target.closest('[data-app]'); if (!b) return;
    bizApp = b.dataset.app; bizSel = null; $('#bizNew').hidden = true; showInvite(null);
    if (showArchived) $('#bizArchived').innerHTML = '<p class="muted" style="margin:0">Cargando…</p>';
    $$('#appSeg .btn').forEach((x) => x.classList.toggle('on', x === b));
    loadBiz();
  });
  $('#bizNewBtn').addEventListener('click', async () => {
    const f = $('#bizNew'); f.hidden = false; f.reset(); f.elements.trial_days.value = plat.trial_days; f.elements.name.focus();
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
  // "Ver más" / "Ver menos": usuarios, permisos y bloqueo dentro de la tabla.
  $('#bizBody').addEventListener('click', (e) => {
    const m = e.target.closest('[data-more]'); if (!m) return;
    e.stopImmediatePropagation();
    const id = m.dataset.more;
    if (bizOpen.has(id)) bizOpen.delete(id); else bizOpen.add(id);
    renderBiz(lastMonthIncome);
  }, true);
  $('#bizBody').addEventListener('click', (e) => {
    if (e.target.closest('tr.xrow')) return;
    const tr = e.target.closest('[data-biz]'); if (!tr) return;
    bizSel = tr.dataset.biz; $$('#bizBody tr').forEach((x) => x.classList.toggle('sel', x === tr));
    renderDetail(); $('#bizDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  // Botón "Link de registro / Restablecer contraseña" del dueño, directo en la tabla.
  $('#bizBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-olink]'); if (!btn) return;
    e.stopImmediatePropagation();
    const b = biz.find((x) => x.users.some((u) => u.id === btn.dataset.olink));
    const u = b.users.find((x) => x.id === btn.dataset.olink);
    btn.disabled = true;
    try { await issueLink(b, u, '#inviteBox'); } catch (x) { toast(x.message); } finally { btn.disabled = false; }
  }, true);
  $('#bizDetail').addEventListener('click', async (e) => {
    if (e.target.closest('[data-mods]')) { try { sessionStorage.setItem('dwl_mod_open', JSON.stringify({ app: bizApp, id: bizSel })); } catch {} A.go('modulos'); return; }
    if (e.target.closest('[data-close]')) { bizSel = null; $('#bizDetail').hidden = true; $$('#bizBody tr').forEach((x) => x.classList.remove('sel')); return; }
    const b = biz.find((x) => x.id === bizSel);
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

  $('#bizBody').addEventListener('click', async (e) => {
    const row = e.target.closest('tr.xrow'); if (!row) return;
    const b = biz.find((x) => x.id === row.dataset.xbiz);
    const lk = e.target.closest('[data-xlink]');
    if (lk) {
      const u = b.users.find((x) => x.id === lk.dataset.xlink);
      lk.disabled = true;
      try {
        const r = await api(bizPath(b.id, '/users'), { method: 'POST', body: { email: u.email, role: u.role } });
        $('[data-xinvite]', row).innerHTML = inviteHtml(r.invite_url, u.email, linkKind(u));
      } catch (x) { toast(x.message); } finally { lk.disabled = false; }
      return;
    }
  });
  $('#priceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('platform/config', { method: 'POST', body: formData(e.target) });
    plat.prices = r.prices; plat.trial_days = r.trial_days; toast('Precios guardados');
  });
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
      el.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px"><h2>Archivados en ${esc(appCfg().name)}</h2><span class="muted" style="font-size:12px">Se borran solos, con todos sus datos, a los ${ARCHIVE_DAYS} días</span></div>`
        + (d.businesses.length ? `<div class="tbl-wrap"><table><thead><tr><th>Negocio</th><th>Dueño</th><th>Archivado</th><th>Se borra</th><th></th></tr></thead><tbody>${d.businesses.map((b) => {
          const owner = b.users.find((u) => u.role === 'owner');
          const left = b.purge_on ? daysBetween(d.today, b.purge_on) : null;
          return `<tr><td><b style="font-weight:500;color:var(--hi)">${esc(b.name)}</b></td><td>${owner ? esc(owner.email) : '—'}</td>
            <td class="muted">${b.archived_at ? fmtDate(Date.parse(b.archived_at)) : '—'}</td>
            <td><span class="st ${left !== null && left <= 3 ? 'bad' : 'soon'}">${b.purge_on ? `${fmtDay(b.purge_on)}${left !== null ? ` · ${left <= 0 ? 'hoy' : `en ${left} d`}` : ''}` : '—'}</span></td>
            <td><button class="btn sm" data-restore="${esc(b.id)}"><i class="ph-light ph-arrow-counter-clockwise"></i>Restaurar</button></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted" style="margin:0">No hay negocios archivados.</p>');
    } catch (x) { if (showArchived) el.innerHTML = `<p class="err">${esc(x.message)}</p>`; }
  }
  $('#bizArchBtn').addEventListener('click', () => {
    showArchived = !showArchived;
    $('#bizArchBtn').classList.toggle('on', showArchived);
    $('#bizArchBtn').setAttribute('aria-pressed', showArchived);
    $('#bizArchived').hidden = !showArchived;
    if (showArchived) { $('#bizArchived').innerHTML = '<p class="muted" style="margin:0">Cargando…</p>'; loadArchived(); }
  });
  $('#bizArchived').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-restore]'); if (!btn) return;
    btn.disabled = true;
    try { await api(bizPath(btn.dataset.restore, '/restore'), { method: 'POST' }); toast('Negocio restaurado'); loadBiz(); }
    catch (x) { toast(x.message); btn.disabled = false; }
  });

  return { show: load };
});
