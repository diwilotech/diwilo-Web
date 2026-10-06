/**
 * diwilo — lógica dinámica de diwilo.com (se ejecuta como Pages Functions, ver functions/)
 *
 * Público (CORS para el sitio):
 *   POST /api/track        eventos y visitas
 *   POST /api/lead         formulario de contacto
 *   POST /api/chat         chat de IA del sitio
 *   POST /mcp              servidor MCP (herramientas para agentes de IA)
 *   GET  /api/health       estado del servicio
 *   GET  /l/:slug          link de rastreo (redirige y cuenta el clic)
 *   GET  /c/:slug          tarjeta de presentación   (/c/:slug.vcf descarga el contacto)
 * Integraciones (Authorization: Bearer dwl_...):
 *   GET  /v1/leads  /v1/events  /v1/chats  /v1/stats   POST /v1/links
 * Panel (protegido con Cloudflare Access, ver access.js):
 *   /admin/api/*           API del panel (public/admin.html)
 *   /admin/api/platform/*  negocios, usuarios y suscripciones de Pedidos, Nutrición y Citas (platform.js)
 */
import { renderCard, renderVcf, cardManifest, CARD_SW } from './card.js';
import { adminEmail } from './access.js';
import { platformApi } from './platform.js';
import { blogAdmin } from './blog.js';

const DAY = 86400000;
const DEFAULT_PROMPT = `Eres el asistente virtual de Diwilo, una empresa de Medellín (Colombia) que diseña, construye y opera software de datos, automatización y agentes de IA para empresas, fundaciones y equipos de producto.

Servicios: analítica y ciencia de datos (Python, SQL, modelos predictivos); automatización de flujos (n8n, APIs, webhooks); agentes de IA y chatbots integrados a WhatsApp (Chatwoot, WhatsApp Business); extracción de datos (OCR, scraping, ETL); dashboards y tableros (Supabase, web dashboards); sitios y apps web.
Formas de trabajo: diagnóstico de automatización (1 a 2 semanas, primera sesión de 45 minutos sin costo); proyecto cerrado (4 a 12 semanas, sprints de dos semanas con demo); operación y soporte mensual.
Metodologías: Scrum, Kanban, CRISP-DM, MLOps, PMI. Datos tratados conforme a la Ley 1581 de 2012; se firma NDA si se necesita.
Casos: Dashboards PMO para construcción, automatizaciones con n8n, plataforma de Becas del Centenario Rotario, sitios para Madetableros, Fundación Amor por Medellín, Rotary Club Medellín y Fundación Jardín de Amor (jardindeamor.org, creada, gestionada y optimizada con IA).
Contacto: hola@diwilo.com · WhatsApp +57 305 384 0193 · formulario en https://diwilo.com/contacto

Reglas: responde en español, breve (máximo 4 frases), cálido y concreto. No inventes precios: explica que dependen del alcance y ofrece el diagnóstico sin costo. Si la persona quiere avanzar, hablar con alguien o pedir una cotización, invítala a tocar el botón «Seguir por WhatsApp» que aparece en este chat: envía a Diwilo un resumen de esta conversación para no repetir todo. No escribas el número de teléfono salvo que te lo pidan. Si no sabes algo, dilo y ofrece contacto humano. No hables de temas ajenos a Diwilo y sus servicios.`;

/* Lo que el asistente sabe de las apps propias. Se agrega siempre al prompt (también si se editó en el panel),
   con los días de prueba y precios que estén configurados en Negocios. */
const APPS_INFO = [
  { name: 'CD Pedidos', url: 'https://cdpedidos.diwilo.com', guide: 'https://diwilo.com/blog/como-elegir-software-para-restaurantes', key: 'pedidos',
    for: 'restaurantes, bares y negocios de mostrador',
    does: 'plano interactivo de mesas por pisos, comandas y cuentas por mesa, guardar la cuenta para pagar después a nombre de un cliente, inventario que se descuenta al vender con reposición e historial, cuentas por cobrar (cargos, abonos y saldo), catálogo editable, tablero con ventas del día por persona y por categoría, usuario por cada persona del equipo; se instala en el celular y funciona sin conexión' },
  { name: 'CD Nutrición', url: 'https://cdnutricion.diwilo.com', guide: 'https://diwilo.com/blog/como-elegir-software-para-nutricionistas', key: 'nutricion',
    for: 'consultorios de nutrición y nutricionistas',
    does: 'pacientes con su historial, consultas con antropometría, vista Cuerpo Vivo (figura animada con medidas, salud, evolución y plan de alimentación), exámenes y archivos del paciente, agenda de citas, informe de la consulta en PDF con QR, seguimiento del paciente por enlace privado sin contraseña (marca comidas, agua y metas), página pública del consultorio con mapa y horario, equipo con usuarios, avisos por WhatsApp' },
  { name: 'CD Citas', url: 'https://cdcitas.diwilo.com', guide: 'https://diwilo.com/blog/como-elegir-software-de-citas-y-reservas', key: 'citas',
    for: 'negocios que trabajan con citas o reservas (peluquerías, barberías, estética, consultorios, estudios)',
    does: 'página de reservas propia del negocio donde el cliente elige servicio, especialista y hora, servicios con duración, especialistas, espacios, clientes, bloqueos de horario, cancelar/reagendar/mover/reabrir citas, confirmaciones y recordatorios automáticos, avisos por WhatsApp con el número del negocio, página para que el cliente vea sus citas' },
  { name: 'CD Residentes', url: 'https://cdresidentes.diwilo.com', guide: 'https://diwilo.com/blog/como-elegir-software-propiedad-horizontal', key: 'residentes',
    for: 'administraciones de propiedad horizontal (conjuntos residenciales, edificios), una o varias copropiedades',
    does: 'propietarios y unidades con coeficiente, cartera por unidad (cuota de administración, intereses de mora, cobro jurídico, retroactivos, extraordinarias, parqueadero) con antigüedad de la deuda y recaudo, cuenta de cobro en PDF, portería (visitas, mudanzas, domicilios, mantenimiento, alarmas), PQRS con respuesta asistida por IA, reservas de zonas comunes con tarifa y calendario, censo de mascotas, comunicados por WhatsApp y correo con redacción por IA, asistente Diwilo AI que responde con los datos en vivo, y portal de propietarios (entran con apartamento y cédula para ver su cartera, cuenta de cobro, comunicados, mascotas y reservas)' },
];

