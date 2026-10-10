// Panel Diwilo · pestaña «links». La carga admin/core.js la primera vez que se abre.
Admin.tab('links', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge, ask, sure } = A;

  /* ---------- LINKS ---------- */
  let links = [];
  const load = async () => {
    links = await api('links');
    $('#linksBody').innerHTML = links.length ? links.map((l) => {
      const short = `${ORIGIN}/l/${l.slug}`;
      return `<tr><td><b style="font-weight:500;color:var(--hi)">${esc(l.title || l.slug)}</b></td>
        <td><button class="btn sm" data-copy="${esc(short)}"><i class="ph-light ph-copy"></i>/l/${esc(l.slug)}</button></td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" class="muted" title="${esc(l.target)}">${esc(l.target)}</td>
        <td class="muted">${esc([l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(' · ') || '—')}</td>
        <td class="num">${fmtN(l.clicks)}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-link-stats="${l.id}"><i class="ph-light ph-chart-bar"></i></button> <button class="btn sm" data-link-edit="${l.id}"><i class="ph-light ph-pencil-simple"></i></button> <button class="btn sm danger" data-link-del="${l.id}"><i class="ph-light ph-trash"></i></button></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">Crea tu primer link para medir campañas, publicaciones o códigos QR impresos.</td></tr>';
  };
  $('#linkForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const err = $('[data-err]', e.target); err.textContent = '';
    const body = formData(e.target); if (body.id) body.id = +body.id; else delete body.id;
    try { const r = await api('links', { method: 'POST', body }); e.target.reset(); $('#linkFormTitle').textContent = 'Nuevo link'; toast('Link guardado: /l/' + r.slug); load(); }
    catch (x) { err.textContent = x.message.includes('UNIQUE') ? 'Ese slug ya existe' : x.message; }
  });
  $('#linkForm').addEventListener('reset', () => { $('#linkFormTitle').textContent = 'Nuevo link'; });
  $('#linksBody').addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]'); if (c) return copy(c.dataset.copy);
    const ed = e.target.closest('[data-link-edit]');
    if (ed) { const l = links.find((x) => x.id === +ed.dataset.linkEdit); const f = $('#linkForm'); ['id', 'title', 'slug', 'target', 'utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => { f.elements[k].value = l[k] ?? ''; }); $('#linkFormTitle').textContent = 'Editar link'; f.scrollIntoView({ behavior: 'smooth' }); return; }
    const del = e.target.closest('[data-link-del]');
    if (del) { if (!(await sure('¿Borrar este link y sus clics?', 'Borrar'))) return; await api('links?id=' + del.dataset.linkDel, { method: 'DELETE' }); $('#linkDetail').hidden = true; return load(); }
    const st = e.target.closest('[data-link-stats]');
    if (st) {
      const l = links.find((x) => x.id === +st.dataset.linkStats); const d = await api('link-clicks?id=' + l.id); const short = `${ORIGIN}/l/${l.slug}`;
      const el = $('#linkDetail'); el.hidden = false;
      el.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h2>${esc(l.title || l.slug)} · ${fmtN(l.clicks)} clics</h2><button class="btn sm" data-close>Cerrar</button></div>
        <div class="grid" style="--min:200px"><div><p class="muted" style="margin:0 0 8px">Últimos días</p><div class="rank" id="ldDays"></div></div><div><p class="muted" style="margin:0 0 8px">Países</p><div class="rank" id="ldC"></div></div><div><p class="muted" style="margin:0 0 8px">Dispositivo</p><div class="rank" id="ldD"></div></div>
        <div><p class="muted" style="margin:0 0 8px">QR para imprimir</p><div class="qrbox">${qrSvg(short)}</div><p class="mono muted">${esc(short)}</p></div></div>`;
      rank($('#ldDays'), d.byDay.map((r) => ({ k: r.date, n: r.n })), esc);
      rank($('#ldC'), d.byCountry, (k) => `${flag(k)} ${esc(k || '—')}`);
      rank($('#ldD'), d.byDevice, esc);
      $('[data-close]', el).onclick = () => { el.hidden = true; };
      el.scrollIntoView({ behavior: 'smooth' });
    }
  });
  return { show: load };
});
