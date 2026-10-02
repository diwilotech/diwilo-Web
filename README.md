# Diwilo — sitio web

Rediseño del sitio de [Diwilo](https://diwilo.com): datos, automatización y agentes de IA.
Sitio estático (HTML + CSS + JS, sin dependencias de build), listo para GitHub Pages o cualquier hosting.

## Páginas

| Archivo | Contenido |
| --- | --- |
| `index.html` | Inicio: hero, capacidades, ruta de trabajo, tablero en vivo, cifras, casos, clientes |
| `servicios.html` | Servicios, demos interactivas (tablero, flujo, agente), proyectos, modalidades |
| `arquitectura.html` | Capas del sistema, metodologías, flujo técnico, ecosistema de herramientas |
| `contacto.html` | Formulario de diagnóstico y calculadora de horas recuperables |
| `privacidad.html` | Política de tratamiento de datos (Ley 1581 de 2012) |

## Animaciones

- Aparición al hacer scroll: cualquier elemento con `data-reveal` (`""`, `left`, `right`, `scale`, `fade`).
  Los hijos de un contenedor con `data-stagger="90"` aparecen escalonados.
- Hero palabra por palabra (`data-split`), barra de progreso de lectura, paralaje del fondo.
- Línea de la "Ruta" que se llena con el scroll, contadores (`data-count`), barras del tablero que crecen
  y flujo de automatización que se ejecuta solo al entrar en pantalla.
- Se respetan las preferencias de movimiento reducido del sistema (`prefers-reduced-motion`).

## Ver en local

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Formulario de contacto

Por defecto el formulario abre el correo del visitante con el mensaje listo para `hola@diwilo.com`.
Para recibirlo directamente, pega un endpoint (Formspree, FormSubmit o un webhook de n8n) en
`FORM_ENDPOINT` al inicio de `assets/js/main.js`.

## Editar contenido

- Textos fijos: directamente en cada `.html`.
- Casos, proyectos, capas y metodologías: arreglos de datos en `assets/js/main.js`
  (`initCases`, `initProjects`, `initLayers`, `initMethods`).
- Colores y tipografías: variables al inicio de `assets/css/styles.css`.