async function appsKnowledge(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'platform_%'").all();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const trial = Number(s.platform_trial_days ?? 15);
  const lines = APPS_INFO.map((a) => {
    const price = Number(s[`platform_price_${a.key}`] || 0);
    return `- ${a.name} (${a.url}) — para ${a.for}. Qué hace: ${a.does}. ${price ? `Precio de referencia: $${price.toLocaleString('es-CO')} COP al mes por negocio.` : 'Precio: depende del plan; se confirma en la demo.'} Guía: ${a.guide}`;
  });
  return `

APPS DE DIWILO (son productos propios de Diwilo, en la nube, que Diwilo administra; nunca digas que no existen):
${lines.join('\n')}
Cómo empezar con una app: la persona pide una demo (botón «Pedir demo» en https://diwilo.com/apps o por este chat); Diwilo crea la cuenta del negocio y envía al dueño un link para crear su contraseña; cada persona del equipo entra con su correo.${trial > 0 ? ` Los negocios nuevos tienen ${trial} días de prueba.` : ''} Se paga una suscripción mensual; si vence, la app queda en solo lectura (no se pierde nada). Todas las apps están en https://diwilo.com/apps.
Si preguntan por una app, explica para quién es y 2 o 3 funciones que encajen con lo que preguntó, comparte su guía o https://diwilo.com/apps y ofrece una demo. Si piden precio y no hay precio de referencia, di que depende del plan y ofrece la demo.`;
}

/* ---------------- utilidades ---------------- */
const now = () => Date.now();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const clip = (v, n = 500) => (v == null ? null : String(v).slice(0, n));
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function device(ua = '') {
  if (/bot|crawl|spider|slurp|preview/i.test(ua)) return 'bot';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'móvil';
  return 'escritorio';
}
function geo(req) {
  const cf = req.cf || {};
  return { country: cf.country || null, city: cf.city || null, device: device(req.headers.get('user-agent') || '') };
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes = 24) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function readJson(req, max = 20000) {
  const text = await req.text();
  if (text.length > max) throw new Error('too large');
  return text ? JSON.parse(text) : {};
}

/* ---------------- CORS ---------------- */
function allowedOrigin(env, origin) {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : null;
}
function cors(env, req, res) {
  const origin = allowedOrigin(env, req.headers.get('origin'));
  if (!origin) return res;
  const r = new Response(res.body, res);
  r.headers.set('access-control-allow-origin', origin);
  r.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  r.headers.set('access-control-allow-headers', 'content-type');
  r.headers.set('vary', 'origin');
  return r;
}

/* ---------------- ajustes ---------------- */
async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return { chat_prompt: s.chat_prompt || DEFAULT_PROMPT, webhook_url: s.webhook_url || '', chat_enabled: s.chat_enabled !== '0' };
}

/* Reenvía un evento a un webhook (n8n, Zapier, Make…) si está configurado */
async function fireWebhook(env, type, payload) {
  const { webhook_url } = await getSettings(env);
  if (!webhook_url) return;
  try {
    await fetch(webhook_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, at: new Date().toISOString(), data: payload }) });
  } catch (_) { /* el webhook no debe romper la respuesta */ }
}

