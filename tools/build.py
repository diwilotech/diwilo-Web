"""Genera public/ a partir de src/pages: páginas HTML, versiones Markdown y archivos
de descubrimiento para buscadores y agentes de IA.

Uso:  python3 tools/build.py
Volver a ejecutarlo después de cambiar textos en src/pages (actualiza también el sitemap).
"""
import datetime
import hashlib
import html
import json
import pathlib
import re
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "pages"
OUT = ROOT / "public"
SITE = "https://diwilo.com"
TODAY = datetime.date.today().isoformat()

# archivo: (ruta pública, clave del menú, título, descripción, prioridad en sitemap o None)
PAGES = {
    "index.html": ("/", "inicio", "Diwilo · Datos y automatización con IA",
                   "Diseñamos, construimos y operamos software de datos, automatización y agentes de IA para empresas, fundaciones y equipos de producto en Colombia.", "1.0"),
    "servicios.html": ("/servicios", "servicios", "Servicios · Diwilo",
                       "Analítica, automatización de flujos, agentes de IA, chatbots, extracción de datos y dashboards. Prueba las demostraciones en vivo.", "0.9"),
    "arquitectura.html": ("/arquitectura", "arquitectura", "Arquitectura y método · Diwilo",
                          "Infraestructura desacoplada, orquestación con n8n y metodologías auditables: Scrum, Kanban, CRISP-DM, MLOps, PMI y Ley 1581.", "0.7"),
    "contacto.html": ("/contacto", "contacto", "Contacto · Diwilo",
                      "Cuéntanos sobre tu operación. Primera sesión de diagnóstico sin costo y respuesta en menos de 24 horas hábiles.", "0.8"),
    "privacidad.html": ("/privacidad", "", "Política de privacidad · Diwilo",
                        "Política de tratamiento de datos personales de Diwilo conforme a la Ley 1581 de 2012.", "0.3"),
    "404.html": (None, "", "Página no encontrada · Diwilo", "La página que buscas no existe en diwilo.com.", None),
}

# Contenido que en el sitio se pinta con JavaScript y que también debe estar en la versión Markdown
MD_EXTRA = {
    "index.html": """
## Casos

- **Dashboards PMO** (construcción): avance, costo y cronograma de todos los proyectos en un tablero único que se alimenta solo desde las hojas y el ERP. Python, ETL, dashboard.
- **Automatización n8n** (operaciones): flujos que integran CRM, correo y base de datos, con alertas y reintentos automáticos. Ejecución desatendida 24/7.
- **Becas Centenario** (sector social): postulaciones en línea, seguimiento por etapas y reportes para el comité. Web, Supabase.
""",
    "servicios.html": """
## Proyectos en producción

- **Madetableros** — sitio corporativo con catálogo y formulario de cotización: https://madetableros.com.co/
- **Fundación Amor por Medellín** — portal institucional con programas y donaciones: https://fundacionamorpormedellin.com/
- **Rotary Club Medellín** — web informativa con agenda y proyectos: https://www.rotaryclubmedellin.org/
- **Becas del Centenario Rotario** — postulación y seguimiento del programa de becas: https://www.becasdelcentenariorotario.org/
- **Dashboards PMO** — indicadores de proyecto en tiempo real.
- **Panel n8n** — monitoreo de flujos automatizados.
""",
    "contacto.html": """
## Solicitar un diagnóstico

- Formulario: https://diwilo.com/contacto (nombre y empresa, correo, WhatsApp opcional, qué necesitas y el proceso a automatizar).
- Agentes de IA: servidor MCP `https://diwilo.com/mcp`, herramienta `diwilo_solicitar_diagnostico`; o `POST https://diwilo.com/api/lead` con JSON `{"name", "email", "phone", "message"}`.
- Correo: hola@diwilo.com · WhatsApp: +57 305 384 0193.

Respuesta en menos de 24 horas hábiles. Primera sesión de 45 minutos sin costo.
""",
    "arquitectura.html": """
## Capas del sistema

1. **Fuentes de datos** — bases de datos, hojas de cálculo, correo, documentos y APIs. Conectores con credenciales aisladas y lectura incremental.
2. **Orquestación** — n8n, webhooks y cron, con reintentos, colas y alertas.
3. **Datos y modelos** — Python, scikit-learn y LLMs, con versionado y revisión humana bajo umbral de confianza.
4. **Aplicación** — Supabase, dashboards web y Chatwoot, con accesos por rol.
5. **Infraestructura** — GNU/Linux, Docker y Dokploy, con ambientes separados y cifrado.

## Metodologías

- **Scrum** — entrega de producto en sprints de dos semanas con demo.
- **Kanban** — soporte y flujo continuo con SLA.
- **CRISP-DM** — proyectos de datos: negocio, datos, modelado, evaluación y despliegue.
- **MLOps y DevOps** — versionado, CI/CD y monitoreo de modelos.
- **PMI / PMBOK** — acta, cronograma y control de cambios.
- **Ley 1581 / ISO 27001** — protección de datos personales.
""",
}

