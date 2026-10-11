/**
 * Agentes de IA (panel → Integraciones e IA → Agentes). Cada agente tiene un rol, instrucciones, las herramientas que
 * puede usar (las de IA Diwilo, ver assistant.js), cuándo trabaja (a mano, cada día o cada semana), para qué
 * organización y su permiso: 'proponer' (sus acciones quedan pendientes de aprobación) o 'ejecutar' (las hace solo).
 *
 *   GET    /admin/api/agents                                 agentes + plantillas + herramientas disponibles
 *   POST   /admin/api/agents                                 crear      PATCH /admin/api/agents/:id   DELETE /admin/api/agents/:id
 *   POST   /admin/api/agents/:id/run                         ejecutar ahora   { pedido?: texto extra para esta vez }
 *   GET    /admin/api/agents/:id/runs                        últimas ejecuciones
 *   POST   /admin/api/agents/runs/:runId/actions/:i          { approve: true|false } aprobar o descartar una acción propuesta
 * runAgentsDaily(env, callAI) la corre el cron diario (diarios todos los días, semanales los lunes).
 */
import { TOOLS, agentLoop, toolsText } from './assistant.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const now = () => Date.now();
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

// Tablas: se crean solas la primera vez (y también están en worker/hubs.sql).
let ready = false;
async function ensureTables(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ai_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, template TEXT, instructions TEXT NOT NULL,
      tools TEXT NOT NULL DEFAULT '[]', schedule TEXT NOT NULL DEFAULT 'manual', org_id TEXT NOT NULL DEFAULT 'diwilo',
      autonomy TEXT NOT NULL DEFAULT 'proponer', active INTEGER NOT NULL DEFAULT 1, last_run_at INTEGER, runs INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ai_agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id INTEGER NOT NULL, trigger TEXT NOT NULL, status TEXT NOT NULL,
      output TEXT, actions TEXT NOT NULL DEFAULT '[]', used TEXT, started_at INTEGER NOT NULL, finished_at INTEGER)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_agent_runs ON ai_agent_runs(agent_id, started_at)'),
  ]);
  ready = true;
}

const READ = ['estado_general', 'leads_recientes', 'negocios', 'organizaciones', 'marketing_resumen', 'finanzas_resumen', 'tareas_pendientes', 'buscar_contactos', 'blog_resumen', 'temas_de_clientes'];

// Plantillas listas para usar (se pueden editar después).
export const TEMPLATES = {
  blog: { name: 'Agente de blog', schedule: 'semanal', autonomy: 'ejecutar',
    tools: ['temas_de_clientes', 'blog_resumen', 'leads_recientes', 'blog_crear_borrador'],
    instructions: `Eres el editor del blog de Diwilo. Cada vez que trabajes:
1) Revisa lo que preguntan los clientes (temas_de_clientes) y lo que ya está publicado (blog_resumen).
2) Elige UN tema que responda una duda real de los clientes y que no esté cubierto (busca intención de compra: «cómo elegir», «cuánto cuesta», «cómo automatizar»).
3) Escribe un borrador con blog_crear_borrador (título atractivo y concreto, enfoque claro, categoría).
4) Responde con: el tema elegido, por qué, y 3 ideas más para las próximas semanas.` },
  leads: { name: 'Seguimiento de leads', schedule: 'diario', autonomy: 'ejecutar',
    tools: ['leads_recientes', 'buscar_contactos', 'tareas_pendientes', 'crear_tarea'],
    instructions: `Revisa los leads del formulario que siguen en estado «nuevo» (leads_recientes con estado nuevo) y las tareas pendientes.
Por cada lead nuevo que no tenga ya una tarea, crea una tarea para contactarlo hoy con un título concreto (por ejemplo «Llamar a Ana: quiere automatizar su restaurante»).
Responde con un resumen corto: cuántos leads nuevos hay, a quién hay que contactar primero y por qué.` },
  cobranza: { name: 'Cobranza', schedule: 'diario', autonomy: 'proponer',
    tools: ['finanzas_resumen', 'tareas_pendientes', 'crear_tarea'],
    instructions: `Revisa la cartera por cobrar (finanzas_resumen) y las tareas pendientes.
Para cada factura vencida sin tarea de cobro, propone una tarea de cobro con el cliente, el número de factura y el saldo en el título.
Responde con el total vencido, los clientes que más deben y qué hacer primero.` },
  renovaciones: { name: 'Renovaciones de negocios', schedule: 'diario', autonomy: 'ejecutar',
    tools: ['negocios', 'tareas_pendientes', 'crear_tarea'],
    instructions: `Revisa los negocios de las apps que vencen en los próximos 7 días o ya están en solo lectura (negocios con vencen_en_dias 7).
Por cada uno sin tarea pendiente, crea una tarea «Renovar <negocio> (<app>) — vence <fecha>, dueño <correo>».
Responde con la lista de negocios por vencer, ordenados por fecha.` },
  analista: { name: 'Analista semanal', schedule: 'semanal', autonomy: 'proponer',
    tools: ['estado_general', 'marketing_resumen', 'finanzas_resumen', 'negocios'],
    instructions: `Haz el informe semanal para el dueño de Diwilo: cómo va el sitio, los leads y las campañas, las finanzas del mes y los negocios por vencer.
Formato: 1) qué pasó (con cifras), 2) qué preocupa, 3) tres acciones concretas para esta semana. Máximo 250 palabras.` },
};