/* ================= API PÚBLICA ================= */
async function apiTrack(req, env) {
  const b = await readJson(req, 4000);
  const g = geo(req);
  if (g.device === 'bot') return json({ ok: true });
  await env.DB.prepare(`INSERT INTO events (ts, type, path, label, ref, utm_source, utm_medium, utm_campaign, sid, country, city, device)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    now(), clip(b.type || 'pageview', 40), clip(b.path, 300), clip(b.label, 200), clip(b.ref, 300),
    clip(b.utm_source, 100), clip(b.utm_medium, 100), clip(b.utm_campaign, 100), clip(b.sid, 64),
    g.country, g.city, g.device).run();
  return json({ ok: true });
}

/* Guarda un lead (formulario del sitio, servidor MCP o WebMCP) y avisa al webhook */
async function createLead(req, env, ctx, b) {
  if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw new Error('correo inválido');
  const g = geo(req);
  const lead = {
    name: clip(b.name, 200), email: clip(b.email, 200), phone: clip(b.phone, 60), topics: clip(b.topics, 300),
    message: clip(b.message, 4000), page: clip(b.page, 300),
    utm_source: clip(b.utm_source, 100), utm_medium: clip(b.utm_medium, 100), utm_campaign: clip(b.utm_campaign, 100), country: g.country
  };
  const r = await env.DB.prepare(`INSERT INTO leads (ts, name, email, phone, topics, message, page, utm_source, utm_medium, utm_campaign, country)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(now(), lead.name, lead.email, lead.phone, lead.topics, lead.message, lead.page,
    lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.country).run();
  await env.DB.prepare('INSERT INTO events (ts, type, path, label, sid, country, city, device) VALUES (?,?,?,?,?,?,?,?)')
    .bind(now(), 'lead', lead.page, clip(b.via, 40), clip(b.sid, 64), g.country, g.city, g.device).run();
  ctx.waitUntil(fireWebhook(env, 'lead', { id: r.meta.last_row_id, ...lead }));
  return r.meta.last_row_id;
}

async function apiLead(req, env, ctx) {
  const b = await readJson(req, 10000);
  if (b.website) return json({ ok: true }); // campo trampa anti-spam
  try { return json({ ok: true, id: await createLead(req, env, ctx, b) }); }
  catch (e) { return json({ ok: false, error: e.message }, 400); }
}

/* ================= SERVIDOR MCP (Streamable HTTP, sin estado) ================= */
const MCP_INFO = {
  apps: 'Apps propias de Diwilo (https://diwilo.com/apps):\n' + APPS_INFO.map((a) => `- ${a.name} (${a.url}): para ${a.for}. ${a.does}.`).join('\n') + '\nSe empieza con una demo; Diwilo crea la cuenta y se paga una suscripción mensual.',
  servicios: `Servicios de Diwilo (Medellín, Colombia):
- Analítica y ciencia de datos: modelos predictivos, segmentación y pronóstico (Python, SQL, scikit-learn).
- Automatización de flujos: conectar sistemas y eliminar trabajo repetitivo (n8n, APIs, webhooks).
- Agentes de IA: atienden clientes y ejecutan tareas 24/7 (LLMs, RAG, herramientas propias).
- Chatbots y atención: bots integrados a WhatsApp y otros canales (Chatwoot, WhatsApp Business).
- Extracción de datos: documentos, sitios web y bases de datos (OCR, scraping, ETL).
- Dashboards y tableros: indicadores en tiempo real con accesos por rol (Supabase, web dashboards).
- Sitios y apps web.
Modalidades: diagnóstico de automatización (1 a 2 semanas, primera sesión de 45 min sin costo); proyecto cerrado (4 a 12 semanas, sprints de 2 semanas); operación y soporte mensual. Los precios dependen del alcance.`,
  casos: `Casos: Dashboards PMO para construcción (avance, costo y cronograma en un tablero que se alimenta de hojas y ERP); automatizaciones con n8n (CRM, correo y base de datos con reintentos y alertas); plataforma de Becas del Centenario Rotario (postulación y seguimiento); sitios para Madetableros, Fundación Amor por Medellín, Rotary Club Medellín y Fundación Jardín de Amor (jardindeamor.org, creada, gestionada y optimizada con IA).`,
  metodologia: `Metodologías: Scrum, Kanban, CRISP-DM, MLOps/DevOps, PMI/PMBOK. Protección de datos conforme a la Ley 1581 de 2012 (Colombia); se firma NDA si se requiere. Arquitectura: fuentes de datos → orquestación (n8n) → datos y modelos (Python, LLMs) → aplicación (Supabase, dashboards, Chatwoot) → infraestructura (GNU/Linux, Docker, Dokploy).`,
  contacto: `Contacto: hola@diwilo.com · WhatsApp +57 305 384 0193 (https://wa.me/573053840193) · Medellín, Colombia · https://diwilo.com/contacto. Respuesta en menos de 24 horas hábiles.`
};
const MCP_TOOLS = [
  {
    name: 'diwilo_info',
    title: 'Información de Diwilo',
    description: 'Devuelve información de Diwilo: servicios y modalidades, apps propias (Pedidos, Nutrición, Citas, Residentes), casos, metodologías o datos de contacto.',
    inputSchema: { type: 'object', properties: { tema: { type: 'string', enum: ['servicios', 'apps', 'casos', 'metodologia', 'contacto', 'todo'], description: 'Tema a consultar' } }, required: ['tema'] },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'diwilo_solicitar_diagnostico',
    title: 'Solicitar diagnóstico',
    description: 'Envía a Diwilo una solicitud de diagnóstico de automatización (primera sesión sin costo). Úsala solo con el consentimiento de la persona y con sus datos reales.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre y empresa de quien solicita' },
        correo: { type: 'string', format: 'email', description: 'Correo de contacto' },
        telefono: { type: 'string', description: 'WhatsApp o teléfono (opcional)' },
        necesidad: { type: 'string', description: 'Proceso que quiere automatizar o problema a resolver' }
      },
      required: ['nombre', 'correo', 'necesidad']
    }
  }
];

