# Prompt: login y suscripción de una app gestionada desde Diwilo

Copia todo lo que está debajo de la línea y pégalo a la IA que trabaje en la app.
Cambia `<NOMBRE_APP>`, `<clave>` (pedidos, nutricion, citas…) y `<dominio>`.

---

Vas a adaptar la app **<NOMBRE_APP>** (Cloudflare Worker + D1, publicada en `https://<dominio>.diwilo.com`) para que su acceso y su suscripción se gestionen **desde Diwilo Web** (`diwilo.com/admin`), igual que ya funcionan Pedidos (`cdpedidos`), Nutrición (`cdnutricion`) y Citas (`cdcitas`). Si tienes acceso a esos repos, úsalos como referencia: `src/api/platform.js` de Nutrición y `src/routes/platform.js` de Citas implementan exactamente este contrato.

Antes de escribir código, lee cómo está hecho hoy el login, los negocios y los usuarios de la app, y respeta su estilo (nombres, idioma de los comentarios, estructura de carpetas).

## 1. Reglas generales

- **Diwilo Web es el único panel de plataforma.** La app NO tiene registro público de negocios ni super-administrador propio. Si existen, elimínalos (rutas, páginas y código).
- **Sin Cloudflare Access en la app.** Solo `diwilo.com/admin` usa Access. La app entra con **correo + contraseña**.
- Multi-negocio: toda tabla de datos lleva `business_id` (o equivalente) y el valor sale **siempre de la sesión**, nunca del cliente.

## 2. Login con correo y contraseña

- Contraseña de **mínimo 8 caracteres** (máximo 200), guardada con **PBKDF2-SHA256, 100 000 iteraciones y salt aleatorio por usuario** (Web Crypto). Nunca en claro. Comparación en tiempo constante.
- **Bloqueo** tras 5 intentos fallidos durante 15 minutos. El mensaje de error es el mismo si el correo no existe o si la clave es mala ("Correo o contraseña incorrectos").
- **Sesión**: token aleatorio de 256 bits en cookie `HttpOnly; Secure; SameSite=Lax`. En la tabla `sessions` guarda el SHA-256 del token, con vencimiento.
- Si la app usaba **PIN** (4-8 dígitos): el PIN viejo se acepta **una sola vez**. Si el login es correcto pero la clave tiene menos de 8 caracteres, no abras sesión: genera un link de invitación (punto 3) y responde `{ mustSetPassword: true, invite: "<token>" }` para que el frontend pida crear la contraseña.
- Las mutaciones que usan cookie deben tener protección CSRF (por ejemplo, exigir un encabezado propio como `x-app: 1`).
- Pantalla de login con: correo, contraseña, botón Entrar y el texto "¿Olvidaste tu contraseña? Pide un link nuevo al administrador".
- **Un solo link de ingreso, sin el negocio en la URL** (la raíz de la app, o `/login`): la persona entra con correo y contraseña y la app la lleva a su negocio. Si el mismo correo pertenece a varios negocios, muestra "¿A qué negocio entras?" con la lista. Con sesión abierta, ese link manda directo al negocio.
- Usa el mismo diseño de login que las demás apps (`diwilo-login.css`): un cuadro grande con Diwilo a la izquierda (oscuro, logo y mensaje) y el ingreso en blanco a la derecha, con los colores de la app.

## 3. Links de invitación (registro y restablecer contraseña)

Un único mecanismo sirve para **crear la cuenta** y para **restablecer la contraseña**:

- Token aleatorio de 256 bits (64 hex). En la base se guarda **solo su SHA-256** (`users.invite_hash`). Al generar uno nuevo se invalida el anterior. Se borra al usarlo.
- El token viaja en el **fragmento** de la URL (`#invite=<token>`) para que no quede en logs ni en el Referer. Ejemplos: `/admin/login#invite=…` o `/<slug>/admin#invite=…`.
- Endpoints públicos:
  - `GET  …/auth/invite?token=` → `{ email, name, reset }` (`reset` = true si el usuario ya tenía contraseña). 404 si no es válido: "Este link ya no es válido. Pide uno nuevo."
  - `POST …/auth/invite { token, password, name? }` → guarda la contraseña, borra el token, cierra las sesiones viejas de ese usuario y abre una sesión nueva.