const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n));
function clean(b, partial) {
  const out = {};
  if (!partial || 'name' in b) { out.name = clip(b.name, 80); if (!out.name) throw new Error('El agente necesita un nombre'); }
  if (!partial || 'instructions' in b) { out.instructions = clip(b.instructions, 6000); if (!out.instructions) throw new Error('Escribe las instrucciones del agente'); }
  if (!partial || 'tools' in b) out.tools = JSON.stringify((Array.isArray(b.tools) ? b.tools : []).filter((t) => TOOLS[t]).slice(0, 20));
  if (!partial || 'schedule' in b) out.schedule = ['manual', 'diario', 'semanal'].includes(b.schedule) ? b.schedule : 'manual';
  if (!partial || 'autonomy' in b) out.autonomy = b.autonomy === 'ejecutar' ? 'ejecutar' : 'proponer';
  if (!partial || 'org_id' in b) out.org_id = /^(diwilo|[a-z]+:[A-Za-z0-9_-]{1,64})$/.test(b.org_id || '') ? b.org_id : 'diwilo';
  if (!partial || 'active' in b) out.active = b.active === false || b.active === 0 || b.active === '0' ? 0 : 1;
  if (!partial && b.template && TEMPLATES[b.template]) out.template = b.template;
  return out;
}
const shape = (a) => ({ ...a, tools: JSON.parse(a.tools || '[]') });

// Ejecuta un agente y guarda la ejecución.
export async function runAgent(env, agent, { trigger = 'manual', pedido = '', callAI }) {
  await ensureTables(env);
  const tools = JSON.parse(agent.tools || '[]');
  const ctx = { tab: 'agentes', org: agent.org_id, callAI };
  const started = now();
  const run = await env.DB.prepare("INSERT INTO ai_agent_runs (agent_id, trigger, status, started_at) VALUES (?, ?, 'trabajando', ?)").bind(agent.id, trigger, started).run();
  const runId = run.meta.last_row_id;
  const system = `Eres «${agent.name}», un agente de IA de Diwilo (empresa de software, datos y automatización en Medellín) que trabaja dentro de su panel.
Hoy es ${today()} (hora de Colombia). Organización con la que trabajas: ${agent.org_id} ("diwilo" = la operación de Diwilo).
${agent.autonomy === 'ejecutar' ? 'Tus ACCIONES se ejecutan de inmediato: hazlas solo cuando correspondan y no las repitas.' : 'Tus ACCIONES no se ejecutan: quedan como propuestas que el administrador aprueba. Propón solo las necesarias.'}

TUS INSTRUCCIONES
${agent.instructions}

HERRAMIENTAS DISPONIBLES (solo estas)
${toolsText(tools)}

CÓMO RESPONDER: SIEMPRE un único objeto JSON y nada más:
{"tool":"nombre","args":{...}}  para consultar o actuar (una herramienta a la vez)
{"respuesta":"texto final"}     cuando termines: resumen en español de Colombia, con cifras en pesos ($1.234.567) y viñetas si ayudan.
Usa las herramientas para cualquier dato; nunca inventes cifras, nombres ni fechas. No puedes borrar, archivar, cambiar dueños ni registrar pagos.`;
  const history = [{ role: 'user', content: pedido ? `Trabaja ahora. Pedido del administrador para esta vez: ${pedido}` : 'Trabaja ahora según tus instrucciones.' }];
  let r;
  try { r = await agentLoop(env, { system, history, allowed: tools, ctx, mode: agent.autonomy === 'ejecutar' ? 'ejecutar' : 'proponer', maxSteps: 10 }); }
  catch (e) { r = { reply: `No pude terminar: ${e.message}`, actions: [], used: [], failed: true }; }
  const status = r.failed ? 'error' : r.actions.some((a) => a.status === 'pendiente') ? 'por aprobar' : 'lista';
  await env.DB.batch([
    env.DB.prepare('UPDATE ai_agent_runs SET status = ?, output = ?, actions = ?, used = ?, finished_at = ? WHERE id = ?')
      .bind(status, r.reply, JSON.stringify(r.actions || []), JSON.stringify(r.used || []), now(), runId),
    env.DB.prepare('UPDATE ai_agents SET last_run_at = ?, runs = runs + 1 WHERE id = ?').bind(now(), agent.id),
    env.DB.prepare('INSERT INTO events (ts, type, path, label) VALUES (?, ?, ?, ?)').bind(now(), 'admin', '/admin', `Agente «${agent.name}» (${trigger}): ${status}${r.actions?.length ? ` · ${r.actions.length} acción(es)` : ''}`.slice(0, 300)),
  ]);
  return { id: runId, status, output: r.reply, actions: r.actions || [], used: r.used || [] };
}

