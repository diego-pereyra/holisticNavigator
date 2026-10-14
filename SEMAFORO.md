ADELANTE

TAREA ÚNICA: E10.1b — servir las teselas desde GitHub Pages (resuelve el bloqueo CORS).

Decisión: los assets de Releases quedan como almacén; lo que la app lee es una copia en el propio
sitio de Pages (manda CORS * y acepta peticiones por rangos).

1. .github/workflows/deploy-pages.yml, después del build y antes del smoke test:
     mkdir -p web/dist/tiles
     curl -sSL -o web/dist/tiles/world-z6.pmtiles \
       https://github.com/diego-pereyra/holisticNavigator/releases/download/tiles-latest/world-z6.pmtiles
     curl -sSL -o web/dist/tiles/tiles.json \
       https://github.com/diego-pereyra/holisticNavigator/releases/download/tiles-latest/tiles.json
   (si la descarga falla, el paso falla: no se publica un sitio sin teselas).
2. main.ts: TILES_WORLD_URL = new URL("tiles/world-z6.pmtiles", document.baseURI).toString().
3. scripts/build-web.sh / sw-manifest: excluir `tiles/` del precache (son 45 MB; se piden por rangos).
4. service-worker.js: si `url.pathname.includes("/tiles/")` → `return;` ANTES de cualquier
   respondWith (el SW no debe tocar peticiones con Range: cachearía respuestas 206 parciales y
   corrompería la lectura). Comentario en el código explicándolo.
5. scripts/budget.sh: excluir `tiles/` del cálculo de primera carga.
6. Smoke test: sin cambios; debe pasar con la fuente detail cargando desde el mismo origen.
7. Prueba en CI: deploy verde; con red, zoom 5 sobre el Caribe muestra costas finas y nombres;
   DevTools → Network muestra peticiones a tiles/world-z6.pmtiles con status 206.
8. Commit "E10.1b: teselas servidas desde Pages, fuera del SW y del presupuesto", push, PARÁ.
   Marcá el bloqueo como resuelto en BLOCKERS.md.
