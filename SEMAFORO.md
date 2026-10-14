ADELANTE

TAREA ÚNICA: E10.2 — zonas de carta detallada (zoom 7–10) descargables para usar sin red.

Empezamos con DOS zonas para medir: "caribe" y "rio-de-la-plata". El resto se decide con los números.

PARTE A — job de teselas (.github/workflows/tiles.yml, tools/tiles/zones.json)
1. zones.json pasa a:
   { "world": { "maxzoom": 6 },
     "caribe": { "bbox": [-90, 7, -58, 28], "minzoom": 7, "maxzoom": 10, "nombre": "Caribe y Antillas" },
     "rio-de-la-plata": { "bbox": [-60, -40, -50, -31], "minzoom": 7, "maxzoom": 10, "nombre": "Río de la Plata y Uruguay" } }
2. El job, por cada zona con bbox: pmtiles extract <planet> zones/<id>.pmtiles --bbox=W,S,E,N --minzoom=7 --maxzoom=10;
   publica cada archivo en la release tiles-latest y en tiles.json agrega
   "zones": { "<id>": { "nombre", "bbox", "bytes", "sha256", "url" } }.
   Si una zona supera 80 MB, el job la publica igual pero lo anota en el resumen del run.
3. deploy-pages.yml copia también `zones/*.pmtiles` a web/dist/tiles/zones/ (misma exclusión de SW y presupuesto).

PARTE B — app (web/src/platform/tiles.ts nuevo, web/src/ui/app.ts, web/src/main.ts, app.css)
4. platform/tiles.ts:
   - loadTilesIndex(): fetch tiles/tiles.json (network-first, guardado en hn.tiles.index).
   - downloadZone(id, onProgress): fetch de tiles/zones/<id>.pmtiles leyendo el body con
     ReadableStream para reportar % (Content-Length), arma un Blob y lo guarda en IndexedDB clave
     hn.tiles.<id> (el KeyValueStore actual es de strings: agregar putBlob/getBlob/removeBlob en
     platform/store.ts usando el mismo object store).
   - listZones(): estado por zona: no descargada / descargando % / lista (bytes, fecha).
   - deleteZone(id).
5. main.ts: por cada zona descargada al arrancar, `protocol.add(new PMTiles(new FileSource(blob)))`
   con el nombre `zone-<id>` (usar la API de pmtiles@4.5.0; si FileSource exige File, envolver:
   new File([blob], id)). Fuente vectorial `detail-<id>` con url `pmtiles://zone-<id>` y las mismas
   cuatro capas que `detail` (water/earth/boundary/place) con sufijo `-<id>`, minzoom 7, maxzoom 10,
   más `detail-<id>-road`? NO: solo water, earth, boundary, place y además `detail-<id>-poi` para
   puertos: symbol sobre source-layer `pois` filter kind in ["harbor","marina","lighthouse"],
   text-field name, icono de texto "⚓" / "🏮" según kind, minzoom 8.
   Las zonas descargadas se dibujan solo si el viewport toca su bbox.
6. Panel "Sin conexión" en Aquí (nueva tarjeta, debajo de Alarmas): filas
   `Carta base · siempre` · `Carta mundial (zoom ≤ 6) · 45 MB · con red` ·
   una fila por zona de tiles.json: `Caribe y Antillas · 62 MB · [Descargar] / 34 % / ✓ 12 oct · [Borrar]`.
   Descargar pide confirmación si no hay Wi-Fi (navigator.connection?.type === "cellular").
7. Prueba: descargar "Río de la Plata" (progreso visible), modo avión, recargar, zoom 9 sobre
   Montevideo → costas, calles principales no (no las dibujamos), nombres de puertos y balizas de
   OSM si existen en pois; fuera de la zona, el mundo z≤6 cacheado no está (es por rangos) y se ve
   el piso sin errores.
8. Anotar en el commit los tamaños reales de las dos zonas. npm test, build-web.sh,
   commit "E10.2: zonas de carta detallada descargables (caribe, rio-de-la-plata)", push, PARÁ.
