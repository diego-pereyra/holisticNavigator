ADELANTE

TAREA ÚNICA: UX-N.5 — Consistencia: "Cuándo" abre el selector, la ayuda deja de mentir,
Medir existe y el pin lo usa, nav-to-wp se dibuja.
(docs/07-rediseño-usabilidad.md, decisión D5 + hallazgos del inventario.)

Archivos: web/src/ui/app.ts, web/src/main.ts (capa measure-line), web/src/core/format.ts
(distancias de Medir), web/public/app.css.

1. **"Cuándo" abre el selector de mes** (app.ts:1566 hoy manda a Aquí): el chip de la barra
   abre hn-month-menu, igual que "Salgo en {mes}".
2. **Ayuda veraz:** reescribir la primera ayuda con lo que existe hoy (posiciones, mes,
   rutas, clima con el pin, ajustes) — cero referencias a botones que no existen ("Enviar a
   plotter" fuera). Mencionar el long-press: "mantené pulsado el mar para pedir acciones
   sobre ese punto".
3. **Herramienta Medir:** "Medir desde acá" en la hoja del pin arranca la medición: cada
   toque agrega punto; muestra distancia por tramo y total y rumbo de cada tramo (format.ts);
   se dibuja en la capa `measure-line` (id ya fijo en Nombres fijos); banda con "Limpiar".
   ESC o ✕ termina.
4. **nav-to-wp dibujado:** en modo Navegar, la línea punteada verde posición → próximo
   waypoint se alimenta (la capa existe, la fuente navline nunca se llena — app.ts:823):
   visible solo con ruta activa y posición.
5. **Botón "Descargar pronóstico de la vista"** en el panel Tiempo (si UX-N.2 no lo puso
   todavía) y el resumen del clima del pin con su edad visible.
6. Tests (node:test): medir suma tramos y rumbos correctos; el selector de mes abre desde
   "Cuándo"; nav-to-wp solo con ruta activa.
7. Aceptación: el UAT no registra ningún "no se encontró" en los journeys; la ayuda cabe en
   390×844 sin scroll.
8. npm test (en web/), bash scripts/build-web.sh, commit "UX-N.5: consistencia, Medir y
   nav-to-wp", push. Al terminar escribí "Status:done" al final de este archivo.

Status: ready