# ---------------------------------------------------------------- plantilla

def head(title, desc, canonical):
    canon = f'<link rel="canonical" href="{SITE}{canonical}">\n<link rel="alternate" type="text/markdown" href="{md_path(canonical)}">\n' if canonical else '<meta name="robots" content="noindex">\n'
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
{canon}<meta name="theme-color" content="#05060f">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Diwilo">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{SITE}/assets/img/og.png">
{f'<meta property="og:url" content="{SITE}{canonical}">' + chr(10) if canonical else ''}<meta property="og:locale" content="es_CO">
<link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">
<link rel="icon" type="image/png" sizes="64x64" href="/assets/img/favicon.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/light/style.css">
<link rel="stylesheet" href="/assets/css/styles.css">
<script>document.documentElement.classList.add('js');</script>
<script src="/assets/js/main.js" defer></script>
</head>
<body>
<a class="sr-only" href="#main">Saltar al contenido</a>
<div class="scroll-progress" aria-hidden="true"></div>
<div class="page">
  <div class="page-bg" aria-hidden="true"><div class="page-bg__grid"></div><div class="page-bg__beam"></div></div>
"""

NAV_ITEMS = [("inicio", "/", "Inicio"), ("servicios", "/servicios", "Servicios"),
             ("arquitectura", "/arquitectura", "Arquitectura"), ("contacto", "/contacto", "Contacto")]


def nav(current):
    cur = ' aria-current="page"'
    links = "\n".join(f'        <a class="nav__link" href="{href}"{cur if key == current else ""}>{label}</a>'
                      for key, href, label in NAV_ITEMS)
    return f"""  <header class="nav-wrap">
    <nav class="nav" aria-label="Principal">
      <a class="brand" href="/"><img src="/assets/img/brand/logo-mark.svg" alt="" width="25" height="26"><span>Diwilo</span></a>
      <button class="nav__toggle" type="button" aria-label="Abrir menú" aria-expanded="false"><i class="ph-light ph-list"></i></button>
      <div class="nav__links">
{links}
        <a class="btn btn--primary nav__cta" href="/contacto">Agendar diagnóstico</a>
      </div>
    </nav>
  </header>
"""


FOOTER = """
  <footer class="footer">
    <div class="footer__grid" data-stagger="100">
      <div style="max-width:34ch">
        <a class="brand" href="/" style="margin-bottom:16px"><img src="/assets/img/brand/logo-mark.svg" alt="" width="25" height="26"><span>Diwilo</span></a>
        <p class="body muted" style="line-height:1.5">Software, ciencia de datos y automatización para empresas que necesitan operar con menos trabajo manual.</p>
      </div>
      <div>
        <p class="footer__title">Navegación</p>
        <div class="footer__links">
          <a href="/">Inicio</a>
          <a href="/servicios">Servicios</a>
          <a href="/arquitectura">Arquitectura</a>
          <a href="/contacto">Contacto</a>
          <a href="/docs/api">API para desarrolladores</a>
        </div>
      </div>
      <div>
        <p class="footer__title">Contacto</p>
        <div class="footer__links">
          <a href="mailto:hola@diwilo.com"><i class="ph-light ph-envelope-simple"></i>hola@diwilo.com</a>
          <a href="https://wa.me/573053840193?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20sus%20servicios" target="_blank" rel="noopener"><i class="ph-light ph-whatsapp-logo"></i>+57 305 384 0193</a>
          <a href="https://www.instagram.com/diwilo.tech/" target="_blank" rel="noopener"><i class="ph-light ph-instagram-logo"></i>diwilo.tech</a>
        </div>
      </div>
      <div>
        <p class="footer__title">Empieza</p>
        <p class="body muted" style="line-height:1.5;margin-bottom:16px">Cuéntanos sobre tu operación y te mostramos qué se puede automatizar.</p>
        <a class="btn btn--primary btn--sm" href="/contacto">Agendar diagnóstico</a>
      </div>
    </div>
    <div class="footer__bottom">
      <span>© <span data-year>2026</span> Diwilo. Ingeniería de datos y automatización.</span>
      <a href="/privacidad">Política de privacidad</a>
    </div>
  </footer>
