/**
 * Herramientas PROPIAS de Diwilo para el módulo IA central (agentes y asistente de «IA» en el panel): blog, investigación web y videos.
 * Se entregan en ctx.propias (igual que las apps CD con las suyas): el módulo las ve junto a las de Marketing, Marca y Finanzas, y
 * las ejecuta ESTE Worker, que es donde viven el blog, la búsqueda web y la clave de Higgsfield.
 * Los agentes de Diwilo (diwilo:diwilo) los dispara el cron de este Worker (runAgentesDiwilo): el cron de Diwilo Modulos los salta.
 */
import { TOOLS } from './assistant.js';
import { ccall } from './central.js';

const NOMBRES = ['leads_recientes', 'temas_de_clientes', 'blog_resumen', 'noticias_web', 'buscar_web', 'investigar_tema', 'leer_pagina', 'blog_crear_borrador', 'crear_video'];
const SCHEMA = { type: 'object', properties: {}, additionalProperties: true };

export function propiasDiwilo(env, email, callAI) {
  // Un solo contexto por petición: investigar_tema deja sus notas aquí y blog_crear_borrador las usa (como hacía el agente anterior)
  const ctx = { tab: 'contenido', org: 'diwilo', email, source: 'agente', onStep: () => {},
    callAI: (e, sys, h, o = {}) => callAI(e, sys, h, { source: 'agente', ...o }) };
  const tools = NOMBRES.filter((n) => TOOLS[n]);
  return {
    modulos: [],
    catalogo: tools.map((n) => ({ name: n, description: `${TOOLS[n].desc}${TOOLS[n].args && TOOLS[n].args !== '{}' ? ` Argumentos: ${TOOLS[n].args}` : ''}`, inputSchema: SCHEMA,
      rol: TOOLS[n].write ? 'admin' : 'staff', tipo: TOOLS[n].write ? 'escritura' : 'lectura', modulo: 'contenido' })),
    async ejecutar(name, args) {
      const t = tools.includes(name) ? TOOLS[name] : null;
      if (!t) return { ok: false, error: 'Herramienta no disponible', status: 404 };
      try { return { ok: true, result: await t.run(env, t.prepare ? t.prepare({ ...args }, ctx) : args, ctx) }; }
      catch (e) { return { ok: false, error: e.message || 'Error', status: 500 }; }
    },
  };
}

// Cron diario: los agentes de Diwilo programados (diarios todos los días, semanales los lunes) que hoy aún no corrieron.
export async function runAgentesDiwilo(env, callAI) {
  try {
    if (!env.MODULOS) return;
    const lunes = new Date(Date.now() - 5 * 3600000).getUTCDay() === 1;
    const desde = Date.parse(`${new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)}T05:00:00Z`);
    const propias = propiasDiwilo(env, null, callAI);
    const lista = JSON.parse((await ccall(env, 'diwilo', null, 'GET', '/api/ai/agentes', { propias })).body).rows || [];
    for (const a of lista.filter((x) => x.activo && (x.programacion === 'diario' || (x.programacion === 'semanal' && lunes)) && (x.ultima_ejecucion || 0) < desde)) {
      try { await ccall(env, 'diwilo', null, 'POST', `/api/ai/agentes/${a.id}/ejecutar`, { body: {}, propias }); } catch (e) { console.error('agente', a.nombre, e.message); }
    }
  } catch (e) { console.error('agentes', e.message); }
}