async function mcpServer(req, env, ctx) {
  if (req.method === 'GET' || req.method === 'DELETE') return new Response('Este servidor MCP es sin estado: usa POST con JSON-RPC.', { status: 405, headers: { allow: 'POST' } });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  let msg;
  try { msg = await readJson(req, 20000); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, 400); }
  const ok = (id, result) => json({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => json({ jsonrpc: '2.0', id, error: { code, message } });
  if (Array.isArray(msg)) return fail(null, -32600, 'Lotes no soportados');
  const { id = null, method, params = {} } = msg;
  if (id === null && method?.startsWith('notifications/')) return new Response(null, { status: 202 });
  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'diwilo', title: 'Diwilo', version: '1.0.0' },
        instructions: 'Servidor de Diwilo (datos, automatización y agentes de IA en Medellín). Usa diwilo_info para conocer servicios y diwilo_solicitar_diagnostico para pedir una sesión sin costo.'
      });
    case 'ping': return ok(id, {});
    case 'tools/list': return ok(id, { tools: MCP_TOOLS });
    case 'tools/call': {
      const a = params.arguments || {};
      if (params.name === 'diwilo_info') {
        const text = a.tema === 'todo' || !MCP_INFO[a.tema] ? Object.values(MCP_INFO).join('\n\n') : MCP_INFO[a.tema];
        return ok(id, { content: [{ type: 'text', text }] });
      }
      if (params.name === 'diwilo_solicitar_diagnostico') {
        try {
          const leadId = await createLead(req, env, ctx, { name: a.nombre, email: a.correo, phone: a.telefono, message: a.necesidad, topics: 'Diagnóstico (agente IA)', page: '/mcp', via: 'mcp' });
          return ok(id, { content: [{ type: 'text', text: `Solicitud #${leadId} recibida. Diwilo responderá a ${a.correo} en menos de 24 horas hábiles.` }] });
        } catch (e) {
          return ok(id, { isError: true, content: [{ type: 'text', text: `No se pudo enviar: ${e.message}` }] });
        }
      }
      return fail(id, -32602, `Herramienta desconocida: ${params.name}`);
    }
    default: return fail(id, -32601, `Método no soportado: ${method}`);
  }
}

async function callAI(env, system, history) {
  // Gemini si hay clave configurada como secreto; si no, Workers AI de Cloudflare
  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 400, temperature: 0.5 }
      })
    });
    if (r.ok) {
      const d = await r.json();
      const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
      if (text) return text;
    }
    // si Gemini falla, seguimos con Workers AI
  }
  const out = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [{ role: 'system', content: system }, ...history],
    max_tokens: 400, temperature: 0.5
  });
  return String(out?.response ?? out?.choices?.[0]?.message?.content ?? '').trim();
}

async function apiChat(req, env, ctx) {
  const b = await readJson(req, 30000);
  const settings = await getSettings(env);
  if (!settings.chat_enabled) return json({ reply: 'El chat está en pausa. Toca «Seguir por WhatsApp» y te respondemos enseguida.', handoff: true });
  const sid = clip(b.sid, 64);
  const text = clip((b.message || '').trim(), 1000);
  if (!sid || !text) return json({ error: 'mensaje vacío' }, 400);

  // límite: 20 mensajes por conversación cada 10 minutos
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM messages WHERE chat_id = ? AND role = 'user' AND ts > ?").bind(sid, now() - 10 * 60000).first();
  if (recent.n >= 20) return json({ reply: 'Has enviado muchos mensajes seguidos. Para seguir, toca «Seguir por WhatsApp»: le enviamos a Diwilo el resumen de esta conversación.', handoff: true });

  const g = geo(req);
  await env.DB.prepare(`INSERT INTO chats (id, started_at, last_at, page, country, city, device, msg_count) VALUES (?,?,?,?,?,?,?,0)
    ON CONFLICT(id) DO UPDATE SET last_at = excluded.last_at`).bind(sid, now(), now(), clip(b.page, 300), g.country, g.city, g.device).run();
  await env.DB.prepare("INSERT INTO messages (chat_id, ts, role, content) VALUES (?,?,'user',?)").bind(sid, now(), text).run();

  // Respuesta predeterminada del chat de inicio: solo se guarda, sin llamar a la IA
  if (typeof b.canned === 'string' && b.canned.trim()) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO messages (chat_id, ts, role, content) VALUES (?,?,'assistant',?)").bind(sid, now() + 1, clip(b.canned.trim(), 1500)),
      env.DB.prepare('UPDATE chats SET msg_count = msg_count + 2, last_at = ? WHERE id = ?').bind(now(), sid)
    ]);
    return json({ ok: true, canned: true });
  }

  const { results } = await env.DB.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY ts DESC, id DESC LIMIT 16').bind(sid).all();
  const history = results.reverse();

  let reply;
  try {
    reply = await callAI(env, settings.chat_prompt + (await appsKnowledge(env)), history);
  } catch (e) {
    console.error('chat error', e);
  }
  if (!reply) reply = 'Ahora mismo no puedo responder. Toca «Seguir por WhatsApp» o escríbenos a hola@diwilo.com.';
  await env.DB.batch([
    env.DB.prepare("INSERT INTO messages (chat_id, ts, role, content) VALUES (?,?,'assistant',?)").bind(sid, now() + 1, reply),
    env.DB.prepare('UPDATE chats SET msg_count = msg_count + 2, last_at = ? WHERE id = ?').bind(now(), sid)
  ]);
  if (history.length <= 1) ctx.waitUntil(fireWebhook(env, 'chat_started', { chat_id: sid, first_message: text, page: b.page, country: g.country }));
  return json({ reply, handoff: HANDOFF_HINT.test(reply) });
}

/* Pasar a WhatsApp con un resumen de la conversación (lo escribe la IA, en primera persona del visitante) */
const WA_NUMBER = '573053840193';
const HANDOFF_HINT = /whats\s?app|asesor|una persona|alguien del equipo|agendar|demo|cotiza|contact/i;