</div>
</body>
</html>
"""


def md_path(route):
    return "/index.md" if route == "/" else route + ".md"


def clean_links(body):
    """contacto.html → /contacto (URLs canónicas sin .html)"""
    return re.sub(r'href="(index|servicios|arquitectura|contacto|privacidad)\.html"',
                  lambda m: 'href="/"' if m.group(1) == "index" else f'href="/{m.group(1)}"', body)

# ---------------------------------------------------------------- HTML → Markdown

class ToMarkdown(HTMLParser):
    BLOCK = {"p", "div", "section", "article", "header", "footer", "blockquote", "form", "label"}
    SKIP = {"script", "style", "svg", "button", "input", "textarea", "select", "noscript"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.href, self.hidden = [], 0, [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        hidden = a.get("aria-hidden") == "true" or "hidden" in a
        self.hidden.append(hidden)
        if hidden or tag in self.SKIP:
            self.skip += 1
            return
        if self.skip:
            return
        if tag in ("h1", "h2", "h3"):
            self.out.append("\n\n" + "#" * int(tag[1]) + " ")
        elif tag == "li":
            self.out.append("\n- ")
        elif tag in self.BLOCK:
            self.out.append("\n\n")
        elif tag == "br":
            self.out.append("  \n")
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag == "a":
            self.href.append(a.get("href", ""))
            self.out.append("[")

    def handle_endtag(self, tag):
        hidden = self.hidden.pop() if self.hidden else False
        if hidden or tag in self.SKIP:
            self.skip -= 1
            return
        if self.skip:
            return
        if tag in ("strong", "b"):
            self.out.append("**")
        elif tag == "a":
            href = self.href.pop() if self.href else ""
            if href.startswith("/"):
                href = SITE + href
            self.out.append(f"]({href})" if href and not href.startswith("#") else "]")
        elif tag in ("h1", "h2", "h3") or tag in self.BLOCK:
            self.out.append("\n\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(re.sub(r"\s+", " ", data))

    def markdown(self):
        text = "".join(self.out)
        text = re.sub(r"\[\s*\]\([^)]*\)", "", text)            # enlaces vacíos
        text = re.sub(r"\[([^\]]+)\](?!\()", r"\1", text)       # [texto] sin destino
        text = re.sub(r"(?m)^#+\s*$", "", text)                # encabezados vacíos (los llena JS)
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return "\n".join(l.strip() if not l.startswith("- ") else l.rstrip() for l in text.splitlines()).strip() + "\n"


def to_markdown(body, title, desc, route):
    main = re.search(r"<main[^>]*>(.*)</main>", body, re.S).group(1)
    p = ToMarkdown()
    p.feed(main)
    return f"---\ntitle: {title}\ndescription: {desc}\nurl: {SITE}{route}\n---\n\n{p.markdown()}"

# ---------------------------------------------------------------- generación

def write(path, content):
    path = OUT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("ok", path.relative_to(ROOT), len(content))


def sha256(text):
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_pages():
    for name, (route, key, title, desc, _) in PAGES.items():
        body = clean_links((SRC / name).read_text(encoding="utf-8"))
        write(name, head(title, desc, route) + nav(key) + body + FOOTER)
        if route:
            md = to_markdown(body, title, desc, route) + MD_EXTRA.get(name, "")
            write(md_path(route).lstrip("/"), md)


DOCS_API = """
  <main id="main">
    <section class="container hero">
      <p class="eyebrow hero-in">Desarrolladores y agentes de IA</p>
      <h1 class="h1 h1--sm" data-split>API de Diwilo</h1>
      <p class="lead hero-in" style="--d:500">Conecta tus sistemas o tu agente de IA con Diwilo: consulta servicios, solicita un diagnóstico o integra los datos del panel.</p>
    </section>
    <section class="container section section--last">
      <div class="prose panel" data-reveal>
        <h2 style="margin-top:0">Servidor MCP</h2>
        <p>Endpoint <code>https://diwilo.com/mcp</code> (Streamable HTTP, sin estado, JSON-RPC por POST). Herramientas:</p>
        <ul>
          <li><code>diwilo_info</code>: servicios, casos, metodologías o contacto.</li>
          <li><code>diwilo_solicitar_diagnostico</code>: envía una solicitud de diagnóstico (nombre, correo, necesidad).</li>
        </ul>
        <p>Tarjeta del servidor: <a href="/.well-known/mcp/server-card.json">/.well-known/mcp/server-card.json</a>.</p>

        <h2>API pública</h2>
        <ul>
          <li><code>POST /api/lead</code>: solicitud de contacto. JSON con <code>name</code>, <code>email</code>, <code>phone</code>, <code>topics</code>, <code>message</code>.</li>
          <li><code>POST /api/chat</code>: pregunta al asistente de IA. JSON con <code>sid</code> y <code>message</code>; responde <code>{ reply }</code>.</li>
          <li><code>GET /api/health</code>: estado del servicio.</li>
        </ul>

        <h2>API de integraciones</h2>
        <p>Requiere una clave creada en el panel de Diwilo, enviada como <code>Authorization: Bearer dwl_…</code>.</p>
        <ul>
          <li><code>GET /v1/leads</code>, <code>GET /v1/events</code>, <code>GET /v1/chats</code>, <code>GET /v1/chats/{id}</code>, <code>GET /v1/stats</code></li>
          <li><code>POST /v1/links</code>: crea un link de rastreo con UTM.</li>
        </ul>

        <h2>Descubrimiento</h2>
        <ul>
          <li>Especificación OpenAPI: <a href="/openapi.json">/openapi.json</a></li>
          <li>Catálogo de APIs (RFC 9727): <a href="/.well-known/api-catalog">/.well-known/api-catalog</a></li>
          <li>Catálogo de capacidades (ARD): <a href="/.well-known/ai-catalog.json">/.well-known/ai-catalog.json</a></li>
          <li>Skills para agentes: <a href="/.well-known/agent-skills/index.json">/.well-known/agent-skills/index.json</a></li>
          <li>Resumen para modelos de lenguaje: <a href="/llms.txt">/llms.txt</a></li>
          <li>Cada página tiene versión Markdown: pide la URL con <code>Accept: text/markdown</code> o agrega <code>.md</code> (por ejemplo <a href="/servicios.md">/servicios.md</a>).</li>
        </ul>
      </div>
    </section>
  </main>
