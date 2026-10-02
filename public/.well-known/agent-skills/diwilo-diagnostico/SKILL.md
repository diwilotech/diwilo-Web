---
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
