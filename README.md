# Diwilo — sitio web y gestión

Sitio de [diwilo.com](https://diwilo.com) y su app de gestión, en el proyecto **Cloudflare Pages "diwilo"**.
Cada push a `main` se publica solo en diwilo.com (integración GitHub ↔ Cloudflare Pages).

- **Sitio:** https://diwilo.com
- **Panel:** https://diwilo.com/admin

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/pages/` | Fuente de las páginas (solo el `<main>` de cada una) |
| `tools/build.py` | Genera `public/`: páginas, versiones `.md`, sitemap, robots, llms.txt, OpenAPI y archivos `.well-known` |
| `public/` | Lo que se publica (incluye el panel `admin.html`, `404.html` y `_headers`) |
| `functions/` | Rutas dinámicas (Pages Functions): `/api/*`, `/admin/api/*`, `/l/*`, `/c/*`, `/v1/*`, `/mcp` y la negociación HTML/Markdown de cada página |
| `worker/src/index.js` | Lógica compartida: analítica, leads, chat IA, links, tarjetas, API y servidor MCP |
| `worker/src/markdown.js` | `Accept: text/markdown` → versión `.md` de la página, y cabeceras `Link` |
| `worker/src/card.js` | Tarjeta de presentación y vCard |
| `worker/schema.sql` | Esquema de la base D1 `diwilo-admin-db` |
| `wrangler.jsonc` | Configuración del proyecto Pages: base de datos D1, Workers AI, variables |

**Para cambiar textos:** edita `src/pages/*.html`, ejecuta `python3 tools/build.py` y sube los cambios.
El script regenera también el sitemap (fecha de actualización) y las versiones Markdown.

## Rutas

| Ruta | Qué hace |
| --- | --- |
| `/admin` | Panel: en vivo, leads, chats IA, links, tarjetas, integraciones, ajustes del chat |
| `/api/track`, `/api/lead`, `/api/chat`, `/api/health` | Analítica, formulario, chat con IA y estado del servicio |
| `/l/<slug>` | Link de rastreo con UTM y conteo de clics |
| `/c/<slug>` · `/c/<slug>.vcf` · `/c/<slug>/foto` | Tarjeta de presentación, contacto descargable y foto |
| `/v1/*` | API para integraciones (`Authorization: Bearer dwl_…`, claves desde el panel) |
| `/mcp` | Servidor MCP: `diwilo_info` y `diwilo_solicitar_diagnostico` |

## Descubrimiento para buscadores y agentes de IA

| Archivo | Estándar |
| --- | --- |
| `/robots.txt` | RFC 9309, reglas para bots de IA y `Content-Signal` |
| `/sitemap.xml` | sitemaps.org |
| `/llms.txt` y `/<página>.md` | Resumen y versiones Markdown (también con `Accept: text/markdown`) |
| `/openapi.json`, `/docs/api` | Especificación y documentación de la API |
| `/.well-known/api-catalog` | RFC 9727 (también anunciado en la cabecera `Link` de cada página) |
| `/.well-known/mcp/server-card.json` | MCP Server Card |
| `/.well-known/agent-skills/index.json` | Agent Skills Discovery 0.2.0 |
| `/.well-known/ai-catalog.json` | ARD (Agentic Resource Discovery) |
| Formulario de `/contacto` y `main.js` | WebMCP (`toolname`, `document.modelContext.registerTool`) |

**Política de IA** (en `tools/build.py`, función `build_discovery`): se permite indexar, usar en respuestas
de IA y entrenar (`ai-train=yes`). Para impedir el entrenamiento cambia a `ai-train=no` y `Disallow: /` en el grupo de entrenamiento.

## Secretos

```bash
npx wrangler pages secret put ADMIN_PASSWORD --project-name diwilo   # contraseña del panel
npx wrangler pages secret put GEMINI_API_KEY --project-name diwilo   # opcional: Gemini en el chat
```

Sin `GEMINI_API_KEY` el chat usa Workers AI de Cloudflare.

## Ver en local

```bash
npx wrangler pages dev      # sitio + funciones con datos locales
```

## Animaciones del sitio

- `data-reveal` (`""`, `left`, `right`, `scale`, `fade`) y `data-stagger="90"` para aparecer al hacer scroll.
- Hero palabra por palabra (`data-split`), progreso de lectura, paralaje, línea de ruta, contadores (`data-count`).
- Respeta `prefers-reduced-motion`.
