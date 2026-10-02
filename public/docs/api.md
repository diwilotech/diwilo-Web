---
title: API de Diwilo · Desarrolladores
description: Servidor MCP, API pública e integraciones de Diwilo para sistemas y agentes de IA.
url: https://diwilo.com/docs/api
---

Desarrolladores y agentes de IA

# API de Diwilo

Conecta tus sistemas o tu agente de IA con Diwilo: consulta servicios, solicita un diagnóstico o integra los datos del panel.

## Servidor MCP

Endpoint https://diwilo.com/mcp (Streamable HTTP, sin estado, JSON-RPC por POST). Herramientas:

- diwilo_info: servicios, casos, metodologías o contacto.
- diwilo_solicitar_diagnostico: envía una solicitud de diagnóstico (nombre, correo, necesidad).

Tarjeta del servidor: [/.well-known/mcp/server-card.json](https://diwilo.com/.well-known/mcp/server-card.json).

## API pública

- POST /api/lead: solicitud de contacto. JSON con name, email, phone, topics, message.
- POST /api/chat: pregunta al asistente de IA. JSON con sid y message; responde { reply }.
- GET /api/health: estado del servicio.

## API de integraciones

Requiere una clave creada en el panel de Diwilo, enviada como Authorization: Bearer dwl_….

- GET /v1/leads, GET /v1/events, GET /v1/chats, GET /v1/chats/{id}, GET /v1/stats
- POST /v1/links: crea un link de rastreo con UTM.

## Descubrimiento

- Especificación OpenAPI: [/openapi.json](https://diwilo.com/openapi.json)
- Catálogo de APIs (RFC 9727): [/.well-known/api-catalog](https://diwilo.com/.well-known/api-catalog)
- Catálogo de capacidades (ARD): [/.well-known/ai-catalog.json](https://diwilo.com/.well-known/ai-catalog.json)
- Skills para agentes: [/.well-known/agent-skills/index.json](https://diwilo.com/.well-known/agent-skills/index.json)
- Resumen para modelos de lenguaje: [/llms.txt](https://diwilo.com/llms.txt)
- Cada página tiene versión Markdown: pide la URL con Accept: text/markdown o agrega .md (por ejemplo [/servicios.md](https://diwilo.com/servicios.md)).
