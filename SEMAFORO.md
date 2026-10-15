ADELANTE

TAREA ÚNICA: P-1 — liberar presupuesto de primera carga (batimetría y países después del primer dibujo).

Estamos a 1.176 MB de 1.200 MB gzip. La batimetría (309 KB gz) y los países (52 KB) se cargan con el
estilo antes del primer dibujo; no hace falta.

Archivos: web/src/main.ts, scripts/budget.sh. Nada más.

1. El estilo base inicial lleva solo background, graticule y las capas vacías (fuentes bathy y
   countries con `data: { type: "FeatureCollection", features: [] }`). El mapa dibuja enseguida.
2. Tras `map.on("load")`: fetch de basemap/bathy.geojson y basemap/countries.geojson en paralelo
   y `getSource(id).setData(json)` al llegar cada uno (primero countries, pesa menos). Sin bloquear
   boot ni la UI; si fallan, el mapa sigue con fondo y retícula (sin error visible).
3. Los dos archivos siguen en el precache del SW (ya están), así sin red llegan de caché.
4. scripts/budget.sh: contar como "primera carga" solo index.html, main.js, main.css, app.css,
   icon.svg, manifest, maplibre-gl-worker.mjs, catalog/index.json, catalog/basins.json,
   catalog/routes.geojson y basemap/graticule.geojson; imprimir aparte "diferido" (bathy,
   countries, cities, facts) y "precache total". El límite de 1.200.000 aplica a la primera carga.
5. Prueba: en DevTools → Network con "Slow 3G", el mapa con retícula aparece antes de que termine
   bathy.geojson; al terminar, el relieve aparece sin parpadeo. budget.sh imprime primera carga
   ≤ 850 KB.
6. npm test, build-web.sh, commit "P-1: batimetría y países diferidos tras el primer dibujo", push, PARÁ.
