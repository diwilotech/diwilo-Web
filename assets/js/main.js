/* Diwilo — interacciones y animaciones de scroll. Sin dependencias. */
(() => {
  'use strict';

  const CONTACT_EMAIL = 'hola@diwilo.com';
  const WHATSAPP = '573053840193';
  // Para recibir el formulario sin abrir el correo del visitante, pega aquí
  // un endpoint de Formspree / FormSubmit / n8n (POST JSON). Vacío = mailto.
  const FORM_ENDPOINT = '';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Cambia el contenido de un bloque con un pequeño fundido */
  function swap(el, fn) {
    if (!el) return;
    if (reduced) { fn(); return; }
    el.classList.add('swap', 'is-out');
    setTimeout(() => { fn(); requestAnimationFrame(() => el.classList.remove('is-out')); }, 200);
  }

  /* Grupo de botones con un único activo */
  function choice(buttons, onSelect, start = 0) {
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => select(i));
    });
    function select(i, silent) {
      buttons.forEach((b, j) => {
        b.classList.toggle('is-active', i === j);
        b.setAttribute('aria-pressed', String(i === j));
      });
      if (!silent) onSelect(i);
    }
    select(start, true);
    return select;
  }

  /* ---------------- Navegación ---------------- */
  function initNav() {
    const wrap = $('.nav-wrap');
    if (!wrap) return;
    const toggle = $('.nav__toggle', wrap);
    toggle?.addEventListener('click', () => {
      const open = wrap.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.innerHTML = open ? '<i class="ph-light ph-x"></i>' : '<i class="ph-light ph-list"></i>';
    });
    $$('.nav__links a', wrap).forEach((a) => a.addEventListener('click', () => wrap.classList.remove('is-open')));
  }

  /* ---------------- Scroll: progreso, nav, paralaje, línea de ruta ---------------- */
  function initScroll() {
    const bar = $('.scroll-progress');
    const nav = $('.nav-wrap');
    const grid = $('.page-bg__grid');
    const beam = $('.page-bg__beam');
    const route = $('.route');
    const steps = route ? $$('.route__step', route) : [];
    let ticking = false;

    function update() {
      ticking = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      nav?.classList.toggle('is-scrolled', y > 12);

      if (!reduced) {
        if (grid) grid.style.transform = `translate3d(0, ${y * 0.35}px, 0)`;
        if (beam) {
          beam.style.opacity = String(Math.max(0, 1 - y / 900));
          beam.style.transform = `translate3d(0, ${y * 0.2}px, 0) scaleX(${1 + y / 2500})`;
        }
      }

      if (route) {
        const r = route.getBoundingClientRect();
        const anchor = innerHeight * 0.6;
        const p = Math.min(1, Math.max(0, (anchor - r.top) / r.height));
        route.style.setProperty('--route', p.toFixed(3));
        steps.forEach((s) => {
          const sr = s.getBoundingClientRect();
          s.classList.toggle('is-lit', sr.top + 20 < anchor);
        });
      }
    }
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    update();
  }

  /* ---------------- Aparición al hacer scroll ---------------- */
  function initReveal() {
    // Escalonado automático para hijos de [data-stagger]
    $$('[data-stagger]').forEach((group) => {
      const step = Number(group.dataset.stagger) || 90;
      Array.from(group.children).forEach((child, i) => {
        if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', group.dataset.revealType || '');
        child.style.setProperty('--d', String(i * step));
      });
    });

    const items = $$('[data-reveal]');
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          e.target.dispatchEvent(new CustomEvent('reveal'));
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    items.forEach((el) => io.observe(el));
  }

  /* Ejecuta fn una sola vez cuando el elemento entra en pantalla */
  function onceVisible(el, fn, threshold = 0.35) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { threshold });
    io.observe(el);
  }

  /* ---------------- Hero: palabra por palabra ---------------- */
  function initHero() {
    $$('[data-split]').forEach((h) => {
      const words = h.textContent.trim().split(/\s+/);
      h.setAttribute('aria-label', h.textContent.trim());
      h.innerHTML = words.map((w, i) => `<span class="word" aria-hidden="true" style="--w:${i}">${esc(w)}</span>`).join(' ');
    });
  }

  /* ---------------- Contadores ---------------- */
  function initCounters() {
    $$('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const set = (v) => { el.textContent = prefix + v + suffix; };
      if (reduced) { set(target); return; }
      set(0);
      onceVisible(el, () => {
        const t0 = performance.now(), dur = 1600;
        const tick = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - k, 4);
          set(Math.round(target * eased));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, 0.6);
    });
  }

  /* ---------------- Foco de luz en tarjetas ---------------- */
  function initSpotlight() {
    if (reduced || matchMedia('(hover: none)').matches) return;
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest?.('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ================= DEMOS ================= */

  /* Flujo de automatización (puede haber varios en la página) */
  const FLOW = [
    { icon: 'ph-database', label: 'Extracción', t: '0.4 s', title: 'Extracción de datos', text: 'Leemos pedidos del CRM, adjuntos del correo y registros del ERP. Cada fuente con su propia credencial y su propio reintento.' },
    { icon: 'ph-funnel', label: 'Transformación', t: '1.2 s', title: 'Transformación', text: 'Normalizamos formatos, validamos reglas de negocio y descartamos duplicados antes de que lleguen al modelo.' },
    { icon: 'ph-brain', label: 'Inteligencia', t: '2.6 s', title: 'Inteligencia', text: 'Un modelo clasifica la solicitud y estima prioridad. Si la confianza baja del umbral, el caso pasa a una persona.' },
    { icon: 'ph-lightning', label: 'Acción', t: '0.8 s', title: 'Acción', text: 'Se crea la tarea en el CRM, se notifica al responsable y el resultado queda registrado para auditoría.' }
  ];

  function initFlow(root) {
    root.innerHTML = `
      <div class="demo__head">
        <span class="demo__label">Flujo de automatización</span>
        <span class="status" data-status>en espera</span>
      </div>
      <div class="flow__steps">
        ${FLOW.map((p) => `
          <button type="button" class="list-btn flow__step">
            <i class="ph-light ${p.icon}"></i><span>${p.label}</span><span class="list-btn__aside">${p.t}</span>
          </button>`).join('')}
      </div>
      <div class="inset" data-detail>
        <p class="h3 h3--sm" style="font-size:15px;margin:0 0 6px"></p>
        <p class="body"></p>
      </div>
      <div class="row" style="align-items:center;--gap:12px">
        <button type="button" class="btn btn--primary btn--sm" data-run>Ejecutar flujo</button>
        <span class="muted" style="font-size:12px" data-hint>Haz clic en cualquier paso</span>
      </div>`;

    const steps = $$('.flow__step', root);
    const detail = $('[data-detail]', root);
    const status = $('[data-status]', root);
    const run = $('[data-run]', root);
    const hint = $('[data-hint]', root);
    let running = false, timer;

    const show = (i) => {
      const d = FLOW[i];
      detail.children[0].textContent = d.title;
      detail.children[1].textContent = d.text;
    };
    const select = choice(steps, (i) => { if (!running) swap(detail, () => show(i)); });
    show(0);

    function go(i) {
      steps.forEach((s) => s.classList.remove('is-running'));
      if (i >= FLOW.length) {
        running = false;
        status.textContent = 'completado';
        status.classList.remove('is-running');
        run.textContent = 'Ejecutar de nuevo';
        hint.textContent = 'Haz clic en cualquier paso';
        return;
      }
      select(i, true);
      steps[i].classList.add('is-running');
      show(i);
      timer = setTimeout(() => go(i + 1), 850);
    }
    function start() {
      if (running) return;
      running = true;
      clearTimeout(timer);
      status.textContent = 'ejecutando';
      status.classList.add('is-on', 'is-running');
      run.textContent = 'Ejecutando…';
      hint.textContent = '5.0 s de punta a punta';
      go(0);
    }
    run.addEventListener('click', start);
    // Al aparecer en pantalla, el flujo se ejecuta solo una vez
    if (!reduced) onceVisible(root, () => setTimeout(start, 500), 0.6);
  }

  /* Tablero de operación */
  function initBoard(root) {
    const months = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const series = [
      { label: 'Horas manuales', unit: ' h', caption: 'horas manuales este mes', data: [420, 405, 388, 350, 322, 290, 268, 240, 221, 198, 182, 168] },
      { label: 'Casos resueltos', unit: '', caption: 'casos resueltos este mes', data: [180, 210, 245, 268, 300, 342, 361, 398, 430, 465, 498, 540] },
      { label: 'Errores', unit: '', caption: 'errores registrados este mes', data: [64, 58, 51, 44, 39, 31, 27, 22, 18, 14, 11, 9] }
    ];
    root.innerHTML = `
      <div class="demo__head" style="align-items:flex-start">
        <div>
          <p class="h3 h3--sm" style="margin:0">Tablero de operación</p>
          <p class="mono" style="margin-top:3px;font-size:11px;letter-spacing:.08em;text-transform:uppercase">Datos de demostración · 12 meses</p>
        </div>
        <div class="row" style="--gap:6px">
          ${series.map((s) => `<button type="button" class="pill pill--sm">${s.label}</button>`).join('')}
        </div>
      </div>
      <div class="board__metrics">
        <div><p class="board__big gradient-text" data-now></p><p class="muted" style="margin:3px 0 0;font-size:13px" data-caption></p></div>
        <div><p class="board__big" style="color:var(--sky)" data-delta></p><p class="muted" style="margin:3px 0 0;font-size:13px">frente al primer mes</p></div>
      </div>
      <div class="board__bars">
        ${months.map((m) => `<div class="bar"><div class="bar__fill"></div><span>${m}</span></div>`).join('')}
      </div>
      <div class="inset" style="font-size:13px;min-height:42px" data-tip>Pasa el cursor sobre una barra para ver el valor del mes.</div>`;

    const bars = $$('.bar', root);
    const tip = $('[data-tip]', root);
    let cur = 0, shown = false;
    const defaultTip = 'Pasa el cursor sobre una barra para ver el valor del mes.';

    function render() {
      const s = series[cur];
      const max = Math.max(...s.data);
      const first = s.data[0], last = s.data[s.data.length - 1];
      const delta = Math.round(((last - first) / first) * 100);
      $('[data-now]', root).textContent = last + s.unit;
      $('[data-caption]', root).textContent = s.caption;
      $('[data-delta]', root).textContent = (delta > 0 ? '+' : '') + delta + '%';
      bars.forEach((b, i) => {
        const h = shown ? Math.round((s.data[i] / max) * 100) : 0;
        const fill = b.firstElementChild;
        fill.style.transitionDelay = shown ? `${i * 40}ms` : '0ms';
        fill.style.setProperty('--h', String(h));
      });
      tip.textContent = defaultTip;
    }
    choice($$('.pill', root), (i) => { cur = i; render(); });
    bars.forEach((b, i) => {
      b.addEventListener('mouseenter', () => {
        const s = series[cur];
        tip.textContent = `Mes ${i + 1} · ${s.label.toLowerCase()}: ${s.data[i]}${s.unit}`;
      });
      b.addEventListener('mouseleave', () => { tip.textContent = defaultTip; });
    });
    render();
    // Las barras crecen cuando el tablero entra en pantalla
    onceVisible(root, () => { shown = true; render(); }, 0.4);
  }

  /* Agente de atención */
  function initAgent(root) {
    const hello = 'Hola, soy el agente de Diwilo. Puedo consultar pedidos, agendar visitas o responder sobre servicios. ¿Qué necesitas?';
    root.classList.add('agent');
    root.innerHTML = `
      <div class="agent__head">
        <span class="icon-circle icon-circle--sm" style="width:34px;height:34px;font-size:17px"><i class="ph-light ph-robot"></i></span>
        <div style="flex:1">
          <p class="h3 h3--sm" style="margin:0;font-size:15px">Agente de atención</p>
          <p class="mono" style="margin-top:2px;font-size:11px;letter-spacing:.08em;text-transform:uppercase">Demostración</p>
        </div>
        <button type="button" class="btn btn--sm" data-reset>Reiniciar</button>
      </div>
      <div class="agent__log" aria-live="polite"></div>
      <div class="agent__foot">
        <div class="row" style="--gap:6px">
          ${['¿Dónde está mi pedido?', '¿Cuánto cuesta?', 'Quiero agendar una cita'].map((s) => `<button type="button" class="pill pill--sm" data-suggest>${s}</button>`).join('')}
        </div>
        <form class="row" style="--gap:8px;flex-wrap:nowrap">
          <label class="sr-only" for="agent-q">Tu pregunta</label>
          <input id="agent-q" class="input" name="q" placeholder="Escribe tu pregunta…" autocomplete="off">
          <button type="submit" class="btn btn--solid" aria-label="Enviar" style="padding:11px 18px"><i class="ph-light ph-paper-plane-tilt"></i></button>
        </form>
      </div>`;

    const log = $('.agent__log', root);
    const form = $('form', root);
    let timer;

    const add = (who, text) => {
      const m = document.createElement('div');
      m.className = `msg msg--${who}`;
      m.textContent = text;
      log.appendChild(m);
      log.scrollTop = log.scrollHeight;
      return m;
    };
    function reply(q) {
      const t = q.toLowerCase();
      let r = 'Anotado. Un asesor humano te contacta hoy mismo; mientras tanto, ¿quieres que te comparta un resumen de lo que automatizamos en tu sector?';
      if (/pedido|orden/.test(t)) r = 'Pedido #40213: despachado ayer 16:40, transportadora Envía, guía 9930-114.\n¿Te envío la guía por WhatsApp?';
      else if (/precio|costo|cu[aá]nto/.test(t)) r = 'Depende del alcance. Un diagnóstico de automatización toma 1 a 2 semanas y la primera sesión no tiene costo. ¿Agendamos?';
      else if (/cita|agenda|reun/.test(t)) r = 'Tengo disponible el jueves 10:00 y el viernes 15:00. ¿Cuál te sirve?';
      else if (/factura/.test(t)) r = 'Factura FV-2281 emitida el 3 de este mes por $2.480.000, estado: pagada. Te la reenvío al correo registrado.';
      else if (/servicio|hacen/.test(t)) r = 'Trabajamos en analítica de datos, automatización de flujos, agentes de IA y desarrollo de dashboards. ¿Cuál te interesa?';
      const typing = add('bot', 'escribiendo…');
      typing.classList.add('msg--typing');
      timer = setTimeout(() => { typing.remove(); add('bot', r); }, 800);
    }
    function send(q) {
      if (!q.trim()) return;
      add('me', q);
      form.q.value = '';
      reply(q);
    }
    function reset() { clearTimeout(timer); log.innerHTML = ''; add('bot', hello); }

    form.addEventListener('submit', (e) => { e.preventDefault(); send(form.q.value); });
    $$('[data-suggest]', root).forEach((b) => b.addEventListener('click', () => send(b.textContent)));
    $('[data-reset]', root).addEventListener('click', reset);
    reset();
  }

  /* ================= PÁGINAS ================= */

  /* Inicio: casos */
  function initCases() {
    const root = $('[data-cases]');
    if (!root) return;
    const cases = [
      { name: 'Dashboards PMO', sector: 'Construcción · PMO', img: 'assets/img/caso-pmo.jpg', text: 'Consolidamos avance, costo y cronograma de todos los proyectos en un tablero único que se alimenta solo desde las hojas y el ERP.', tags: ['Python', 'ETL', 'Dashboard'], done: ['Un tablero único para todos los proyectos', 'Carga automática desde hojas de cálculo y ERP', 'Alertas cuando un proyecto se desvía del cronograma'] },
      { name: 'Automatización n8n', sector: 'Operaciones', img: 'assets/img/caso-n8n.png', text: 'Flujos que integran CRM, correo y base de datos, con alertas y reintentos automáticos cuando una fuente falla.', tags: ['n8n', 'APIs', 'Webhooks'], done: ['CRM, correo y base de datos conectados', 'Reintentos automáticos ante fallas', 'Ejecución desatendida 24/7 con registro'] },
      { name: 'Becas Centenario', sector: 'Sector social', img: 'assets/img/caso-becas.png', text: 'Plataforma de gestión del programa: postulaciones en línea, seguimiento por etapas y reportes para el comité.', tags: ['Web', 'Supabase', 'Reportes'], done: ['Postulaciones 100% en línea', 'Seguimiento de cada becario por etapas', 'Reportes listos para el comité'] }
    ];
    const tabs = $('[data-cases-tabs]', root);
    tabs.innerHTML = cases.map((c) => `<button type="button" class="pill">${esc(c.name)}</button>`).join('');
    const body = $('[data-cases-body]', root);
    const img = $('[data-cases-img]', root);

    function render(i) {
      const c = cases[i];
      $('[data-f="sector"]', body).textContent = c.sector;
      $('[data-f="name"]', body).textContent = c.name;
      $('[data-f="text"]', body).textContent = c.text;
      $('[data-f="tags"]', body).innerHTML = c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
      $('[data-f="done"]', root).innerHTML = c.done.map((d) => `<div class="check"><i class="ph-light ph-check"></i><span>${esc(d)}</span></div>`).join('');
    }
    function swapImg(i) {
      img.classList.add('is-swapping');
      setTimeout(() => { img.src = cases[i].img; img.alt = cases[i].name; img.onload = () => img.classList.remove('is-swapping'); }, 250);
    }
    choice($$('.pill', tabs), (i) => { swap(body, () => render(i)); swapImg(i); });
    render(0);
  }

  /* Servicios: selector de demos */
  function initDemoSwitcher() {
    const root = $('[data-demos]');
    if (!root) return;
    const desc = $('[data-demos-desc]', root);
    const panes = $$('[data-pane]', root);
    const texts = [
      'Un tablero de operación con tres indicadores. Cambia de métrica y pasa el cursor sobre las barras para leer cada mes.',
      'Un flujo de cuatro etapas. Haz clic en cada paso para ver qué hace, o ejecútalo completo y observa el recorrido.',
      'Un agente de atención conectado a pedidos y agenda. Escríbele o usa una de las preguntas sugeridas.'
    ];
    choice($$('[data-demos-tabs] .pill', root), (i) => {
      swap(desc, () => { desc.textContent = texts[i]; });
      panes.forEach((p, j) => { p.hidden = i !== j; });
      const pane = panes[i];
      if (!reduced) pane.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.22,1,.36,1)' });
    });
  }

  /* Servicios: proyectos */
  function initProjects() {
    const root = $('[data-projects]');
    if (!root) return;
    const projects = [
      { name: 'Madetableros', type: 'Sitio corporativo', icon: 'ph-storefront', url: 'madetableros.com.co', link: 'https://madetableros.com.co/', img: 'assets/img/proy-madetableros.png', text: 'Sitio institucional con catálogo de productos y captación de contactos comerciales.', blocks: [['ph-image-square', 'Portada y propuesta de valor', '60%'], ['ph-squares-four', 'Catálogo por categorías', '80%'], ['ph-envelope-simple', 'Formulario de cotización', '45%']] },
      { name: 'Amor por Medellín', type: 'Portal institucional', icon: 'ph-heart', url: 'fundacionamorpormedellin.com', link: 'https://fundacionamorpormedellin.com/', img: 'assets/img/proy-amor.png', text: 'Portal de fundación con programas, convocatorias y canal de donaciones.', blocks: [['ph-users-three', 'Programas sociales', '70%'], ['ph-hand-heart', 'Donaciones en línea', '55%'], ['ph-newspaper', 'Noticias y convocatorias', '65%']] },
      { name: 'Rotary Medellín', type: 'Web informativa', icon: 'ph-globe-hemisphere-west', url: 'rotaryclubmedellin.org', link: 'https://www.rotaryclubmedellin.org/', img: 'assets/img/proy-rotary.png', text: 'Sitio informativo con agenda de actividades, proyectos y noticias del club.', blocks: [['ph-calendar-dots', 'Agenda de sesiones', '75%'], ['ph-projector-screen', 'Proyectos del club', '60%'], ['ph-article', 'Noticias', '50%']] },
      { name: 'Becas Centenario', type: 'Gestión de programas', icon: 'ph-graduation-cap', url: 'becasdelcentenariorotario.org', link: 'https://www.becasdelcentenariorotario.org/', img: 'assets/img/caso-becas.png', text: 'Plataforma de postulación y seguimiento del programa de becas, con reportes para el comité.', blocks: [['ph-file-text', 'Formulario de postulación', '85%'], ['ph-list-checks', 'Seguimiento por etapas', '70%'], ['ph-chart-pie-slice', 'Reportes del comité', '55%']] },
      { name: 'Dashboards PMO', type: 'Dashboard', icon: 'ph-squares-four', url: 'app.interno/pmo', link: '', img: 'assets/img/caso-pmo.jpg', text: 'Indicadores de proyecto en tiempo real: avance, costo y cronograma consolidados.', blocks: [['ph-gauge', 'Avance por proyecto', '90%'], ['ph-currency-circle-dollar', 'Ejecución presupuestal', '65%'], ['ph-warning-circle', 'Alertas de desviación', '40%']] },
      { name: 'Panel n8n', type: 'Automatización', icon: 'ph-flow-arrow', url: 'app.interno/flujos', link: '', img: 'assets/img/caso-n8n.png', text: 'Monitoreo de flujos automatizados con analítica de ejecuciones y reintentos.', blocks: [['ph-play-circle', 'Ejecuciones del día', '80%'], ['ph-arrows-clockwise', 'Reintentos automáticos', '35%'], ['ph-bell-ringing', 'Alertas a responsables', '50%']] }
    ];
    const list = $('[data-projects-list]', root);
    list.innerHTML = projects.map((p) => `
      <button type="button" class="list-btn">
        <i class="ph-light ${p.icon}"></i>
        <span><span class="list-btn__title">${esc(p.name)}</span><span class="list-btn__meta">${esc(p.type)}</span></span>
      </button>`).join('');
    const url = $('[data-f="url"]', root), img = $('[data-f="img"]', root), body = $('[data-f="body"]', root);
    function render(i) {
      const p = projects[i];
      url.textContent = p.url;
      $('[data-f="blocks"]', root).innerHTML = p.blocks.map((b) => `<div class="block-row"><i class="ph-light ${b[0]}"></i><span>${esc(b[1])}</span><span class="meter" style="width:${b[2]}"></span></div>`).join('');
      $('[data-f="text"]', root).textContent = p.text;
      const link = $('[data-f="link"]', root);
      link.hidden = !p.link;
      if (p.link) link.href = p.link;
    }
    choice($$('.list-btn', list), (i) => {
      img.classList.add('is-swapping');
      setTimeout(() => { img.src = projects[i].img; img.alt = projects[i].name; img.onload = () => img.classList.remove('is-swapping'); }, 250);
      swap(body, () => render(i));
    });
    render(0);
  }

  /* Arquitectura: capas */
  function initLayers() {
    const root = $('[data-layers]');
    if (!root) return;
    const layers = [
      { name: 'Fuentes de datos', level: 'Capa 1', icon: 'ph-database', text: 'Todo lo que ya existe en la empresa: bases de datos, hojas de cálculo, correo, documentos escaneados y APIs de terceros.', points: ['Conectores con credenciales aisladas por fuente', 'Lectura incremental para no recargar los sistemas', 'Registro de qué se leyó y cuándo'], tags: ['PostgreSQL', 'Google Sheets', 'APIs REST'] },
      { name: 'Orquestación', level: 'Capa 2', icon: 'ph-flow-arrow', text: 'El motor que decide qué corre, cuándo y en qué orden. Cada ejecución queda registrada con su resultado.', points: ['Reintentos automáticos ante fallas de red', 'Colas para no saturar servicios externos', 'Alertas al responsable cuando algo se detiene'], tags: ['n8n', 'Webhooks', 'Cron'] },
      { name: 'Datos y modelos', level: 'Capa 3', icon: 'ph-brain', text: 'Donde vive la lógica analítica: transformaciones, reglas de negocio y modelos de predicción o clasificación.', points: ['Versionado de datos y de modelos', 'Umbral de confianza con paso a revisión humana', 'Monitoreo de deriva y reentrenamiento'], tags: ['Python', 'scikit-learn', 'LLMs'] },
      { name: 'Aplicación', level: 'Capa 4', icon: 'ph-squares-four', text: 'La interfaz con la que trabaja tu equipo: dashboards, formularios, portales y canales de atención.', points: ['Accesos por rol y registro de auditoría', 'Tableros con la fuente de cada número', 'Atención integrada a WhatsApp y correo'], tags: ['Supabase', 'Web dashboards', 'Chatwoot'] },
      { name: 'Infraestructura', level: 'Capa 5', icon: 'ph-hard-drives', text: 'Servidores dedicados y contenedores, con respaldos programados y monitoreo de disponibilidad.', points: ['Ambientes separados de pruebas y producción', 'Despliegues reversibles', 'Cifrado en tránsito y en reposo'], tags: ['GNU/Linux', 'Docker', 'Dokploy'] }
    ];
    const list = $('[data-layers-list]', root);
    list.innerHTML = layers.map((l) => `
      <button type="button" class="list-btn" style="padding:15px 18px">
        <i class="ph-light ${l.icon}" style="font-size:19px"></i>
        <span class="list-btn__title">${esc(l.name)}</span>
        <span class="list-btn__aside">${esc(l.level)}</span>
      </button>`).join('');
    const panel = $('[data-layers-panel]', root);
    function render(i) {
      const l = layers[i];
      $('[data-f="level"]', panel).textContent = l.level;
      $('[data-f="name"]', panel).textContent = l.name;
      $('[data-f="text"]', panel).textContent = l.text;
      $('[data-f="points"]', panel).innerHTML = l.points.map((p) => `<div class="check" style="box-shadow:none;padding:0"><i class="ph-light ph-check"></i><span>${esc(p)}</span></div>`).join('');
      $('[data-f="tags"]', panel).innerHTML = l.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    }
    choice($$('.list-btn', list), (i) => swap(panel, () => render(i)));
    render(0);
  }

  /* Arquitectura: metodologías */
  function initMethods() {
    const root = $('[data-methods]');
    if (!root) return;
    const methods = [
      { name: 'Scrum', use: 'Entrega de producto', text: 'Sprints de dos semanas, backlog priorizado con el cliente y demo al cierre de cada ciclo. El alcance se ajusta sobre lo que ya funciona.', out: 'backlog, demo quincenal, informe de sprint', phases: ['Refinamiento del backlog', 'Planeación del sprint', 'Desarrollo y seguimiento diario', 'Demo y retrospectiva'] },
      { name: 'Kanban', use: 'Soporte y flujo continuo', text: 'Para operación y mantenimiento: tablero con límites de trabajo en curso y tiempos de respuesta acordados.', out: 'tablero compartido, SLA de atención', phases: ['Ingreso y clasificación', 'En curso con límite de WIP', 'Revisión', 'Cerrado y medido'] },
      { name: 'CRISP-DM', use: 'Proyectos de datos', text: 'Entendimiento del negocio y de los datos, preparación, modelado, evaluación y despliegue. Nada se modela antes de entender el proceso.', out: 'informe de datos, modelo evaluado, plan de despliegue', phases: ['Entendimiento del negocio', 'Entendimiento y preparación de datos', 'Modelado', 'Evaluación y despliegue'] },
      { name: 'MLOps y DevOps', use: 'Modelos en producción', text: 'Versionado de datos y modelos, integración y despliegue continuos, monitoreo de deriva y reentrenamiento programado.', out: 'pipeline CI/CD, tablero de monitoreo', phases: ['Versionado de datos y código', 'Integración continua y pruebas', 'Despliegue automatizado', 'Monitoreo y reentrenamiento'] },
      { name: 'PMI / PMBOK', use: 'Gestión de proyectos', text: 'Para contratos con entidades y organizaciones que exigen acta de constitución, cronograma formal y control de cambios.', out: 'acta, cronograma, matriz de riesgos', phases: ['Inicio y acta de constitución', 'Planeación y cronograma', 'Ejecución y control de cambios', 'Cierre y lecciones aprendidas'] },
      { name: 'Ley 1581 / ISO 27001', use: 'Protección de datos', text: 'Tratamiento de datos personales conforme a la norma colombiana: autorización, finalidad, control de acceso y cifrado en tránsito y reposo.', out: 'política de tratamiento, registro de accesos', phases: ['Inventario de datos personales', 'Autorización y finalidad', 'Controles de acceso y cifrado', 'Revisión periódica'] }
    ];
    const tabs = $('[data-methods-tabs]', root);
    tabs.innerHTML = methods.map((m) => `<button type="button" class="pill">${esc(m.name)}</button>`).join('');
    const panel = $('[data-methods-panel]', root);
    function render(i) {
      const m = methods[i];
      $('[data-f="use"]', panel).textContent = m.use;
      $('[data-f="name"]', panel).textContent = m.name;
      $('[data-f="text"]', panel).textContent = m.text;
      $('[data-f="out"]', panel).textContent = m.out;
      $('[data-f="phases"]', panel).innerHTML = m.phases.map((p, j) => `<div class="phase"><span class="phase__num">0${j + 1}</span><span class="phase__label">${esc(p)}</span><span class="phase__dot"></span></div>`).join('');
    }
    choice($$('.pill', tabs), (i) => swap(panel, () => render(i)));
    render(0);
  }

  /* Arquitectura: ecosistema */
  function initStack() {
    const root = $('[data-stack]');
    if (!root) return;
    const out = $('[data-stack-detail]', root);
    const def = out.textContent;
    $$('.tool', root).forEach((t) => {
      const show = () => { out.textContent = t.dataset.detail; };
      const hide = () => { out.textContent = def; };
      t.addEventListener('mouseenter', show);
      t.addEventListener('focus', show);
      t.addEventListener('mouseleave', hide);
      t.addEventListener('blur', hide);
    });
  }

  /* Contacto: formulario */
  function initContact() {
    const form = $('[data-contact]');
    if (!form) return;
    const topics = $$('[data-topic]', form);
    topics.forEach((b) => b.addEventListener('click', () => {
      const on = b.classList.toggle('is-active');
      b.setAttribute('aria-pressed', String(on));
    }));
    const wrap = form.parentElement;
    const done = $('[data-contact-done]', wrap);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const data = {
        nombre: (f.get('nombre') || '').toString().trim(),
        correo: (f.get('correo') || '').toString().trim(),
        telefono: (f.get('telefono') || '').toString().trim(),
        temas: topics.filter((b) => b.classList.contains('is-active')).map((b) => b.textContent).join(', '),
        mensaje: (f.get('mensaje') || '').toString().trim()
      };
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      let sent = false;
      if (FORM_ENDPOINT) {
        try {
          const r = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
          sent = r.ok;
        } catch (_) { sent = false; }
      }
      if (!sent) {
        const body = `Nombre y empresa: ${data.nombre}\nCorreo: ${data.correo}\nWhatsApp: ${data.telefono || '-'}\nNecesito: ${data.temas || '-'}\n\n${data.mensaje}`;
        location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Diagnóstico — ' + data.nombre)}&body=${encodeURIComponent(body)}`;
      }
      $('[data-f="name"]', done).textContent = data.nombre.split(/[\s·]+/)[0] || '';
      $('[data-f="mail"]', done).textContent = data.correo || 'tu correo';
      form.hidden = true;
      done.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Enviar mensaje';
    });
    $('[data-contact-reset]', wrap)?.addEventListener('click', () => {
      form.reset();
      topics.forEach((b) => { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); });
      done.hidden = true;
      form.hidden = false;
    });
  }

  /* Contacto: calculadora */
  function initCalc() {
    const root = $('[data-calc]');
    if (!root) return;
    const inputs = $$('input[type="range"]', root);
    const hoursEl = $('[data-f="hours"]', root), daysEl = $('[data-f="days"]', root);
    let shown = 0, raf;
    function animateTo(target) {
      cancelAnimationFrame(raf);
      const from = shown, t0 = performance.now(), dur = reduced ? 1 : 500;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
        hoursEl.textContent = Math.round(shown) + ' h';
        daysEl.textContent = Math.round(shown / 8) + ' jornadas';
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    function update() {
      const v = {};
      inputs.forEach((i) => {
        v[i.name] = Number(i.value);
        i.style.setProperty('--p', ((i.value - i.min) / (i.max - i.min)) * 100 + '%');
        $(`[data-out="${i.name}"]`, root).textContent = i.value + (i.dataset.unit || '');
      });
      animateTo(v.personas * v.horas * 4.3 * (v.pct / 100));
    }
    inputs.forEach((i) => i.addEventListener('input', update));
    inputs.forEach((i) => i.style.setProperty('--p', ((i.value - i.min) / (i.max - i.min)) * 100 + '%'));
    onceVisible(root, update, 0.4);
  }

  /* ---------------- Arranque ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    initHero();
    initNav();
    $$('[data-demo="flow"]').forEach(initFlow);
    $$('[data-demo="board"]').forEach(initBoard);
    $$('[data-demo="agent"]').forEach(initAgent);
    initCases();
    initDemoSwitcher();
    initProjects();
    initLayers();
    initMethods();
    initStack();
    initContact();
    initCalc();
    initCounters();
    initReveal();
    initScroll();
    initSpotlight();
    const y = $('[data-year]');
    if (y) y.textContent = new Date().getFullYear();
  });
})();