export async function runAgentsDaily(env, callAI) {
  try {
    await ensureTables(env);
    const monday = new Date(Date.now() - 5 * 3600000).getUTCDay() === 1;
    const { results } = await env.DB.prepare("SELECT * FROM ai_agents WHERE active = 1 AND (schedule = 'diario' OR (schedule = 'semanal' AND ?))").bind(monday ? 1 : 0).all();
    for (const a of results) { try { await runAgent(env, a, { trigger: a.schedule, callAI }); } catch (e) { console.error('agente', a.name, e.message); } }
  } catch (e) { console.error('agentes', e.message); }
}

export async function agentsApi(req, env, path, adminEmail, callAI) {
  try {
    await ensureTables(env);
    const M = req.method;
    const parts = path.split('/').filter(Boolean).slice(3); // tras /admin/api/agents
    const body = M === 'GET' || M === 'DELETE' ? {} : await req.json().catch(() => ({}));

    if (!parts.length && M === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM ai_agents ORDER BY active DESC, name').all();
      const pend = await env.DB.prepare("SELECT agent_id, COUNT(*) n FROM ai_agent_runs WHERE status = 'por aprobar' GROUP BY agent_id").all();
      const pmap = Object.fromEntries(pend.results.map((p) => [p.agent_id, p.n]));
      return json({
        agents: results.map((a) => ({ ...shape(a), pending_runs: pmap[a.id] || 0 })),
        templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, ...t })),
        tools: Object.entries(TOOLS).map(([name, t]) => ({ name, desc: t.desc, write: !!t.write })),
      });
    }
    if (!parts.length && M === 'POST') {
      const base = body.template && TEMPLATES[body.template] ? { ...TEMPLATES[body.template], template: body.template } : {};
      const row = clean({ ...base, ...body }, false), t = now(), cols = Object.keys(row);
      const r = await env.DB.prepare(`INSERT INTO ai_agents (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?)`).bind(...Object.values(row), t, t).run();
      return json({ id: r.meta.last_row_id }, 201);
    }
    // Aprobar o descartar una acción propuesta
    if (parts[0] === 'runs' && parts[2] === 'actions' && M === 'POST') {
      const run = await env.DB.prepare('SELECT * FROM ai_agent_runs WHERE id = ?').bind(Number(parts[1])).first();
      if (!run) return json({ error: 'Ejecución no encontrada' }, 404);
      const actions = JSON.parse(run.actions || '[]'), i = Number(parts[3]), act = actions[i];
      if (!act || act.status !== 'pendiente') return json({ error: 'Esa acción ya no está pendiente' }, 409);
      if (body.approve) {
        const agent = await env.DB.prepare('SELECT * FROM ai_agents WHERE id = ?').bind(run.agent_id).first();
        if (!JSON.parse(agent?.tools || '[]').includes(act.tool) || !TOOLS[act.tool]?.write) return json({ error: 'El agente ya no tiene permiso para esa acción' }, 403);
        try { act.result = await TOOLS[act.tool].run(env, act.args || {}, { tab: 'agentes', org: act.org || agent.org_id, callAI }); act.status = 'hecha'; }
        catch (e) { act.status = 'error'; act.result = { error: e.message }; }
        await env.DB.prepare('INSERT INTO events (ts, type, path, label) VALUES (?, ?, ?, ?)').bind(now(), 'admin', '/admin', `${adminEmail}: aprobó «${act.summary}» (agente)`.slice(0, 300)).run().catch(() => {});
      } else act.status = 'descartada';
      const status = actions.some((a) => a.status === 'pendiente') ? 'por aprobar' : 'lista';
      await env.DB.prepare('UPDATE ai_agent_runs SET actions = ?, status = ? WHERE id = ?').bind(JSON.stringify(actions), status, run.id).run();
      return json({ ok: true, action: act, status });
    }
    const id = Number(parts[0]);
    const agent = id ? await env.DB.prepare('SELECT * FROM ai_agents WHERE id = ?').bind(id).first() : null;
    if (!agent) return json({ error: 'Agente no encontrado' }, 404);
    if (parts.length === 1 && M === 'PATCH') {
      const row = clean(body, true), cols = Object.keys(row);
      if (cols.length) await env.DB.prepare(`UPDATE ai_agents SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...Object.values(row), now(), id).run();
      return json({ ok: true });
    }
    if (parts.length === 1 && M === 'DELETE') {
      await env.DB.batch([env.DB.prepare('DELETE FROM ai_agent_runs WHERE agent_id = ?').bind(id), env.DB.prepare('DELETE FROM ai_agents WHERE id = ?').bind(id)]);
      return json({ ok: true });
    }
    if (parts[1] === 'run' && M === 'POST') return json(await runAgent(env, agent, { trigger: 'manual', pedido: clip(body.pedido, 1000) || '', callAI }));
    if (parts[1] === 'runs' && M === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM ai_agent_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT 20').bind(id).all();
      return json({ runs: results.map((r) => ({ ...r, actions: JSON.parse(r.actions || '[]'), used: JSON.parse(r.used || '[]') })) });
    }
    return json({ error: 'no encontrado' }, 404);
  } catch (e) {
    return json({ error: e.message || 'Error' }, 400);
  }
}

export { READ };
