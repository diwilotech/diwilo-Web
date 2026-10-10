// Panel Diwilo · pestaña «ajustes». La carga admin/core.js la primera vez que se abre.
Admin.tab('ajustes', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge } = A;

  /* ---------- AJUSTES ---------- */
  let defaultPrompt = '';
  const load = async () => {
    const s = await api('settings'); defaultPrompt = s.default_prompt;
    const f = $('#setForm'); f.elements.chat_prompt.value = s.chat_prompt; f.elements.chat_enabled.checked = s.chat_enabled;
    $('#aiProvider').textContent = s.ai_provider;
  };
  $('#setForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    await api('settings', { method: 'POST', body: { chat_prompt: f.elements.chat_prompt.value, chat_enabled: f.elements.chat_enabled.checked ? '1' : '0' } }); toast('Ajustes guardados');
  });
  $('#resetPrompt').addEventListener('click', () => { $('#setForm').elements.chat_prompt.value = defaultPrompt; });
  return { show: load };
});
