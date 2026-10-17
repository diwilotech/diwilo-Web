// Panel Diwilo · pestaña «api». La carga admin/core.js la primera vez que se abre.
Admin.tab('api', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge, ask, sure } = A;

  /* ---------- INTEGRACIONES ---------- */
  const load = async () => {
    const [s, keys] = await Promise.all([api('settings'), api('keys')]);
    $('#hookForm').elements.webhook_url.value = s.webhook_url || '';
    $('#keysBody').innerHTML = keys.length ? keys.map((k) => `<tr style="${k.revoked ? 'opacity:.45' : ''}"><td>${esc(k.name)}</td><td class="font-monospace small">${esc(k.prefix)}…</td><td class="text-body-secondary">${k.last_used ? fmtDate(k.last_used) : 'nunca'}</td>
      <td>${k.revoked ? '<span class="badge text-bg-secondary fw-normal">revocada</span>' : `<button class="btn btn-sm btn-outline-danger" data-revoke="${k.id}">Revocar</button>`}</td></tr>`).join('') : '<tr><td colspan="4" class="text-body-secondary">Sin claves todavía.</td></tr>';
    $('#apiDocs').textContent = `# Público (lo usa el sitio)
POST ${ORIGIN}/api/track     { type, path, ref, sid, utm_source, utm_medium, utm_campaign, label }
POST ${ORIGIN}/api/lead      { name, email, phone, topics, message, page, sid, utm_* }
POST ${ORIGIN}/api/chat      { sid, message, page }  →  { reply }
GET  ${ORIGIN}/l/<slug>      link de rastreo (302 + registro del clic)
GET  ${ORIGIN}/c/<slug>      tarjeta de presentación  ·  /c/<slug>.vcf  contacto

# Con clave (encabezado Authorization: Bearer dwl_...)
GET  ${ORIGIN}/v1/leads?since=<ms>&limit=100
GET  ${ORIGIN}/v1/events?since=<ms>&limit=100
GET  ${ORIGIN}/v1/chats?since=<ms>
GET  ${ORIGIN}/v1/chats/<id>          mensajes de una conversación
GET  ${ORIGIN}/v1/stats?days=7
POST ${ORIGIN}/v1/links               { title, slug, target, utm_source, utm_medium, utm_campaign }

curl -H "Authorization: Bearer dwl_xxx" ${ORIGIN}/v1/leads`;
  };
  $('#hookForm').addEventListener('submit', async (e) => { e.preventDefault(); await api('settings', { method: 'POST', body: { webhook_url: e.target.elements.webhook_url.value.trim() } }); toast('Webhook guardado'); });
  $('#hookTest').addEventListener('click', async () => { await api('webhook-test', { method: 'POST' }); toast('Prueba enviada'); });
  $('#keyForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const r = await api('keys', { method: 'POST', body: formData(e.target) }); e.target.reset();
    const el = $('#newKey'); el.hidden = false;
    el.innerHTML = `<div class="newkey"><p style="margin:0 0 6px">Copia esta clave ahora, no se volverá a mostrar:</p><code class="font-monospace small" style="font-size:13px;color:var(--hi)">${esc(r.key)}</code><div class="dw-row" style="margin-top:8px"><button class="btn btn-sm btn-outline-secondary" data-copy="${esc(r.key)}">Copiar</button></div></div>`;
    $('[data-copy]', el).onclick = () => copy(r.key);
    load();
  });
  $('#keysBody').addEventListener('click', async (e) => { const b = e.target.closest('[data-revoke]'); if (b && await sure('¿Revocar esta clave? Las integraciones que la usan dejarán de funcionar.', 'Revocar')) { await api('keys?id=' + b.dataset.revoke, { method: 'DELETE' }); load(); } });
  return { show: load };
});
