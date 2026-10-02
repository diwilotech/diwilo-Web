# Diwilo — sitio web y gestión

Sitio de [diwilo.com](https://diwilo.com) y su app de gestión, en el proyecto **Cloudflare Pages "diwilo"**.
Cada push a `main` se publica solo en diwilo.com (integración GitHub ↔ Cloudflare Pages).

- **Sitio:** https://diwilo.com
- **Panel:** https://diwilo.com/admin

## Estructura

| Ruta | Contenido |
| --- | --- |
| `public/` | Lo que se publica: páginas, `assets/`, panel (`admin.html`), `404.html`, `_headers` |
| `functions/` | Rutas dinámicas (Pages Functions): `/api/*`, `/admin/api/*`, `/l/*`, `/c/*`, `/v1/*` |
| `worker/src/index.js` | Lógica compartida de esas rutas: analítica, leads, chat IA, links, tarjetas, API |
| `worker/src/card.js` | Tarjeta de presentación y vCard |
| `worker/schema.sql` | Esquema de la base D1 `diwilo-admin-db` |
| `wrangler.jsonc` | Configuración del proyecto Pages: base de datos D1, Workers AI, variables |

## Rutas

| Ruta | Qué hace |
| --- | --- |
| `/admin` | Panel: en vivo, leads, chats IA, links, tarjetas, integraciones, ajustes del chat |
| `/api/track`, `/api/lead`, `/api/chat` | Analítica, formulario y chat con IA del sitio |
| `/l/<slug>` | Link de rastreo con UTM y conteo de clics |
| `/c/<slug>` · `/c/<slug>.vcf` | Tarjeta de presentación y contacto descargable |
| `/v1/*` | API para integraciones (`Authorization: Bearer dwl_…`, claves desde el panel) |

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
