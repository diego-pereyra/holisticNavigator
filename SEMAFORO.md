ADELANTE

TAREA ÚNICA: E11.5 — Copiar ruta + catálogo solo lectura.

Regla de Diego (2026-10-16): botón "Copiar ruta" separado del optimizador; editable (agregar,
quitar, mover waypoints y eliminar la ruta) en TODAS menos las del catálogo, que son solo
lectura.

Archivos: web/src/ui/app.ts, web/src/core/routes-own.ts (+test), web/public/app.css.

1. Botón "Copiar ruta" en la ficha de cualquier ruta (catálogo, propia, importada): crea una
   copia editable en Mis rutas — `<código> (copia)` para el catálogo, `<nombre> (copia)` para
   propias — y queda seleccionada, lista para Seguir, Exportar o editar.
2. Solo lectura reforzada: en rutas del catálogo el editor no abre; la ficha muestra
   "Ruta del libro · solo lectura — Copiala para editarla" con el botón al lado.
3. Editor y eliminación (existe de E11.4; hoy falta poder eliminar — Diego lo probó):
   "Eliminar ruta" SOLO en Mis rutas (propias, importadas y copias): en la ficha y al final
   de la fila de Mis rutas, con confirmación en banda ("¿Eliminar <nombre>? · Eliminar", sin
   modal del navegador). Las rutas del catálogo jamás muestran "Eliminar". Verificar que
   agregar/quitar/mover waypoints funcionan en propias, importadas y copias, con recálculo
   de nm al editar.
4. Tests: copiar una del catálogo produce una propia idéntica (mismos waypoints) marcada
   como propia; copiar una propia produce dos rutas independientes (editar una no toca la
   otra); eliminar quita la ruta del store y de la lista, y no reaparece tras recargar.
5. npm test (en web/), bash scripts/build-web.sh, commit "E11.5: copiar ruta + catálogo solo
   lectura", push, PARÁ.

La siguiente será E12.5 (isócronas + "Optimizar con el viento", revisada: optimizar = vista
sobre cualquier ruta; aplicar solo en propias — spec completa en docs/05-cola-de-trabajo.md).
