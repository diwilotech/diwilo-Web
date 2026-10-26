// Panel Diwilo · pestaña «Videos»: los videos para redes (los crea el agente de videos del módulo IA o una persona a mano). Backend: worker/src/videos.js (Higgsfield).
Admin.tab('contenido', (A) => {
  const { $, esc, api, toast } = A;
  const ESTADO = { queued: 'En cola', in_progress: 'Generando…', completed: 'Listo', failed: 'Falló', nsfw: 'Rechazado por moderación', canceled: 'Cancelado' };
  const M = { 'x-app': '1' };
  let timer = null;

  /* ---------------- videos ---------------- */
  const fin = (s) => ['completed', 'failed', 'nsfw', 'canceled'].includes(s);
  async function loadVideos() {
    clearTimeout(timer);
    let d;
    try { d = await api('videos'); } catch (e) { if (e.message !== 'sesión') $('#vdList').innerHTML = `<p class="text-danger small">${esc(e.message)}</p>`; return; }
    $('#vdList').innerHTML = (d.configured ? '' : '<div class="alert alert-warning">Falta la clave de Higgsfield: pégala en <b>IA → Modelo de IA → Claves de IA</b> (formato <code>id:secreto</code>).</div>') + (d.rows.length ? d.rows.map((v) => `<div class="dw-card" style="margin-bottom:12px">
      <div class="small text-body-secondary">${esc(ESTADO[v.status] || v.status)} · ${esc(v.aspect_ratio)} · ${v.duration} s · ${v.source.startsWith('agente') ? esc(v.source.replace('agente:', 'Agente: ')) : 'a mano'} · ${new Date(v.created_at).toLocaleString('es-CO')}</div>
      <div style="margin:6px 0">${esc(v.prompt)}</div>
      ${v.url ? `<video src="${esc(v.url)}" controls playsinline style="max-width:100%;max-height:420px;border-radius:8px"></video><div style="margin-top:6px"><a class="btn btn-sm btn-outline-secondary" href="${esc(v.url)}" target="_blank" rel="noopener"><i class="bi bi-download"></i> Abrir / descargar</a></div>` : ''}
      ${v.error ? `<div class="text-danger small">${esc(v.error)}</div>` : ''}
      <button class="btn btn-sm btn-link text-danger p-0" data-vdel="${v.id}">Quitar de la lista</button>
    </div>`).join('') : '<p class="text-body-secondary">Aún no hay videos. Ejecuta el agente de videos o escribe uno arriba.</p>');
    if (d.rows.some((v) => !fin(v.status))) timer = setTimeout(loadVideos, 6000);
  }
  $('#vdList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-vdel]'); if (!b) return;
    try { await api('videos/' + b.dataset.vdel, { method: 'DELETE', headers: { 'content-type': 'application/json', ...M } }); loadVideos(); } catch (x) { if (x.message !== 'sesión') toast(x.message); }
  });
  $('#vdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = $('#vdGo');
    btn.disabled = true;
    try {
      await api('videos', { method: 'POST', headers: { 'content-type': 'application/json', ...M }, body: { prompt: f.prompt.value.trim(), duration: +f.duration.value, aspect_ratio: f.aspect_ratio.value, sound: f.sound.value } });
      f.prompt.value = ''; toast('Video en cola'); loadVideos();
    } catch (x) { if (x.message !== 'sesión') toast(x.message); } finally { btn.disabled = false; }
  });

  return { show: loadVideos, hide: () => clearTimeout(timer) };
});
