// IA Diwilo: botón flotante (abajo a la derecha) con un asistente que consulta y gestiona el panel.
// Las acciones que cambian datos llegan como propuesta y solo se ejecutan al tocar «Confirmar».
(() => {
  const { $, esc, api, toast } = Admin;
  const KEY = 'dwl_ia_hist';
  let hist = [];
  try { hist = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch {}
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(hist.slice(-30))); } catch {} };
  const ctx = () => {
    let tab = 'resumen', org = 'diwilo';
    try { tab = sessionStorage.getItem('dwl_admin_tab') || tab; org = sessionStorage.getItem('dwl_hub_org') || org; } catch {}
    return { tab, org };
  };
  const SUGG = ['¿Cómo va el sitio esta semana?', '¿Qué negocios vencen en los próximos 7 días?', 'Resumen de marketing de este mes', '¿Qué tareas tengo pendientes?', 'Gastos y flujo de caja del mes'];
  const SECTION = { resumen: 'En vivo', negocios: 'Negocios', marketing: 'Marketing', finanzas: 'Finanzas', blog: 'Blog', ia: 'IA' };

  document.body.insertAdjacentHTML('beforeend', `
    <button class="ia-fab" id="iaFab" aria-label="Abrir IA Diwilo" title="IA Diwilo"><img src="/assets/img/brand/logo-mark.svg" alt=""><span>IA Diwilo</span></button>
    <div class="ia-back" id="iaBack" hidden></div>
    <aside class="ia-panel" id="iaPanel" hidden aria-label="IA Diwilo">
      <header><img src="/assets/img/brand/logo-mark.svg" alt=""><div><b>IA Diwilo</b><small>Consulta y gestiona el panel. Las acciones te piden confirmar.</small></div>
        <button class="btn btn-sm btn-outline-secondary" id="iaNew" title="Nueva conversación"><i class="bi bi-pencil-square"></i></button><button class="btn btn-sm btn-outline-secondary" id="iaClose" aria-label="Cerrar"><i class="bi bi-x-lg"></i></button></header>
      <div class="ia-log" id="iaLog" aria-live="polite"></div>
      <div class="ia-sugg" id="iaSugg"></div>
      <form class="ia-form" id="iaForm"><textarea class="form-control" name="q" rows="1" placeholder="Pregunta o pide algo: «crea una tarea para llamar a…»" maxlength="2000"></textarea><button class="btn btn-primary" aria-label="Enviar"><i class="bi bi-send"></i></button></form>
    </aside>`);
  const panel = $('#iaPanel'), log = $('#iaLog'), form = $('#iaForm'), ta = form.q;
  const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[-•]\s+(.*)$/gm, '<span class="li">$1</span>').replace(/\n/g, '<br>');

  function bubble(m) {
    const div = document.createElement('div');
    div.className = `ia-msg ${m.role}`;
    div.innerHTML = m.role === 'user' ? esc(m.content) : md(m.content)
      + (m.open ? `<button class="btn btn-sm ia-open btn-outline-secondary" data-open="${esc(m.open)}"><i class="bi bi-box-arrow-up-right"></i>Abrir ${esc(SECTION[m.open] || m.open)}</button>` : '')
      + (m.used?.length ? `<small class="ia-used">Consultó: ${m.used.map((u) => esc(u.replace(/_/g, ' '))).join(', ')}</small>` : '');
    if (m.pending) {
      div.insertAdjacentHTML('beforeend', `<div class="ia-pending"><span><i class="bi bi-lightning-charge"></i>${esc(m.pending.summary)}</span>
        ${m.done ? `<small class="text-body-secondary">${esc(m.done)}</small>` : '<div class="dw-row"><button class="btn btn-sm btn-primary" data-ok>Confirmar</button><button class="btn btn-sm btn-outline-secondary" data-no>Cancelar</button></div>'}</div>`);
      $('[data-ok]', div)?.addEventListener('click', () => run(m, div));
      $('[data-no]', div)?.addEventListener('click', () => { m.done = 'Cancelado'; save(); div.replaceWith(bubble(m)); });
    }
    return div;
  }
  function draw() {
    log.innerHTML = '';
    if (!hist.length) log.innerHTML = '<div class="ia-msg assistant">Hola. Puedo contarte cómo va el sitio, qué negocios vencen, cómo van marketing y finanzas, y crear tareas, contactos, campañas o movimientos (siempre te pido confirmar).</div>';
    hist.forEach((m) => log.appendChild(bubble(m)));
    $('#iaSugg').innerHTML = hist.length ? '' : SUGG.map((s) => `<button class="pill" type="button">${esc(s)}</button>`).join('');
    log.scrollTop = log.scrollHeight;
  }
  async function run(m, div) {
    $$btns(div, true);
    const live = document.createElement('div'); live.className = 'ia-msg assistant ia-live'; log.appendChild(live); log.scrollTop = log.scrollHeight;
    const p = Admin.progress(live, 'Haciéndolo');
    try {
      const r = await Admin.stream('assistant/run', { tool: m.pending.tool, args: m.pending.args, org: m.pending.org }, (ev) => { p.update(ev); log.scrollTop = log.scrollHeight; });
      m.done = r.message; toast('Hecho');
    } catch (x) { m.done = `No se pudo: ${x.message}`; }
    live.remove(); save(); draw();
  }
  const $$btns = (el, dis) => el.querySelectorAll('button').forEach((b) => { b.disabled = dis; });

  async function ask(q) {
    q = q.trim(); if (!q) return;
    hist.push({ role: 'user', content: q }); save(); draw();
    const wait = document.createElement('div'); wait.className = 'ia-msg assistant ia-live';
    log.appendChild(wait); log.scrollTop = log.scrollHeight;
    const p = Admin.progress(wait, 'IA Diwilo');
    form.querySelector('button').disabled = true;
    try {
      const messages = hist.filter((m) => !m.pending || m.done).map((m) => ({ role: m.role, content: m.content + (m.done ? `\n(${m.done})` : '') }));
      const r = await Admin.stream('assistant', { messages, context: ctx() }, (ev) => { p.update(ev); log.scrollTop = log.scrollHeight; });
      hist.push({ role: 'assistant', content: r.reply, open: r.open, pending: r.pending, used: r.used });
    } catch (x) { hist.push({ role: 'assistant', content: `No pude responder: ${x.message}` }); }
    form.querySelector('button').disabled = false;
    save(); draw();
  }

  const open = (on) => { panel.hidden = !on; $('#iaBack').hidden = !on; $('#iaFab').classList.toggle('on', on); if (on) { draw(); setTimeout(() => ta.focus(), 50); } };
  $('#iaFab').onclick = () => open(panel.hidden);
  $('#iaClose').onclick = () => open(false);
  $('#iaBack').onclick = () => open(false);
  $('#iaNew').onclick = () => { hist = []; save(); draw(); };
  $('#iaSugg').onclick = (e) => { const b = e.target.closest('.pill'); if (b) ask(b.textContent); };
  log.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) Admin.go(b.dataset.open); });
  form.onsubmit = (e) => { e.preventDefault(); const q = ta.value; ta.value = ''; ta.style.height = ''; ask(q); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden && !document.querySelector('dialog[open]')) open(false); });
})();