- Frontend: si la URL trae `#invite=`, muestra el formulario "Crea tu contraseña" (o "Nueva contraseña" si `reset`) con nombre, contraseña y confirmación, y al terminar entra a la app. Incluye un `<input type="email" autocomplete="username">` oculto con el correo para que el navegador guarde la clave.
- Si la app permite que el dueño agregue personal desde adentro, al agregar a alguien sin contraseña devuelve la URL de invitación para copiarla. Debe haber también un botón "Link para crear contraseña" por miembro.

## 4. Suscripción: activo o solo lectura

Diwilo decide si el negocio está al día. La app solo guarda una fecha y la hace cumplir:

- Columna `paid_until TEXT` en la tabla de negocios: `'YYYY-MM-DD'`, **inclusive**. **NULL = sin límite** (exento, no se cobra). La migración no debe poner fecha a los negocios existentes (quedan NULL) ni romper el código que ya corre: solo agrega columnas.
- "Hoy" se calcula en hora de Colombia: `new Date(Date.now() - 5*3600*1000).toISOString().slice(0,10)`.
- `vencida = paid_until != null && paid_until < hoy`.
- **Vencida → solo lectura**:
  - Toda escritura del negocio (POST/PUT/PATCH/DELETE de datos) responde **HTTP 402** con `{ error: "La suscripción del negocio está vencida: solo lectura." }`.
  - Leer (GET), iniciar y cerrar sesión e invitaciones **siguen funcionando**.
  - Si la app tiene parte pública para clientes (reservas, pedidos en línea, portal), sus escrituras también responden 402 con un mensaje amable ("…no están disponibles en este momento").
  - Webhooks de integraciones externas pueden seguir funcionando.
- El endpoint de sesión (`/me` o equivalente) devuelve `readOnly` y `paidUntil`. El frontend muestra una **barra roja fija arriba**: "La suscripción está vencida: puedes consultar, pero no guardar cambios". Cualquier 402 muestra su mensaje en un aviso.

## 5. API de plataforma para Diwilo (contrato obligatorio)

Rutas bajo `/api/platform/*`, autenticadas con `Authorization: Bearer <PLATFORM_KEY>` (secreto `PLATFORM_KEY`, el mismo valor que en Diwilo). Compara en tiempo constante; sin clave o con clave mala → 401. **Sin cookies ni CSRF** en estas rutas. Regístralas antes que cualquier ruta con parámetro de negocio (por ejemplo `/api/:slug/...`) y reserva la palabra `platform` como slug.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/platform/businesses` | — | `{ businesses: [Negocio] }` |
| POST | `/api/platform/businesses` | `{ name, slug?, owner_email, owner_name?, paid_until }` | `201 { id, slug?, invite_path }` |
| GET | `/api/platform/businesses/:id` | — | `Negocio` (404 si no existe) |
| PATCH | `/api/platform/businesses/:id` | `{ name?, paid_until? }` (`paid_until: null` = sin límite) | `{ ok: true }` o 204 |
| POST | `/api/platform/businesses/:id/users` | `{ email, name?, role }` | `{ id, invite_path }` |
| DELETE | `/api/platform/businesses/:id/users/:userId` | — | `{ ok: true }` o 204 |

Forma de `Negocio`:

```json
{
  "id": "uuid",
  "name": "Nombre",
  "slug": "mi-negocio-o-null",
  "created_at": "2026-10-03T22:10:37Z",
  "paid_until": "2026-11-03",
  "read_only": false,
  "users": [
    { "id": "uuid", "email": "a@b.co", "name": "Ana", "role": "owner", "status": "active", "invite_path": null }
  ]
}
```

- `role`: `owner` (dueño), `admin` (administrador, si la app lo tiene) o `staff` (personal). Si la app usa otros nombres, tradúcelos en ambos sentidos.
- `status`: `active` (ya tiene contraseña), `invited` (aún no) o `inactive`.
- `invite_path`: ruta **relativa** con el token (`/admin/login#invite=…`). Diwilo le antepone el dominio de la app. En el listado puede ir `null` si solo guardas el hash.
- `POST /businesses`: crea el negocio con su `paid_until`, el dueño **sin contraseña** y todo lo inicial que la app necesite (plantillas, configuración por defecto…). Todo en un solo batch. Devuelve el link de invitación del dueño. Valida correo, nombre, fecha (`YYYY-MM-DD` o null) y slug (si aplica: `[a-z0-9-]{3,40}`, ni reservado ni repetido → 409).
- `POST /businesses/:id/users`: si el correo no existe en ese negocio, lo crea sin contraseña; **si ya existe, actualiza su rol y genera un link nuevo** (esto es "Restablecer contraseña" en Diwilo). Siempre devuelve `invite_path`.
- `DELETE …/users/:userId`: borra al usuario (o su membresía) y sus sesiones en ese negocio.
- Errores: `{ error: "mensaje en español" }` con 400, 404 o 409.