async function apiHandoff(req, env, ctx) {
  const b = await readJson(req, 4000);
  const sid = clip(b.sid, 64);
  const intro = 'Hola Diwilo, vengo del chat de diwilo.com.';
  let summary = '';
  if (sid) {
    const { results } = await env.DB.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY ts DESC, id DESC LIMIT 20').bind(sid).all();
    const convo = results.reverse();
    if (convo.some((m) => m.role === 'user')) {
      try {
        const text = convo.map((m) => `${m.role === 'user' ? 'Visitante' : 'Asistente'}: ${m.content}`).join('\n').slice(-6000);
        summary = await callAI(env,
          'Escribe en español, en primera persona del visitante, un resumen de máximo 3 frases cortas con lo que el VISITANTE dijo y preguntó: su tipo de negocio o tamaño (solo si lo mencionó), la app o servicio que le interesa y sus preguntas. Usa solo lo que dijo el visitante: no agregues pedidos, datos ni intenciones que no escribió, y no repitas lo que respondió el asistente. Sin saludo ni despedida.',
          [{ role: 'user', content: text }]);
      } catch (e) { console.error('handoff', e); }
      if (!summary) summary = 'Me interesa: ' + convo.filter((m) => m.role === 'user').map((m) => m.content).slice(-3).join(' / ');
    }
  }
  summary = String(summary || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  const message = summary ? `${intro}\n\n${summary}${sid ? `\n\n(Chat ${sid.slice(0, 6)})` : ''}` : `${intro} Quiero información sobre sus servicios.`;
  const g = geo(req);
  ctx.waitUntil(env.DB.prepare('INSERT INTO events (ts, type, path, label, sid, country, city, device) VALUES (?,?,?,?,?,?,?,?)')
    .bind(now(), 'click_whatsapp', clip(b.page, 300), 'Seguir por WhatsApp (con resumen)', sid, g.country, g.city, g.device).run());
  return json({ url: `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`, summary });
}

/* ---------------- links y tarjetas ---------------- */
async function trackLink(req, env, ctx, slug) {
  const link = await env.DB.prepare('SELECT * FROM links WHERE slug = ?').bind(slug).first();
  if (!link) return Response.redirect(new URL(req.url).origin + '/', 302);
  let target;
  try { target = new URL(link.target, req.url); } catch { return Response.redirect(new URL(req.url).origin + '/', 302); }
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) if (link[k] && !target.searchParams.has(k)) target.searchParams.set(k, link[k]);
  const g = geo(req);
  if (g.device !== 'bot') {
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('INSERT INTO clicks (link_id, ts, country, city, device, ref) VALUES (?,?,?,?,?,?)').bind(link.id, now(), g.country, g.city, g.device, clip(req.headers.get('referer'), 300)),
      env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').bind(link.id)
    ]));
  }
  return new Response(null, { status: 302, headers: { location: target.toString(), 'cache-control': 'no-store' } });
}

const CARD_COLS = 'id, slug, name, role, company, bio, phone, whatsapp, email, website, instagram, linkedin, photo_url, accent, views, created_at, updated_at, photo_data IS NOT NULL AS has_photo, icon_512 IS NOT NULL AS has_icon';

function dataUrlResponse(dataUrl, cache = 'public, max-age=31536000, immutable') {
  const m = dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response('No encontrado', { status: 404 });
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { 'content-type': m[1], 'cache-control': cache } });
}

