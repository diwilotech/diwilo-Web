// Panel Diwilo · pestaña «cards». La carga admin/core.js la primera vez que se abre.
Admin.tab('cards', (A) => {
  const { $, $$, esc, ORIGIN, fmtN, fmtDate, ago, flag, toast, api, qrSvg, copy, formData, barChart, rank, setBadge } = A;

  /* ---------- TARJETAS (galería + editor visual) ---------- */
  const ACC = {
    violeta: ['#8f45f2', '#c99bfa', '168,85,247', 'Violeta'],
    azul: ['#2f6fed', '#93c5fd', '59,130,246', 'Azul'],
    verde: ['#0f9f6e', '#6ee7b7', '16,185,129', 'Verde'],
    ambar: ['#d97706', '#fcd34d', '245,158,11', 'Ámbar'],
    rosa: ['#db2777', '#f9a8d4', '236,72,153', 'Rosa']
  };
  const CONTACTS = [
    ['whatsapp', 'ph-whatsapp-logo', 'WhatsApp', '+57 300 000 0000', 'tel'],
    ['phone', 'ph-phone', 'Llamar', '+57 300 000 0000', 'tel'],
    ['email', 'ph-envelope-simple', 'Correo', 'nombre@empresa.com', 'email'],
    ['website', 'ph-globe', 'Sitio web', 'https://diwilo.com', 'url'],
    ['instagram', 'ph-instagram-logo', 'Instagram', 'usuario', 'text'],
    ['linkedin', 'ph-linkedin-logo', 'LinkedIn', 'https://www.linkedin.com/in/…', 'url']
  ];
  const TEXT_KEYS = ['name', 'role', 'company', 'bio'];
  let cards = [], draft = null, saved = '', slugTouched = false;
  const accentVars = (k) => { const a = ACC[k] || ACC.violeta; return `--ac:${a[0]};--acl:${a[1]};--glow:${a[2]}`; };
  const initials = (n) => esc((n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?');
  const photoOf = (c) => c.photo_data || (c.has_photo ? `/c/${encodeURIComponent(c.slug)}/foto?v=${c.updated_at || c.created_at}` : (c.photo_url || ''));
  const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const snapshot = () => JSON.stringify(draft);

  const load = async () => {
    if (!$('#cardEditor').hidden) return;
    cards = await api('cards');
    $('#cardsList').innerHTML = cards.map((c) => {
      const ph = photoOf(c);
      const icons = CONTACTS.filter(([k]) => c[k]).map(([, ic]) => `<span><i class="ph-light ${ic}"></i></span>`).join('');
      return `<div class="vcard" role="button" tabindex="0" data-card-edit="${c.id}" style="${accentVars(c.accent)}">
        <span class="vedit"><i class="ph-light ph-pencil-simple"></i>Editar</span>
        ${ph ? `<img class="vph" src="${esc(ph)}" alt="">` : `<div class="vph">${initials(c.name)}</div>`}
        <h3>${esc(c.name)}</h3>
        <p class="vr">${esc(c.role || '')}</p>
        <p class="vc">${esc(c.company || '')}</p>
        <div class="vi">${icons}</div>
        <div class="vf"><span><i class="ph-light ph-eye"></i> ${fmtN(c.views)} vistas · /c/${esc(c.slug)}</span>
          <span class="row"><a class="btn sm" href="/c/${esc(c.slug)}" target="_blank" rel="noopener" title="Abrir" data-stop><i class="ph-light ph-arrow-square-out"></i></a><button class="btn sm" data-copy="${esc(ORIGIN + '/c/' + c.slug)}" title="Copiar enlace"><i class="ph-light ph-copy"></i></button></span></div>
      </div>`;
    }).join('') + `<button class="vnew" id="cardNew2"><span><i class="ph-light ph-user-circle-plus"></i><br>Nueva tarjeta</span></button>`;
  };

  function openEditor(card) {
    draft = card
      ? { id: card.id, slug: card.slug, accent: card.accent || 'violeta', photo: photoOf(card), photo_data: undefined, views: card.views,
          ...Object.fromEntries([...TEXT_KEYS, ...CONTACTS.map((c) => c[0])].map((k) => [k, card[k] || ''])) }
      : { slug: '', accent: 'violeta', photo: '', photo_data: undefined, views: 0, ...Object.fromEntries([...TEXT_KEYS, ...CONTACTS.map((c) => c[0])].map((k) => [k, ''])), company: 'Diwilo', website: 'https://diwilo.com' };
    slugTouched = !!card;
    $('#cardsGallery').hidden = true; $('#cardEditor').hidden = false;
    $('#edTitle').textContent = card ? 'Editar tarjeta' : 'Nueva tarjeta';
    $('#edDelete').hidden = !card; $('#edOpen').hidden = !card; $('#edErr').textContent = '';
    TEXT_KEYS.forEach((k) => { $(`.pcard [data-k="${k}"]`).textContent = draft[k]; });
    $('#edContact').innerHTML = CONTACTS.map(([k, ic, label, ph, type]) => `<label class="cfield" data-cf="${k}"><i class="ph-light ${ic}"></i>
      <input class="in" data-c="${k}" type="${type}" value="${esc(draft[k])}" placeholder="${esc(label)} · ${esc(ph)}" aria-label="${esc(label)}"></label>`).join('');
    $('#edSwatches').innerHTML = Object.entries(ACC).map(([k, a]) => `<button type="button" class="sw" data-acc="${k}" style="--c:${a[0]}" title="${a[3]}" aria-label="${a[3]}"></button>`).join('');
    $('#edBase').textContent = ORIGIN.replace(/^https?:\/\//, '') + '/c/';
    saved = snapshot();
    renderPreview();
    window.scrollTo({ top: 0 });
    if (!card) setTimeout(() => $('.pcard [data-k="name"]').focus(), 50);
  }

  function renderPreview() {
    $('#edRoot').setAttribute('style', accentVars(draft.accent));
    $$('.sw').forEach((b) => b.classList.toggle('on', b.dataset.acc === draft.accent));
    $('#pPhoto').innerHTML = (draft.photo ? `<img src="${esc(draft.photo)}" alt="">` : initials(draft.name)) + '<span class="cam"><i class="ph-light ph-camera"></i></span>';
    $('#pPhotoDel').hidden = !draft.photo;
    $('#pActs').innerHTML = CONTACTS.map(([k, ic, label]) => `<button type="button" class="pact ${draft[k] ? '' : 'off'}" data-goto="${k}" title="${draft[k] ? esc(draft[k]) : 'Agregar ' + esc(label)}"><i class="ph-light ${draft[k] ? ic : 'ph-plus'}"></i>${esc(label)}</button>`).join('');
    if (!slugTouched) draft.slug = slugify(draft.name);
    if ($('#edSlug') !== document.activeElement) $('#edSlug').value = draft.slug;
    const url = `${ORIGIN}/c/${draft.slug || '…'}`;
    $('#edQr').innerHTML = qrSvg(url);
    $('#edOpen').href = `/c/${draft.slug}`;
    $('#edViews').textContent = draft.id ? `${fmtN(draft.views)} vistas` : 'Se publica al guardar';
    $('#edDirty').hidden = snapshot() === saved;
  }

  // Edición directa sobre la tarjeta
  $$('.pcard [contenteditable]').forEach((el) => {
    el.addEventListener('input', () => {
      if (!el.textContent.trim()) el.textContent = '';
      draft[el.dataset.k] = el.textContent.trim();
      renderPreview();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && el.dataset.k !== 'bio') { e.preventDefault(); el.blur(); } });
    el.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' ')); });
  });
  $('#edContact').addEventListener('input', (e) => { const k = e.target.dataset.c; if (k) { draft[k] = e.target.value.trim(); renderPreview(); } });
  $('#pActs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]'); if (!b) return;
    const lab = $(`[data-cf="${b.dataset.goto}"]`); const inp = $('input', lab);
    inp.focus(); lab.classList.add('flash'); setTimeout(() => lab.classList.remove('flash'), 900);
  });
  $('#edSwatches').addEventListener('click', (e) => { const b = e.target.closest('[data-acc]'); if (b) { draft.accent = b.dataset.acc; renderPreview(); } });
  $('#edSlug').addEventListener('input', (e) => { slugTouched = true; draft.slug = slugify(e.target.value); renderPreview(); });
  $('#edSlug').addEventListener('blur', (e) => { e.target.value = draft.slug; });

  // Foto: se recorta cuadrada y se reduce a 400 px antes de subirla
  $('#pPhoto').addEventListener('click', () => $('#pFile').click());
  $('#pFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image(); img.src = URL.createObjectURL(file);
    try { await img.decode(); } catch { toast('No se pudo leer esa imagen. Prueba con JPG o PNG.'); return; }
    const size = Math.min(img.naturalWidth, img.naturalHeight), S = 400;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    cv.getContext('2d').drawImage(img, (img.naturalWidth - size) / 2, (img.naturalHeight - size) / 2, size, size, 0, 0, S, S);
    URL.revokeObjectURL(img.src);
    draft.photo_data = draft.photo = cv.toDataURL('image/jpeg', 0.85);
    renderPreview();
  });
  $('#pPhotoDel').addEventListener('click', () => { draft.photo = ''; draft.photo_data = ''; renderPreview(); });

  /* Ícono de la app instalable de la tarjeta: foto (o iniciales) sobre el color de la tarjeta.
     Fondo completo para que Android/iOS puedan recortarlo (maskable); la foto queda en la zona segura. */
  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); if (!src.startsWith('data:') && !src.startsWith('/')) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  async function makeIcons() {
    const [ac, acl] = ACC[draft.accent] || ACC.violeta;
    let img = null;
    if (draft.photo) { try { img = await loadImg(draft.photo); } catch { img = null; } }
    const draw = (S) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
      const bg = g.createLinearGradient(0, 0, S, S); bg.addColorStop(0, ac); bg.addColorStop(1, '#150B2B');
      g.fillStyle = bg; g.fillRect(0, 0, S, S);
      const cx = S / 2, cy = S / 2, r = S * 0.3;
      g.beginPath(); g.arc(cx, cy, r + S * 0.022, 0, Math.PI * 2); g.fillStyle = acl; g.fill();
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
      if (img) {
        const k = Math.min(img.naturalWidth, img.naturalHeight);
        g.drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, cx - r, cy - r, r * 2, r * 2);
      } else {
        g.fillStyle = '#150B2B'; g.fillRect(cx - r, cy - r, r * 2, r * 2);
        g.fillStyle = '#fff'; g.font = `600 ${Math.round(S * 0.2)}px "Space Grotesk", Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText((draft.name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(), cx, cy + S * 0.01);
      }
      g.restore();
      return cv.toDataURL('image/png');
    };
    try { return { icon_192: draw(192), icon_512: draw(512) }; } catch { return {}; } // foto de otro dominio sin permiso: sin ícono propio
  }

  async function saveDraft() {
    $('#edErr').textContent = '';
    if (!draft.name) { $('#edErr').textContent = 'Escribe el nombre en la tarjeta.'; $('.pcard [data-k="name"]').focus(); return; }
    const body = { id: draft.id, slug: draft.slug, accent: draft.accent, ...Object.fromEntries([...TEXT_KEYS, ...CONTACTS.map((c) => c[0])].map((k) => [k, draft[k]])) };
    if (draft.photo_data !== undefined) { body.photo_data = draft.photo_data; body.photo_url = ''; }
    if (!body.id) delete body.id;
    const btn = $('#edSave'); btn.disabled = true;
    Object.assign(body, await makeIcons());
    try {
      const r = await api('cards', { method: 'POST', body });
      draft.id = r.id; draft.slug = r.slug; draft.photo_data = undefined; slugTouched = true;
      saved = snapshot(); renderPreview();
      $('#edTitle').textContent = 'Editar tarjeta'; $('#edDelete').hidden = false; $('#edOpen').hidden = false;
      toast('Tarjeta guardada y publicada');
    } catch (x) { $('#edErr').textContent = x.message.includes('UNIQUE') ? 'Ese enlace ya lo usa otra tarjeta; cámbialo.' : x.message; }
    btn.disabled = false;
  }
  $('#edSave').addEventListener('click', saveDraft);
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's' && !$('#cardEditor').hidden) { e.preventDefault(); saveDraft(); } });

  function closeEditor() {
    if (snapshot() !== saved && !confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) return;
    $('#cardEditor').hidden = true; $('#cardsGallery').hidden = false; draft = null; load();
  }
  $('#cardBack').addEventListener('click', closeEditor);
  $('#edDelete').addEventListener('click', async () => {
    if (!draft.id || !confirm(`¿Borrar la tarjeta de ${draft.name}? El enlace y el QR dejarán de funcionar.`)) return;
    await api('cards?id=' + draft.id, { method: 'DELETE' }); saved = snapshot(); closeEditor(); toast('Tarjeta borrada');
  });
  $('#edCopy').addEventListener('click', () => copy(`${ORIGIN}/c/${draft.slug}`));
  $('#edQrDl').addEventListener('click', () => {
    const q = qrcode(0, 'M'); q.addData(`${ORIGIN}/c/${draft.slug}`); q.make();
    const cv = document.createElement('canvas'), n = q.getModuleCount(), cell = 16, pad = 32; cv.width = cv.height = n * cell + pad * 2;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(pad + c * cell, pad + r * cell, cell, cell);
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `qr-${draft.slug}.png`; a.click();
  });
  $('#cardNew').addEventListener('click', () => openEditor(null));
  $('#cardsList').addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) return;
    const c = e.target.closest('[data-copy]'); if (c) { e.stopPropagation(); return copy(c.dataset.copy); }
    if (e.target.closest('#cardNew2')) return openEditor(null);
    const ed = e.target.closest('[data-card-edit]'); if (ed) openEditor(cards.find((x) => x.id === +ed.dataset.cardEdit));
  });
  $('#cardsList').addEventListener('keydown', (e) => { const ed = e.target.closest('[data-card-edit]'); if (ed && e.key === 'Enter') openEditor(cards.find((x) => x.id === +ed.dataset.cardEdit)); });
  window.addEventListener('beforeunload', (e) => { if (draft && snapshot() !== saved) e.preventDefault(); });
  return { show: load };
});
