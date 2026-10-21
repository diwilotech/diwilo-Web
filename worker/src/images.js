/**
 * Portadas del blog con IA (Workers AI · FLUX.1 schnell, sin clave aparte).
 * Cada imagen se registra en Consumo de IA y hay un tope de imágenes por día.
 */
import { recordUsage, usageSettings, BudgetError, QUOTA_MSG } from './usage.js';

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const day = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

export async function generateCover(env, { title, idea = '', source = 'otros' }) {
  const s = await usageSettings(env);
  const used = await env.DB.prepare("SELECT COALESCE(SUM(calls), 0) n FROM ai_usage WHERE day = ? AND provider = 'workers-ai-imagen'").bind(day()).first();
  if (s.images_daily && used.n >= s.images_daily) throw new Error(`Se llegó al tope de ${s.images_daily} imágenes por día (IA → Consumo).`);
  // El modelo entiende mejor en inglés y tiende a escribir letras deformes: se le pide que no ponga texto
  const prompt = `Editorial cover image for a business blog article. Topic: "${String(title).slice(0, 160)}". ${String(idea).slice(0, 400)}
Style: modern, clean, professional 3D illustration, soft cinematic lighting, deep navy background with purple and violet accents, Latin American small business context, horizontal composition with empty space.
Absolutely no text, no letters, no words, no numbers, no logos, no watermark.`;
  let out;
  try { out = await env.AI.run(MODEL, { prompt, steps: 6 }); }
  catch (e) { if (/4006|daily free allocation/i.test(e.message)) throw new BudgetError(QUOTA_MSG); throw e; }
  if (!out?.image) throw new Error('La IA no generó la imagen');
  await recordUsage(env, { source, provider: 'workers-ai-imagen', tin: 0, tout: 0 });
  return `data:image/jpeg;base64,${out.image}`;
}