async function showCard(req, env, ctx, slug) {
  // /c/sw.js → service worker de las tarjetas (funcionan sin conexión una vez abiertas)
  if (slug === 'sw.js') return new Response(CARD_SW, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache' } });

  // /c/<slug>/foto · /c/<slug>/icon-192.png · /c/<slug>/icon-512.png · /c/<slug>/manifest.webmanifest
  const sub = slug.match(/^([^/]+)\/(foto|icon-192\.png|icon-512\.png|manifest\.webmanifest)$/);
  if (sub) {
    const [, s, part] = sub;
    if (part === 'foto') return dataUrlResponse((await env.DB.prepare('SELECT photo_data v FROM cards WHERE slug = ?').bind(s).first())?.v);
    if (part !== 'manifest.webmanifest') {
      const col = part === 'icon-192.png' ? 'icon_192' : 'icon_512';
      const row = await env.DB.prepare(`SELECT ${col} v FROM cards WHERE slug = ?`).bind(s).first();
      if (!row) return new Response('No encontrado', { status: 404 });
      // sin ícono propio: el de Diwilo
      return row.v ? dataUrlResponse(row.v, 'public, max-age=3600') : Response.redirect(new URL(`/assets/img/icon-${part === 'icon-192.png' ? '192' : '512'}.png`, req.url), 302);
    }
    const card = await env.DB.prepare(`SELECT ${CARD_COLS} FROM cards WHERE slug = ?`).bind(s).first();
    if (!card) return new Response('No encontrado', { status: 404 });
    return new Response(JSON.stringify(cardManifest(card)), { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }

  const vcf = slug.endsWith('.vcf');
  const card = await env.DB.prepare(`SELECT ${CARD_COLS} FROM cards WHERE slug = ?`).bind(vcf ? slug.slice(0, -4) : slug).first();
  if (!card) return new Response('Tarjeta no encontrada', { status: 404 });
  const origin = new URL(req.url).origin;
  const v = card.updated_at || card.created_at;
  if (card.has_photo) card.photo_url = `${origin}/c/${encodeURIComponent(card.slug)}/foto?v=${v}`;
  if (vcf) {
    return new Response(renderVcf(card), { headers: { 'content-type': 'text/vcard; charset=utf-8', 'content-disposition': `attachment; filename="${card.slug}.vcf"` } });
  }
  if (geo(req).device !== 'bot') ctx.waitUntil(env.DB.prepare('UPDATE cards SET views = views + 1 WHERE id = ?').bind(card.id).run());
  return new Response(renderCard(card, origin), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}

/* ================= ESTADÍSTICAS ================= */
async function stats(env, days = 7) {
  const since = now() - days * DAY, today = now() - DAY, live = now() - 5 * 60000;
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const [kpi, series, pages, refs, countries, devices, utm, liveRow] = await env.DB.batch([
    q(`SELECT
        (SELECT COUNT(*) FROM events WHERE type='pageview' AND ts > ?) views,
        (SELECT COUNT(DISTINCT sid) FROM events WHERE type='pageview' AND ts > ?) visitors,
        (SELECT COUNT(*) FROM events WHERE type='pageview' AND ts > ?) views_today,
        (SELECT COUNT(*) FROM leads WHERE ts > ?) leads,
        (SELECT COUNT(*) FROM chats WHERE started_at > ?) chats,
        (SELECT COUNT(*) FROM events WHERE type='click_whatsapp' AND ts > ?) whatsapp,
        (SELECT COUNT(*) FROM clicks WHERE ts > ?) link_clicks`, since, since, today, since, since, since, since),
    q(`SELECT (ts / 86400000) d, COUNT(*) views, COUNT(DISTINCT sid) visitors FROM events WHERE type='pageview' AND ts > ? GROUP BY d ORDER BY d`, since),
    q(`SELECT path k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? GROUP BY path ORDER BY n DESC LIMIT 8`, since),
    q(`SELECT ref k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? AND ref IS NOT NULL AND ref != '' GROUP BY ref ORDER BY n DESC LIMIT 8`, since),
    q(`SELECT country k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? GROUP BY country ORDER BY n DESC LIMIT 8`, since),
    q(`SELECT device k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? GROUP BY device ORDER BY n DESC`, since),
    q(`SELECT COALESCE(utm_source,'(directo)') || ' / ' || COALESCE(utm_campaign,'-') k, COUNT(*) n FROM events WHERE type='pageview' AND ts > ? GROUP BY k ORDER BY n DESC LIMIT 8`, since),
    q(`SELECT COUNT(DISTINCT sid) n FROM events WHERE ts > ?`, live)
  ]);
  return {
    days, kpi: kpi.results[0], live: liveRow.results[0].n,
    series: series.results.map((r) => ({ date: new Date(r.d * DAY).toISOString().slice(0, 10), views: r.views, visitors: r.visitors })),
    pages: pages.results, refs: refs.results, countries: countries.results, devices: devices.results, utm: utm.results
  };
}

/* ================= API EXTERNA (claves) ================= */
async function checkApiKey(req, env) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(dwl_[a-f0-9]+)$/i);
  if (!m) return false;
  const row = await env.DB.prepare('SELECT id FROM api_keys WHERE hash = ? AND revoked = 0').bind(await sha256(m[1])).first();
  if (!row) return false;
  await env.DB.prepare('UPDATE api_keys SET last_used = ? WHERE id = ?').bind(now(), row.id).run();
  return true;
}

async function externalApi(req, env, path, url) {
  if (!(await checkApiKey(req, env))) return json({ error: 'API key inválida' }, 401);
  const since = Number(url.searchParams.get('since') || 0);
  const limit = Math.min(500, Number(url.searchParams.get('limit') || 100));
  if (req.method === 'GET' && path === '/v1/leads') return json((await env.DB.prepare('SELECT * FROM leads WHERE ts > ? ORDER BY ts DESC LIMIT ?').bind(since, limit).all()).results);
  if (req.method === 'GET' && path === '/v1/events') return json((await env.DB.prepare('SELECT * FROM events WHERE ts > ? ORDER BY ts DESC LIMIT ?').bind(since, limit).all()).results);
  if (req.method === 'GET' && path === '/v1/chats') {
    const chats = (await env.DB.prepare('SELECT * FROM chats WHERE last_at > ? ORDER BY last_at DESC LIMIT ?').bind(since, limit).all()).results;
    return json(chats);
  }
  if (req.method === 'GET' && path.startsWith('/v1/chats/')) {
    return json((await env.DB.prepare('SELECT role, content, ts FROM messages WHERE chat_id = ? ORDER BY ts').bind(path.slice(10)).all()).results);
  }
  if (req.method === 'GET' && path === '/v1/stats') return json(await stats(env, Number(url.searchParams.get('days') || 7)));
  if (req.method === 'POST' && path === '/v1/links') return json(await saveLink(env, await readJson(req)), 201);
  return json({ error: 'no encontrado' }, 404);
}

/* ================= PANEL ================= */
async function saveLink(env, b) {
  const slug = slugify(b.slug || b.title || randomToken(3));
  if (!slug) throw new Error('slug requerido');
  try { new URL(b.target); } catch { throw new Error('URL de destino inválida'); }
  const vals = [clip(b.title, 200), clip(b.target, 1000), clip(b.utm_source, 100), clip(b.utm_medium, 100), clip(b.utm_campaign, 100)];
  if (b.id) {
    await env.DB.prepare('UPDATE links SET slug=?, title=?, target=?, utm_source=?, utm_medium=?, utm_campaign=? WHERE id=?').bind(slug, ...vals, b.id).run();
    return { id: b.id, slug };
  }
  const r = await env.DB.prepare('INSERT INTO links (slug, title, target, utm_source, utm_medium, utm_campaign, created_at) VALUES (?,?,?,?,?,?,?)').bind(slug, ...vals, now()).run();
  return { id: r.meta.last_row_id, slug };
}

const ACCENTS = ['violeta', 'azul', 'verde', 'ambar', 'rosa'];

async function saveCard(env, b) {
  const slug = slugify(b.slug || b.name);
  if (!slug || !b.name) throw new Error('nombre requerido');
  // photo_url solo se toca si viene en la petición (no se borra al guardar otros cambios)
  const fields = ['name', 'role', 'company', 'bio', 'phone', 'whatsapp', 'email', 'website', 'instagram', 'linkedin', 'accent']
    .concat(b.photo_url !== undefined || !b.id ? ['photo_url'] : []);
  const vals = fields.map((f) => (f === 'accent' ? (ACCENTS.includes(b.accent) ? b.accent : 'violeta') : clip(b[f], f === 'bio' ? 600 : 300)));
  // Foto: undefined = no cambia · '' o null = quitar · data URL = reemplazar
  let photoSql = '', photoVal = [];
  if (b.photo_data !== undefined) {
    if (!b.photo_data) { photoSql = ', photo_data=NULL'; }
    else if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.photo_data) && b.photo_data.length < 400000) { photoSql = ', photo_data=?'; photoVal = [b.photo_data]; }
    else throw new Error('La foto no es válida o pesa demasiado');
  }
  // Íconos de la app instalable (PNG que genera el panel a partir de la foto y el color)
  for (const k of ['icon_192', 'icon_512']) {
    if (b[k] === undefined) continue;
    if (b[k] && !(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b[k]) && b[k].length < 900000)) throw new Error('Ícono inválido');
    photoSql += `, ${k}=?`; photoVal.push(b[k] || null);
  }
  let id = b.id;
  if (id) {
    await env.DB.prepare(`UPDATE cards SET slug=?, ${fields.map((f) => f + '=?').join(', ')}, updated_at=?${photoSql} WHERE id=?`).bind(slug, ...vals, now(), ...photoVal, id).run();
  } else {
    const r = await env.DB.prepare(`INSERT INTO cards (slug, ${fields.join(', ')}, created_at, updated_at) VALUES (?, ${fields.map(() => '?').join(', ')}, ?, ?)`).bind(slug, ...vals, now(), now()).run();
    id = r.meta.last_row_id;
    if (photoSql) await env.DB.prepare(`UPDATE cards SET ${photoSql.slice(2)} WHERE id=?`).bind(...photoVal, id).run();
  }
  return { id, slug };
}

