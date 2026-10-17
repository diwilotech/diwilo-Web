// Panel Diwilo · pestaña «resumen». La carga admin/core.js la primera vez que se abre.
Admin.tab('resumen', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge } = A;

  /* ---------- EN VIVO ---------- */
  let days = 7, liveTimer = null, lastTs = 0;
  $$('#range .btn').forEach((b) => b.addEventListener('click', () => { days = +b.dataset.days; $$('#range .btn').forEach((x) => x.classList.toggle('active', x === b)); loadStats(); }));
  async function loadStats() {
    const s = await api('stats?days=' + days);
    const k = s.kpi;
    const tiles = [
      ['<span class="live-dot"></span>En línea ahora', s.live], ['Visitas', k.views], ['Visitantes únicos', k.visitors],
      ['Leads', k.leads], ['Chats IA', k.chats], ['Clics WhatsApp', k.whatsapp], ['Clics en links', k.link_clicks]
    ];
    $('#kpis').innerHTML = tiles.map(([l, v]) => `<div class="dw-card kpi"><div class="v">${fmtN(v)}</div><div class="l">${l}</div></div>`).join('');
    // completa días sin visitas con cero
    const map = Object.fromEntries(s.series.map((r) => [r.date, r]));
    const rows = [];
    const n = Math.max(1, days);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const r = map[d] || { views: 0, visitors: 0 };
      const dt = new Date(d + 'T12:00:00Z');
      rows.push({ v: r.views, v2: r.visitors, short: dt.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }), long: dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) });
    }
    barChart($('#chartViews'), rows, 'Visitas por día');
    const prettyRef = (r) => { try { return esc(new URL(r).hostname.replace(/^www\./, '')); } catch { return esc(r || '(directo)'); } };
    rank($('#rPages'), s.pages, (k) => esc(k || '/'));
    rank($('#rRefs'), s.refs, prettyRef);
    rank($('#rUtm'), s.utm, esc);
    rank($('#rCountries'), s.countries, (k) => `${flag(k)} ${esc(k || '—')}`);
    rank($('#rDevices'), s.devices, esc);
  }
  const EV = { pageview: ['bi-eye', 'Visita'], click_whatsapp: ['bi-whatsapp', 'Clic WhatsApp'], chat_open: ['bi-chat-dots', 'Abrió el chat'], lead: ['bi-person-plus', 'Nuevo lead'], cta: ['bi-cursor', 'Clic en botón'] };
  async function loadLive() {
    const d = await api('live');
    const feed = $('#feed');
    if (!d.events.length) { feed.innerHTML = '<p class="dw-empty">Sin actividad en los últimos 30 minutos.</p>'; }
    else {
      feed.innerHTML = d.events.map((e) => {
        const [icon, name] = EV[e.type] || ['bi-lightning-charge', e.type];
        const isNew = lastTs && e.ts > lastTs;
        return `<div class="ev" style="${isNew ? '' : 'animation:none'}"><span class="text-body-secondary font-monospace small">${ago(e.ts)}</span><i class="bi ${icon}"></i><span class="p">${esc(name)} · ${esc(e.label || e.path || '')}</span><span class="text-body-secondary">${flag(e.country)} ${esc(e.device || '')}</span></div>`;
      }).join('');
    }
    lastTs = d.events[0]?.ts || lastTs;
    const t = $('#kpis .v'); if (t) t.textContent = fmtN(d.live.length);
  }
  function startLive() { stopLive(); loadLive().catch(() => {}); let n = 0; liveTimer = setInterval(() => { loadLive().catch(() => {}); if (++n % 6 === 0) loadStats().catch(() => {}); }, 5000); }
  function stopLive() { clearInterval(liveTimer); liveTimer = null; }
  return { show() { loadStats().catch(() => {}); startLive(); }, hide: stopLive };
});
