// Panel Diwilo · pestaña «leads». La carga admin/core.js la primera vez que se abre.
Admin.tab('leads', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge } = A;

  /* ---------- LEADS ---------- */
  const STATUS = ['nuevo', 'contactado', 'propuesta', 'ganado', 'perdido'];
  let leads = [];
  const load = async () => {
    leads = await api('leads');
    $('#leadsBody').innerHTML = leads.length ? leads.map((l) => `<tr>
      <td class="muted" style="white-space:nowrap">${fmtDate(l.ts)}</td>
      <td><b style="font-weight:500;color:var(--hi)">${esc(l.name)}</b><br><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>${l.phone ? `<br><a href="https://wa.me/${esc(l.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(l.phone)}</a>` : ''}</td>
      <td>${esc(l.topics || '—')}</td>
      <td style="max-width:340px;white-space:pre-wrap">${esc(l.message)}</td>
      <td class="muted">${esc(l.utm_source || 'directo')}${l.utm_campaign ? ' / ' + esc(l.utm_campaign) : ''}<br>${flag(l.country)}</td>
      <td><select class="in" data-status="${l.id}" style="width:auto">${STATUS.map((s) => `<option ${s === l.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn sm danger" data-del-lead="${l.id}" aria-label="Borrar"><i class="ph-light ph-trash"></i></button></td></tr>`).join('')
      : '<tr><td colspan="7" class="empty">Todavía no llegan leads. Aparecerán aquí al instante cuando alguien use el formulario de contacto.</td></tr>';
    updateLeadBadge();
  };
  function updateLeadBadge() { setBadge('leadBadge', leads.filter((l) => l.status === 'nuevo').length); }
  $('#leadsBody').addEventListener('change', async (e) => {
    const id = e.target.dataset.status; if (!id) return;
    await api('leads', { method: 'POST', body: { id: +id, status: e.target.value } });
    const l = leads.find((x) => x.id === +id); if (l) l.status = e.target.value; updateLeadBadge(); toast('Estado actualizado');
  });
  $('#leadsBody').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del-lead]'); if (!b || !confirm('¿Borrar este lead?')) return;
    await api('leads?id=' + b.dataset.delLead, { method: 'DELETE' }); load();
  });
  $('#leadsCsv').addEventListener('click', () => {
    const cols = ['ts', 'name', 'email', 'phone', 'topics', 'message', 'status', 'utm_source', 'utm_medium', 'utm_campaign', 'page', 'country'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(',')].concat(leads.map((l) => cols.map((c) => q(c === 'ts' ? new Date(l.ts).toISOString() : l[c])).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'leads-diwilo.csv'; a.click();
  });
  return { show: load };
});
