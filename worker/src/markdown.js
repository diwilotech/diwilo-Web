/* Negociación de contenido para agentes: Accept: text/markdown → versión .md de la página.
   Los navegadores siguen recibiendo HTML. También añade cabeceras Link (RFC 8288). */

const LINKS = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
  '</docs/api>; rel="service-doc"',
  '</.well-known/mcp/server-card.json>; rel="describedby"; type="application/json"',
  '</llms.txt>; rel="describedby"; type="text/plain"'
].join(', ');

function wantsMarkdown(accept = '') {
  return accept.split(',').some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return type === 'text/markdown' && (!q || parseFloat(q.slice(2)) > 0);
  });
}

export async function negotiate(ctx, mdPath) {
  const { request, env, next } = ctx;
  const alt = `<${mdPath}>; rel="alternate"; type="text/markdown"`;
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (wantsMarkdown(request.headers.get('accept') || '')) {
      const md = await env.ASSETS.fetch(new URL(mdPath, request.url));
      if (md.ok) {
        const text = await md.text();
        return new Response(request.method === 'HEAD' ? null : text, {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'x-markdown-tokens': String(Math.ceil(text.length / 4)),
            vary: 'Accept',
            link: `${LINKS}, ${alt}`,
            'cache-control': 'public, max-age=300'
          }
        });
      }
    }
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.append('vary', 'Accept');
  if (res.headers.get('content-type')?.includes('text/html')) out.headers.set('link', `${LINKS}, ${alt}`);
  return out;
}