async function adminApi(req, env, path, url) {
  // Solo entra quien pasó por Cloudflare Access (y está en ADMIN_EMAILS, si se definió).
  const email = await adminEmail(req, env);
  if (!email) return json({ error: 'Entra al panel a través de Cloudflare Access' }, 401);
  if (path === '/admin/api/me') return json({ email });
  if (path === '/admin/api/platform' || path.startsWith('/admin/api/platform/')) return platformApi(req, env, path, url, email);
  if (path === '/admin/api/blog' || path.startsWith('/admin/api/blog/')) return blogAdmin(req, env, path, url, email);

  const M = req.method;
  const id = Number(url.searchParams.get('id') || 0);
  const db = env.DB;

  if (path === '/admin/api/stats') return json(await stats(env, Math.min(90, Number(url.searchParams.get('days') || 7))));
  if (path === '/admin/api/live') {
    const since = Number(url.searchParams.get('since') || now() - 30 * 60000);
    const [events, live] = await db.batch([
      db.prepare('SELECT * FROM events WHERE ts > ? ORDER BY ts DESC LIMIT 60').bind(since),
      db.prepare('SELECT path, country, device, MAX(ts) ts FROM events WHERE ts > ? GROUP BY sid ORDER BY ts DESC').bind(now() - 5 * 60000)
    ]);
    return json({ events: events.results, live: live.results, now: now() });
  }

  if (path === '/admin/api/links') {
    if (M === 'GET') return json((await db.prepare('SELECT * FROM links ORDER BY created_at DESC').all()).results);
    if (M === 'POST') return json(await saveLink(env, await readJson(req)));
    if (M === 'DELETE') { await db.batch([db.prepare('DELETE FROM clicks WHERE link_id=?').bind(id), db.prepare('DELETE FROM links WHERE id=?').bind(id)]); return json({ ok: true }); }
  }
  if (path === '/admin/api/link-clicks') {
    const [byDay, byCountry, byDevice] = await db.batch([
      db.prepare('SELECT (ts/86400000) d, COUNT(*) n FROM clicks WHERE link_id=? GROUP BY d ORDER BY d DESC LIMIT 30').bind(id),
      db.prepare('SELECT country k, COUNT(*) n FROM clicks WHERE link_id=? GROUP BY country ORDER BY n DESC LIMIT 8').bind(id),
      db.prepare('SELECT device k, COUNT(*) n FROM clicks WHERE link_id=? GROUP BY device ORDER BY n DESC').bind(id)
    ]);
    return json({ byDay: byDay.results.map((r) => ({ date: new Date(r.d * DAY).toISOString().slice(0, 10), n: r.n })), byCountry: byCountry.results, byDevice: byDevice.results });
  }

  if (path === '/admin/api/cards') {
    if (M === 'GET') return json((await db.prepare(`SELECT id, slug, name, role, company, bio, phone, whatsapp, email, website, instagram, linkedin,
      photo_url, accent, views, created_at, updated_at, photo_data IS NOT NULL AS has_photo FROM cards ORDER BY created_at DESC`).all()).results);
    if (M === 'POST') return json(await saveCard(env, await readJson(req, 2000000)));
    if (M === 'DELETE') { await db.prepare('DELETE FROM cards WHERE id=?').bind(id).run(); return json({ ok: true }); }
  }

  if (path === '/admin/api/chats') {
    const chatId = url.searchParams.get('chat');
    if (M === 'GET' && chatId) return json((await db.prepare('SELECT role, content, ts FROM messages WHERE chat_id=? ORDER BY ts, id').bind(chatId).all()).results);
    if (M === 'GET') return json((await db.prepare(`SELECT c.*, (SELECT content FROM messages m WHERE m.chat_id=c.id AND role='user' ORDER BY ts LIMIT 1) first
      FROM chats c ORDER BY last_at DESC LIMIT 200`).all()).results);
    if (M === 'DELETE' && chatId) { await db.batch([db.prepare('DELETE FROM messages WHERE chat_id=?').bind(chatId), db.prepare('DELETE FROM chats WHERE id=?').bind(chatId)]); return json({ ok: true }); }
  }

  if (path === '/admin/api/leads') {
    if (M === 'GET') return json((await db.prepare('SELECT * FROM leads ORDER BY ts DESC LIMIT 500').all()).results);
    if (M === 'POST') { const b = await readJson(req); await db.prepare('UPDATE leads SET status=? WHERE id=?').bind(clip(b.status, 30), b.id).run(); return json({ ok: true }); }
    if (M === 'DELETE') { await db.prepare('DELETE FROM leads WHERE id=?').bind(id).run(); return json({ ok: true }); }
  }

  if (path === '/admin/api/settings') {
    if (M === 'GET') return json({ ...(await getSettings(env)), default_prompt: DEFAULT_PROMPT, ai_provider: env.GEMINI_API_KEY ? 'Gemini' : 'Workers AI (Cloudflare)' });
    if (M === 'POST') {
      const b = await readJson(req, 20000);
      const stmts = [];
      for (const k of ['chat_prompt', 'webhook_url', 'chat_enabled']) {
        if (k in b) stmts.push(db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, clip(String(b[k]), 15000)));
      }
      if (stmts.length) await db.batch(stmts);
      return json({ ok: true });
    }
  }
  if (path === '/admin/api/webhook-test' && M === 'POST') {
    await fireWebhook(env, 'test', { message: 'Prueba desde el panel de Diwilo' });
    return json({ ok: true });
  }

  if (path === '/admin/api/keys') {
    if (M === 'GET') return json((await db.prepare('SELECT id, name, prefix, created_at, last_used, revoked FROM api_keys ORDER BY created_at DESC').all()).results);
    if (M === 'POST') {
      const b = await readJson(req);
      const key = 'dwl_' + randomToken(20);
      await db.prepare('INSERT INTO api_keys (name, prefix, hash, created_at) VALUES (?,?,?,?)').bind(clip(b.name || 'Integración', 80), key.slice(0, 10), await sha256(key), now()).run();
      return json({ key }); // se muestra una sola vez
    }
    if (M === 'DELETE') { await db.prepare('UPDATE api_keys SET revoked=1 WHERE id=?').bind(id).run(); return json({ ok: true }); }
  }

  return json({ error: 'no encontrado' }, 404);
}