"""


def build_docs():
    title, desc = "API de Diwilo · Desarrolladores", "Servidor MCP, API pública e integraciones de Diwilo para sistemas y agentes de IA."
    write("docs/api.html", head(title, desc, "/docs/api") + nav("") + DOCS_API + FOOTER)
    write("docs/api.md", to_markdown(DOCS_API, title, desc, "/docs/api"))
    PAGES["docs/api.html"] = ("/docs/api", "", title, desc, "0.5")


def openapi():
    lead = {"type": "object", "required": ["email"], "properties": {
        "name": {"type": "string", "description": "Nombre y empresa"}, "email": {"type": "string", "format": "email"},
        "phone": {"type": "string"}, "topics": {"type": "string"}, "message": {"type": "string"}}}
    bearer = [{"apiKey": []}]
    get_list = lambda summary: {"get": {"summary": summary, "security": bearer, "parameters": [
        {"name": "since", "in": "query", "schema": {"type": "integer"}, "description": "Marca de tiempo en ms"},
        {"name": "limit", "in": "query", "schema": {"type": "integer", "maximum": 500}}],
        "responses": {"200": {"description": "Lista en JSON"}, "401": {"description": "Clave inválida"}}}}
    return {
        "openapi": "3.1.0",
        "info": {"title": "API de Diwilo", "version": "1.0.0", "description": "Contacto, chat de IA e integraciones de diwilo.com.",
                 "contact": {"name": "Diwilo", "email": "hola@diwilo.com", "url": SITE}},
        "servers": [{"url": SITE}],
        "externalDocs": {"url": f"{SITE}/docs/api"},
        "components": {"securitySchemes": {"apiKey": {"type": "http", "scheme": "bearer", "description": "Clave dwl_… creada en el panel de Diwilo"}}},
        "paths": {
            "/api/health": {"get": {"summary": "Estado del servicio", "responses": {"200": {"description": "Servicio disponible"}}}},
            "/api/lead": {"post": {"summary": "Solicitar contacto o diagnóstico", "requestBody": {"required": True, "content": {"application/json": {"schema": lead}}},
                                   "responses": {"200": {"description": "Solicitud recibida"}, "400": {"description": "Datos inválidos"}}}},
            "/api/chat": {"post": {"summary": "Preguntar al asistente de IA", "requestBody": {"required": True, "content": {"application/json": {"schema": {
                "type": "object", "required": ["sid", "message"], "properties": {"sid": {"type": "string", "description": "Id de conversación"}, "message": {"type": "string", "maxLength": 1000}}}}}},
                "responses": {"200": {"description": "Respuesta", "content": {"application/json": {"schema": {"type": "object", "properties": {"reply": {"type": "string"}}}}}}}}},
            "/mcp": {"post": {"summary": "Servidor MCP (JSON-RPC 2.0, Streamable HTTP)", "responses": {"200": {"description": "Respuesta JSON-RPC"}}}},
            "/v1/leads": get_list("Leads recibidos"),
            "/v1/events": get_list("Eventos de analítica"),
            "/v1/chats": get_list("Conversaciones del chat"),
            "/v1/stats": {"get": {"summary": "Estadísticas", "security": bearer, "parameters": [{"name": "days", "in": "query", "schema": {"type": "integer"}}],
                                  "responses": {"200": {"description": "Estadísticas en JSON"}}}},
            "/v1/links": {"post": {"summary": "Crear link de rastreo", "security": bearer, "requestBody": {"content": {"application/json": {"schema": {
                "type": "object", "required": ["target"], "properties": {k: {"type": "string"} for k in ["title", "slug", "target", "utm_source", "utm_medium", "utm_campaign"]}}}}},
                "responses": {"201": {"description": "Link creado"}}}},
        },
    }


SKILL = """---
name: diwilo-diagnostico
description: Consultar los servicios de Diwilo (datos, automatización y agentes de IA en Medellín, Colombia) y solicitar un diagnóstico de automatización sin costo en nombre de una persona.
---

