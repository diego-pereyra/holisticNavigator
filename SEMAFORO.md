ADELANTE

TAREA ÚNICA: E11.4 — Rutas propias (crear, editar, guardar, navegar).

Especificación: docs/adr/*.md (E11 rutas propias) + docs/04-backlog-ux.md.

Archivos: web/src/core/routes-own.ts (nuevo), web/src/core/routes-own.test.ts, web/src/ui/app.ts, web/src/ui/routes-own.ts (nuevo), web/public/app.css.

1. Crear ruta propia: tocar en el mapa para agregar waypoints; cada punto se nombra automáticamente (WP1, WP2…); se puede editar nombre y coordenadas.
2. Calcular distancia total y rumbo entre waypoints consecutivos (haversine).
3. Guardar ruta propia en IndexedDB (`hn.routes-own.<id>`) con nombre, fecha, waypoints, distancia.
4. Listar rutas propias en pestaña Rutas (sección "Mis rutas"); seleccionar para ver en ficha; navegar (Seguir) como una ruta del catálogo.
5. Exportar/importar GPX para rutas propias (reutilizar core/gpx.ts).
6. Editar ruta propia: agregar/quitar/mover waypoints; recalcular distancia.
7. Tests: crear ruta, agregar waypoint, calcular distancia, guardar/leer IndexedDB, exportar GPX.
8. npm test, build-web.sh, commit "E11.4: rutas propias", push, PARÁ.