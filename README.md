# Diwilo — sitio web y gestión

Sitio de [diwilo.com](https://diwilo.com) y su app de gestión, en el **Cloudflare Worker "diwilo"** (con archivos estáticos).
Cada push a `main` se publica solo en diwilo.com (Workers Builds, comando `npx wrangler deploy`).

- **Sitio:** https://diwilo.com
- **Panel:** https://diwilo.com/admin (protegido con Cloudflare Access)

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/pages/` | Fuente de las páginas (solo el `<main>` de cada una) |
| `tools/build.py` | Genera `public/`: páginas, versiones `.md`, sitemap, robots, llms.txt, OpenAPI y archivos `.well-known` |
| `public/` | Lo que se publica (incluye el panel `admin.html`, `404.html` y `_headers`) |
| `worker/src/worker.js` | Entrada del Worker: negociación HTML/Markdown de cada página y despacho de `/api/*`, `/admin/api/*`, `/l/*`, `/c/*`, `/v1/*`, `/mcp` |
| `worker/src/index.js` | Lógica compartida: analítica, leads, chat IA, links, tarjetas, API y servidor MCP |
| `worker/src/access.js` | Verifica el JWT de Cloudflare Access en `/admin/api/*` |
| `worker/src/platform.js` | Negocios, usuarios y suscripciones de Pedidos, Nutrición y Citas |
| `worker/src/markdown.js` | `Accept: text/markdown` → versión `.md` de la página, y cabeceras `Link` |
| `worker/src/card.js` | Tarjeta de presentación y vCard |
| `worker/schema.sql` | Esquema de la base D1 `diwilo-admin-db` |
| `wrangler.jsonc` | Configuración del Worker: dominios, archivos estáticos, D1, Workers AI, service bindings, variables |

**Para cambiar textos:** edita `src/pages/*.html`, ejecuta `python3 tools/build.py` y sube los cambios.
El script regenera también el sitemap (fecha de actualización) y las versiones Markdown.

## Rutas

| Ruta | Qué hace |
| --- | --- |
| `/admin` | Panel: en vivo, **negocios y suscripciones**, leads, chats IA, links, tarjetas, integraciones, ajustes del chat |
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

## Panel de plataforma (Negocios)

Diwilo Web es el **único** lugar donde se crean negocios, se invita a sus dueños y se cobran las
suscripciones de las apps **Pedidos** (`cdpedidos`), **Nutrición** (`cdnutricion`) y **Citas** (`cdcitas`).

- Cada app expone `/api/platform/*` (mismo contrato en las tres) protegido con `Authorization: Bearer PLATFORM_KEY`.
- Diwilo las llama por *service binding* (`services` en `wrangler.jsonc`), sin pasar por internet.
- La app guarda solo `paid_until` (`YYYY-MM-DD`). Al vencer, queda en **solo lectura** (402 en escrituras).
- **Registrar pago** extiende `paid_until` N meses desde la fecha vigente (o desde hoy si ya venció) y
  guarda el pago en la tabla `sub_payments`. Fecha vacía = sin límite.
- Al crear un negocio o agregar un usuario se genera un **link de invitación** para que la persona cree su
  contraseña. El botón **Link** de cada usuario genera uno nuevo (sirve para contraseñas olvidadas).
- Los links usan `PEDIDOS_URL`, `NUTRICION_URL` y `CITAS_URL` de `wrangler.jsonc`: deben ser los dominios públicos reales.

Las apps ya no usan Cloudflare Access: entran con correo + contraseña.

## Cloudflare Access (solo este panel)

Zero Trust → Access → Applications → **Self-hosted**:

- Destinos: `diwilo.com/admin`, `diwilo.com/admin.html`, `www.diwilo.com/admin` y `www.diwilo.com/admin.html`.
- Política *Allow* con tu correo (código por correo o Google).
- El **Application Audience (AUD) Tag** va en `ACCESS_AUD` (variable en `wrangler.jsonc`).

El Worker verifica el JWT de Access en cada llamada a `/admin/api/*`, así que la API queda cerrada aunque
alguien llegue por otra ruta. Para salir: `/cdn-cgi/access/logout` (botón **Salir**).

## Blog

- **Público:** `/blog` (índice con buscador y categorías), `/blog/<slug>` (artículo con menú lateral: índice del
  artículo, te puede interesar, apps y categorías), `/blog/rss.xml`, `/blog/sitemap.xml` y versión Markdown
  (`/blog/<slug>.md` o `Accept: text/markdown`). Lo arma `worker/src/blog.js` con el mismo diseño del sitio
  (`worker/src/shell.js`, generado por `tools/build.py`).
- **Panel:** pestaña **Blog** en `/admin`. Editor con barra de formato, vista previa real, imágenes (se reducen en el
  navegador y se guardan en D1), portada, categoría, etiquetas, autor, programación y SEO.
  Los borradores se ven en el sitio con `?preview` estando dentro del panel.
- **Markdown:** `public/assets/js/md.js` lo usan el Worker y el editor, así la vista previa es igual a lo publicado.
- **Apps:** el modal «¿Qué app te interesa?» (`data-open-apps` en cualquier botón) guarda el lead con `topics: Apps: …`.

## Secretos

```bash
npx wrangler secret put PLATFORM_KEY        # la misma clave en las 3 apps
npx wrangler secret put ADMIN_EMAILS        # opcional: correos permitidos
npx wrangler secret put GEMINI_API_KEY      # opcional: Gemini en el chat
```

Si la base ya existía, crea la tabla de pagos: `npx wrangler d1 execute diwilo-admin-db --remote --file=worker/schema.sql`
(es idempotente).

Sin `GEMINI_API_KEY` el chat usa Workers AI de Cloudflare.

## Ver en local

```bash
npx wrangler dev            # sitio + rutas dinámicas con datos locales
```

En local no hay Access: crea `.dev.vars` con `DEV_ADMIN_EMAIL=tu@correo.com` y `PLATFORM_KEY=…`. Si las apps
corren con `wrangler dev` en otra terminal, los service bindings se conectan solos.

## Animaciones del sitio

- `data-reveal` (`""`, `left`, `right`, `scale`, `fade`) y `data-stagger="90"` para aparecer al hacer scroll.
- Hero palabra por palabra (`data-split`), progreso de lectura, paralaje, línea de ruta, contadores (`data-count`).
- Respeta `prefers-reduced-motion`.
