ADELANTE

TAREA ÚNICA: E10.1 — carta de detalle mundial (PMTiles de OSM, zoom 0–6) sobre el piso.

Dos partes en un solo commit. Dependencia nueva permitida: `pmtiles` (npm, versión exacta).

PARTE A — el archivo de teselas (GitHub Actions, no en la laptop)
1. .github/workflows/tiles.yml: `on: workflow_dispatch` y `push: paths: ["tools/tiles/**"]`.
   Pasos: descargar el binario `pmtiles` (go-pmtiles, última release de
   https://github.com/protomaps/go-pmtiles/releases, linux x86_64); extraer del build diario de
   Protomaps el mundo hasta zoom 6:
     pmtiles extract https://build.protomaps.com/$(date -u +%Y%m%d).pmtiles world-z6.pmtiles --maxzoom=6
   (si el de hoy no existe, probar ayer y anteayer). Publicar `world-z6.pmtiles` y un
   `tiles.json` ({ "world": { "url": "<url del asset>", "bytes": N, "sha256": "...", "built": "YYYY-MM-DD" } })
   como assets de una Release con tag `tiles-latest` (acción softprops/action-gh-release, `overwrite`).
2. tools/tiles/zones.json: por ahora solo `{ "world": { "maxzoom": 6 } }` (las zonas por cuenca van
   en E10.2). Hacer push de ese archivo dispara el job.

PARTE B — la app
3. main.ts: `import { Protocol } from "pmtiles"; const p = new Protocol(); maplibregl.addProtocol("pmtiles", p.tile)`
   (con la API que exponga la versión instalada) ANTES de crear el mapa.
4. Fuente vectorial `detail` en el estilo base: `{ type: "vector", url: "pmtiles://" + TILES_WORLD_URL, maxzoom: 6 }`
   donde TILES_WORLD_URL es la URL del asset `world-z6.pmtiles` de la release `tiles-latest`
   (constante en main.ts; actualizarla en el mismo commit cuando exista). Si la fuente falla (sin
   red o sin archivo), el mapa sigue con el piso: capturar el error de la fuente en `map.on("error")`
   y no mostrar nada al usuario.
5. Capas sobre `detail`, en este orden, encima de `country-label` y debajo de `basin-label`:
   - `detail-water`: fill, source-layer `water`, color #0b1626 (tapa el piso donde hay agua fina).
   - `detail-earth`: fill, source-layer `earth`, color #1c2733.
   - `detail-boundary`: line, source-layer `boundaries`, filter kind == "country", color #3a4a5a, 0.6 px.
   - `detail-place`: symbol, source-layer `places`, text-field name, text-size por kind
     (country 12, region 11, locality 10), color #9FB0C0, halo #0b1626, minzoom 3.
   Las capas de Natural Earth (`country-*`, `city-*`, `coast-line`) se apagan con `minzoom`/`maxzoom`
   para que a zoom ≥ 4 mande el detalle: NE visible 0–4, detalle 4–6 (en E10.2 llegará 7–11).
6. Atribución: control de atribución de MapLibre activado (compacto) con
   "© OpenStreetMap contributors · Protomaps · Natural Earth".
7. Prueba: con red, a zoom 5 sobre el Caribe se ven costas finas y nombres de islas y ciudades; sin
   red (tras cargar), el piso sigue y no hay errores en consola; el presupuesto de primera carga no
   sube (las teselas se piden por rangos al hacer zoom).
8. npm test, build-web.sh, commit "E10.1: carta de detalle mundial PMTiles z0–6", push, PARÁ.
   Si el job de la Parte A falla, anotá el log en BLOCKERS.md y hacé la Parte B apuntando a la URL
   prevista; Claude revisa.
