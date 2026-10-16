ADELANTE

TAREA ÚNICA: E12.2 — Rutas del catálogo que no tocan tierra (A* con margen sobre la máscara E12.1).

Especificación: docs/adr/008-weather-routing.md §Plan (T12.2) y §Decisión (niveles 1 y 5:
"arreglar tierra" y "A* sobre la rejilla"). Es trabajo de pipeline (Python + datos); la app
solo recibe el catálogo regenerado.

Archivos: tools/optimize_coast.py (v2), tools/build_landmask.py (máscara, ya existe de E12.1),
tools/build_v2_catalog.py (regenera el catálogo), scripts/sync-catalog.sh (ya copia). Nada de
UI nueva.

1. Medir de nuevo con la máscara 10m: re-corre el detector de cruces con margen (dilatación de
   1 celda de 0,1° ≈ 3 nm) sobre las 2 268 variantes y reportá cuántas cruzan hoy — el "164"
   del ADR se midió con la costa 110m; el número real puede ser otro.
2. optimize_coast.py v2: por cada variante con cruces, re-enrutar SOLO los tramos que cruzan
   con A* sobre la grilla 0,1° con la máscara dilatada, acotado al bbox del tramo + 2° de
   margen, coste = distancia. Si A* no encuentra camino o el rodeo queda > 15 % más largo que
   el tramo original, la variante queda needsReview (no se fuerza).
3. Waypoints insertados: nombre "Costa 1…n" por variante, `corrected: true` (⚑ en la ficha),
   simplificados con Douglas-Peucker (tol 0,05°) para no llenar la tabla. Los waypoints del
   libro no se tocan; el trazado original queda como referencia en el pipeline, no en la app.
4. Regenerar el catálogo completo (routes.geojson + facts + index con los nm recalculados de
   los trazados corregidos), CATALOG_VERSION + 1, sync a web/public/catalog.
5. Validación (falla si no se cumple): ninguna variante cruza tierra con margen según la
   máscara nueva; needsReview baja a < 20 variantes; facts y routes.geojson siguen
   coincidiendo en cantidad y orden de waypoints (validación existente del build).
6. npm test (en web/), bash scripts/build-web.sh, commit "E12.2: rutas sin tocar tierra
   (A* con margen)", push, PARÁ.

La siguiente será E12.3 (polar del barco: parser del formato tabulado + polar genérica).