## 6. Configuración y entrega

- `wrangler.jsonc`: dominio propio `<dominio>.diwilo.com`. En los comentarios, documenta el secreto `PLATFORM_KEY` (`npx wrangler secret put PLATFORM_KEY`).
- Migración en `migrations/NNNN_plataforma_diwilo.sql`: `paid_until` e `invite_hash` (con índice). Solo `ALTER TABLE … ADD COLUMN`; no borres tablas viejas.
- README: cómo se crean negocios (desde Diwilo), cómo entra la gente, qué pasa al vencer la suscripción y los secretos.
- **Orden de despliegue**: primero la migración en producción, después el código (si no, la app falla porque faltan columnas).

## 7. Conectar la app en Diwilo Web (repo `diwilo-Web`)

1. `wrangler.jsonc`: en `services` agrega `{ "binding": "<CLAVE_MAYUS>", "service": "<nombre-del-worker>" }` y en `vars` agrega `"<CLAVE_MAYUS>_URL": "https://<dominio>.diwilo.com"`.
2. `worker/src/platform.js`: en `APPS` agrega
   `<clave>: { name: '<NOMBRE_APP>', binding: '<CLAVE_MAYUS>', url: '<CLAVE_MAYUS>_URL', roles: ['owner', 'staff'], slug: false | 'optional' | 'required' }`.
3. En `public/admin.html`, función `loginUrl(b)`: agrega la ruta de ingreso de la app (por ejemplo `${base}/admin/login`).
4. Usa la misma `PLATFORM_KEY` en los dos proyectos.

## 8. Pruebas antes de entregar

Con `wrangler dev` y una base local:

- `/api/platform/businesses` sin clave → 401; con clave → lista.
- Crear negocio → abrir `invite_path` → crear contraseña → entrar. Una contraseña corta → error. El link usado ya no sirve.
- Login con clave mala → mismo mensaje genérico; 5 fallos → bloqueo.
- `POST …/users` con un correo existente → link de restablecer; con la clave nueva entra.
- PATCH `paid_until` a ayer → `/me` dice `readOnly: true`, las escrituras → 402, la lectura y el login → 200. `paid_until: null` → vuelve a escribir.
- Desde Diwilo local (`wrangler dev` de las dos apps; el service binding se conecta solo): la pestaña Negocios lista la app, crea, registra pagos y genera links.

Entrega: resumen de lo cambiado, la migración, los pasos de despliegue en orden y el resultado de las pruebas.
