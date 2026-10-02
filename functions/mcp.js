// /mcp → servidor MCP (lógica en worker/src/index.js)
import app from '../worker/src/index.js';

export const onRequest = (ctx) => app.fetch(ctx.request, ctx.env, ctx);
