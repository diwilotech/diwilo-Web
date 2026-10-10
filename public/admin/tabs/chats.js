// Panel Diwilo · pestaña «chats». La carga admin/core.js la primera vez que se abre.
Admin.tab('chats', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge } = A;

  /* ---------- CHATS ---------- */
  let currentChat = null;
  const load = async () => {
    const chats = await api('chats');
    $('#chatList').innerHTML = chats.length ? chats.map((c) => `<button class="ci ${c.id === currentChat ? 'on' : ''}" data-chat="${esc(c.id)}">
      <span class="t">${esc(c.first || '(sin mensajes)')}</span>
      <span class="muted" style="font-size:12px">${fmtDate(c.last_at)} · ${c.msg_count} mensajes · ${flag(c.country)} ${esc(c.device || '')}</span></button>`).join('')
      : '<p class="empty card">Aún no hay conversaciones.</p>';
  };
  $('#chatList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-chat]'); if (!b) return;
    currentChat = b.dataset.chat;
    $$('.ci').forEach((x) => x.classList.toggle('on', x === b));
    const msgs = await api('chats?chat=' + encodeURIComponent(currentChat));
    $('#chatTitle').textContent = 'Conversación';
    $('#chatDel').hidden = false;
    $('#convo').innerHTML = msgs.map((m) => `<div class="msg ${m.role === 'user' ? 'user' : 'assistant'}">${esc(m.content)}<small>${fmtDate(m.ts)}</small></div>`).join('');
  });
  $('#chatDel').addEventListener('click', async () => {
    if (!currentChat || !confirm('¿Borrar esta conversación?')) return;
    await api('chats?chat=' + encodeURIComponent(currentChat), { method: 'DELETE' });
    currentChat = null; $('#convo').innerHTML = ''; $('#chatDel').hidden = true; $('#chatTitle').textContent = 'Elige una conversación'; load();
  });
  return { show: load };
});
