// Panel Diwilo · pestaña «Integraciones e IA»: conversaciones del chat del sitio, ajustes del chat, API y webhooks,
// e IA Diwilo. Las tres primeras son las pestañas de antes, montadas aquí (mismos archivos de /admin/tabs/).
Admin.tab('ia', (A) => {
  const { $, esc } = A;
  const VIEWS = [['chats', 'Conversaciones del chat', 'ph-chats-circle'], ['ajustes', 'Ajustes del chat', 'ph-sliders-horizontal'],
    ['api', 'API y webhooks', 'ph-plugs-connected'], ['asistente', 'IA Diwilo', 'ph-robot']];
  const EMBED = ['chats', 'ajustes', 'api'];
  let view = (() => { try { const v = sessionStorage.getItem('dwl_ia_view'); sessionStorage.removeItem('dwl_ia_view'); return v || 'chats'; } catch { return 'chats'; } })();

  async function render() {
    const old = $('#iaView'), el = old.cloneNode(false);
    old.replaceWith(el);
    EMBED.forEach((id) => A.unmount(id));
    if (EMBED.includes(view)) { try { await A.mount(view, el); } catch (x) { if (x.message !== 'sesión') el.innerHTML = `<p class="err">${esc(x.message)}</p>`; } return; }
    el.innerHTML = `<div class="grid" style="--min:340px">
      <div class="card"><h2><i class="ph-light ph-robot"></i> IA Diwilo</h2>
        <p class="muted" style="font-size:13px;line-height:1.6">Asistente del panel (botón flotante abajo a la derecha). Responde con los datos reales del sitio, los negocios de las apps, Marketing y Finanzas.
        Las acciones que cambian datos te piden confirmar antes de ejecutarse y quedan en «Actividad en tiempo real».</p>
        <button class="btn pri" data-open><i class="ph-light ph-chat-circle-dots"></i>Abrir IA Diwilo</button></div>
      <div class="card"><h2>Qué puede hacer</h2>
        <div class="ia-caps"><b>Consulta</b><span>Estado del sitio, leads, negocios y vencimientos, organizaciones, resumen de marketing y de finanzas, tareas y contactos.</span>
        <b>Con tu confirmación</b><span>Crear tareas, contactos y campañas; registrar ingresos, gastos y gastos recurrentes; cambiar la etapa de un contacto; marcar tareas hechas.</span>
        <b>No hace</b><span>Borrar, archivar negocios, cambiar dueños ni registrar pagos de suscripciones.</span></div></div>
      <div class="card"><h2>Modelo de IA</h2><p class="muted" style="font-size:13px;line-height:1.6" data-provider>…</p></div>
      <div class="card"><h2>Por MCP (próximo paso)</h2><p class="muted" style="font-size:13px;line-height:1.6">Las mismas herramientas se pueden abrir por MCP para usar Diwilo desde Claude Desktop u otra IA, con una clave de API de «API y webhooks».</p></div></div>`;
    $('[data-open]', el).onclick = () => document.getElementById('iaFab')?.click();
    A.api('settings').then((s) => { $('[data-provider]', el).textContent = `Usa ${s.ai_provider}. El chat del sitio y IA Diwilo comparten este modelo. Para usar Gemini, configura el secreto GEMINI_API_KEY en Cloudflare.`; }).catch(() => {});
  }
  function pick() { A.$('#iaSeg').innerHTML = ''; window.Hub.seg($('#iaSeg'), VIEWS, (k) => { view = k; render(); }, view); render(); }
  // Si se llegó desde un enlace viejo (#chats, #ajustes, #api), abre esa sección.
  const wanted = () => { try { const v = sessionStorage.getItem('dwl_ia_view'); sessionStorage.removeItem('dwl_ia_view'); return v; } catch { return null; } };
  return { show: () => { const w = wanted(); if (w) view = w; return A.$('#iaSeg').children.length && !w ? render() : pick(); }, hide: () => EMBED.forEach((id) => A.unmount(id)) };
});