# Diwilo: servicios y solicitud de diagnóstico

Úsala cuando alguien quiera automatizar procesos, crear dashboards, agentes de IA o chatbots de WhatsApp, o pida contactar a Diwilo.

## Consultar información

- Servidor MCP `https://diwilo.com/mcp`, herramienta `diwilo_info` con `tema`: `servicios`, `casos`, `metodologia`, `contacto` o `todo`.
- O lee las páginas en Markdown: https://diwilo.com/index.md, https://diwilo.com/servicios.md, https://diwilo.com/arquitectura.md.

## Solicitar un diagnóstico

Pide antes el consentimiento de la persona y sus datos reales: nombre y empresa, correo y el proceso que quiere automatizar.

- MCP: herramienta `diwilo_solicitar_diagnostico` con `nombre`, `correo`, `necesidad` y opcional `telefono`.
- HTTP: `POST https://diwilo.com/api/lead` con JSON `{"name", "email", "phone", "message"}`.
- En el navegador, el formulario de https://diwilo.com/contacto está expuesto como herramienta WebMCP `solicitar_diagnostico`.

Diwilo responde en menos de 24 horas hábiles. La primera sesión (45 minutos) no tiene costo. No prometas precios: dependen del alcance.

## Contacto directo

hola@diwilo.com · WhatsApp +57 305 384 0193 (https://wa.me/573053840193)
"""


def build_discovery():
    pages = [(r, t, d, pr) for (r, _, t, d, pr) in PAGES.values() if r and pr]

    write("robots.txt", f"""# robots.txt de diwilo.com (RFC 9309)
# Política: el contenido público puede indexarse, usarse en respuestas de IA y para entrenamiento.
# Para impedir el entrenamiento cambia ai-train=yes por ai-train=no y Allow por Disallow en el grupo de entrenamiento.

User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /v1/
Disallow: /l/
Disallow: /c/

# Buscadores y asistentes de IA (deciden si Diwilo aparece en sus respuestas)
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /v1/
Disallow: /l/
Disallow: /c/

# Rastreadores de entrenamiento de modelos
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: CCBot
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /v1/
Disallow: /l/
Disallow: /c/

Sitemap: {SITE}/sitemap.xml
""")

    urls = "\n".join(f"  <url>\n    <loc>{SITE}{r}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <priority>{pr}</priority>\n  </url>" for r, _, _, pr in pages)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n')

    write("llms.txt", f"""# Diwilo

> Empresa de Medellín (Colombia) que diseña, construye y opera software de datos, automatización y agentes de IA para empresas, fundaciones y equipos de producto. Primera sesión de diagnóstico sin costo.

## Páginas
""" + "\n".join(f"- [{t.split(' · ')[0]}]({SITE}{md_path(r)}): {d}" for r, t, d, _ in pages) + f"""

## Para agentes
- [Servidor MCP]({SITE}/.well-known/mcp/server-card.json): consulta servicios y solicita un diagnóstico
- [API]({SITE}/docs/api.md): documentación; especificación en {SITE}/openapi.json
- [Skill]({SITE}/.well-known/agent-skills/diwilo-diagnostico/SKILL.md): cómo ayudar a alguien a contactar a Diwilo

## Contacto
- hola@diwilo.com · WhatsApp +57 305 384 0193
""")

    write("openapi.json", json.dumps(openapi(), ensure_ascii=False, indent=2) + "\n")

    write(".well-known/api-catalog", json.dumps({"linkset": [{
        "anchor": f"{SITE}/",
        "service-desc": [{"href": f"{SITE}/openapi.json", "type": "application/vnd.oai.openapi+json"}],
        "service-doc": [{"href": f"{SITE}/docs/api", "type": "text/html"}],
        "status": [{"href": f"{SITE}/api/health", "type": "application/json"}],
    }]}, indent=2) + "\n")

    card = {
        "$schema": "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
        "serverInfo": {"name": "diwilo", "title": "Diwilo", "version": "1.0.0"},
        "description": "Servicios de datos, automatización y agentes de IA de Diwilo. Consulta información y solicita un diagnóstico sin costo.",
        "websiteUrl": SITE,
        "transport": {"type": "streamable-http", "endpoint": f"{SITE}/mcp"},
        "capabilities": {"tools": True, "resources": False, "prompts": False},
        "tools": [{"name": "diwilo_info", "description": "Servicios, casos, metodologías o contacto de Diwilo."},
                  {"name": "diwilo_solicitar_diagnostico", "description": "Envía una solicitud de diagnóstico de automatización."}],
        "authentication": {"required": False},
    }
    write(".well-known/mcp/server-card.json", json.dumps(card, ensure_ascii=False, indent=2) + "\n")

    write(".well-known/agent-skills/diwilo-diagnostico/SKILL.md", SKILL)
    write(".well-known/agent-skills/index.json", json.dumps({
        "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
        "skills": [{
            "name": "diwilo-diagnostico", "type": "skill-md",
            "description": "Consultar los servicios de Diwilo y solicitar un diagnóstico de automatización sin costo.",
            "url": f"{SITE}/.well-known/agent-skills/diwilo-diagnostico/SKILL.md", "digest": sha256(SKILL)}],
    }, ensure_ascii=False, indent=2) + "\n")

    write(".well-known/ai-catalog.json", json.dumps({
        "specVersion": "1.0",
        "host": {"displayName": "Diwilo", "identifier": "did:web:diwilo.com", "url": SITE},
        "entries": [
            {"identifier": "urn:air:diwilo.com:mcp:diwilo", "displayName": "Servidor MCP de Diwilo",
             "type": "application/mcp-server-card+json", "url": f"{SITE}/.well-known/mcp/server-card.json",
             "representativeQueries": ["empresa para automatizar procesos con IA en Medellín", "quiero un diagnóstico de automatización sin costo",
                                       "qué servicios de datos y agentes de IA ofrece Diwilo", "contactar a Diwilo"]},
            {"identifier": "urn:air:diwilo.com:api:public", "displayName": "API de Diwilo",
             "type": "application/vnd.oai.openapi+json", "url": f"{SITE}/openapi.json",
             "representativeQueries": ["enviar una solicitud de contacto a Diwilo", "API para integrar leads con n8n", "preguntar al asistente de Diwilo"]},
            {"identifier": "urn:air:diwilo.com:skills:index", "displayName": "Skills de Diwilo para agentes",
             "type": "application/json", "url": f"{SITE}/.well-known/agent-skills/index.json",
             "representativeQueries": ["cómo solicitar un diagnóstico a Diwilo", "cómo ayudar a un usuario a contactar a Diwilo"]},
            {"identifier": "urn:air:diwilo.com:docs:llms", "displayName": "Resumen del sitio para modelos de lenguaje",
             "type": "text/markdown", "url": f"{SITE}/llms.txt",
             "representativeQueries": ["qué es Diwilo", "servicios y casos de Diwilo", "metodologías de trabajo de Diwilo"]},
        ],
    }, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    build_pages()
    build_docs()
    build_discovery()
