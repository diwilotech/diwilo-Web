# Diwilo — sitio web y gestión

Sitio de [Diwilo](https://diwilo.diwilo.workers.dev) y su app de gestión, en un solo Worker de Cloudflare.

- **Sitio:** https://diwilo.diwilo.workers.dev
- **Panel:** https://diwilo.diwilo.workers.dev/admin

## Estructura

| Ruta | Contenido |
| --- | --- |
| `*.html`, `assets/` | Sitio estático (inicio, servicios, arquitectura, contacto, privacidad) |
| `worker/src/index.js` | API, panel, links de rastreo y tarjetas |
| `worker/src/admin.html` | Panel de gestión |
| `worker/src/card.js` | Tarjeta de presentación y vCard |
| `worker/schema.sql` | Esquema de la base D1 `diwilo-admin-db` |
| `wrangler.jsonc` | Configuración de Cloudflare |
| `.assetsignore` | Archivos del repo que no se publican |

## Rutas del Worker

| Ruta | Qué hace |
| --- | --- |
| `/` y demás | Sitio estático |
| `/admin` | Panel: en vivo, leads, chats IA, links, tarjetas, integraciones, ajustes del chat |
| `/api/track`, `/api/lead`, `/api/chat` | Analítica, formulario y chat con IA del sitio |
| `/l/<slug>` | Link de rastreo con UTM y conteo de clics |
| `/c/<slug>` · `/c/<slug>.vcf` | Tarjeta de presentación y contacto descargable |
| `/v1/*` | API para integraciones (`Authorization: Bearer dwl_…`, claves desde el panel) |

## Desplegar

Automático: cada push a `main` despliega con GitHub Actions si existe el secreto
`CLOUDFLARE_API_TOKEN` (plantilla "Edit Cloudflare Workers" + permiso D1 Edit).

Manual:

```bash
npx wrangler deploy
npx wrangler d1 execute diwilo-admin-db --remote --file=worker/schema.sql   # solo la primera vez
```

## Secretos

```bash
npx wrangler secret put ADMIN_PASSWORD     # contraseña del panel
npx wrangler secret put GEMINI_API_KEY     # opcional: Gemini en el chat en lugar de Workers AI
```

## Animaciones del sitio

- `data-reveal` (`""`, `left`, `right`, `scale`, `fade`) y `data-stagger="90"` para aparecer al hacer scroll.
- Hero palabra por palabra (`data-split`), progreso de lectura, paralaje, línea de ruta, contadores (`data-count`).
- Respeta `prefers-reduced-motion`.

## Ver en local

```bash
npx wrangler dev     # sitio + API con datos locales
```