/* ================= ROUTER ================= */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path.startsWith('/api/')) {
        if (req.method === 'OPTIONS') return cors(env, req, new Response(null, { status: 204 }));
        if (path === '/api/health') {
          const db = await env.DB.prepare('SELECT 1 ok').first().then(() => 'ok', () => 'error');
          return json({ status: db === 'ok' ? 'ok' : 'degraded', database: db, time: new Date().toISOString() }, db === 'ok' ? 200 : 503, { 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
        }
        if (req.method !== 'POST') return json({ error: 'método no permitido' }, 405);
        let res;
        if (path === '/api/track') res = await apiTrack(req, env);
        else if (path === '/api/lead') res = await apiLead(req, env, ctx);
        else if (path === '/api/chat') res = await apiChat(req, env, ctx);
        else if (path === '/api/chat/handoff') res = await apiHandoff(req, env, ctx);
        else res = json({ error: 'no encontrado' }, 404);
        return cors(env, req, res);
      }
      if (path === '/mcp') {
        const h = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, mcp-protocol-version, mcp-session-id' };
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
        const r = await mcpServer(req, env, ctx);
        const res = new Response(r.body, r);
        Object.entries(h).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }
      if (path.startsWith('/l/')) return trackLink(req, env, ctx, decodeURIComponent(path.slice(3)));
      if (path.startsWith('/c/')) return showCard(req, env, ctx, decodeURIComponent(path.slice(3)));
      if (path.startsWith('/v1/')) return externalApi(req, env, path, url);
      if (path.startsWith('/admin/api/')) return adminApi(req, env, path, url);
      // Lo demás lo sirve Pages como archivo estático
      return env.ASSETS ? env.ASSETS.fetch(req) : new Response('No encontrado', { status: 404 });
    } catch (e) {
      console.error(e);
      return json({ error: e.message || 'error' }, e.message === 'too large' ? 413 : 400);
    }
  }
};
