# ADR-005: Mapa base empaquetado (costa + retícula), sin teselas online

**Estado:** Propuesto · **Fecha:** 2026-10-13 · **Fase:** P-A

## Contexto

`MaplibreMap` se instancia sin `baseStyle`, así que usa el estilo *demo* de MapLibre
(`demotiles.maplibre.org`): teselas vectoriales online, de baja resolución, sin caché controlada por
nosotros. Sin conexión el mapa queda en blanco: solo se ven las rutas flotando sobre fondo oscuro.
Eso contradice el principio 1 de la misión ("offline primero") en el momento en que más importa.

El repo ya contiene `data/land/ne_110m_land.geojson` (Natural Earth 110m, dominio público, 136 KB),
usado por `tools/landcheck.py`. MapLibre Compose 0.19 soporta `BaseStyle.Json`, `FillLayer`,
`BackgroundLayer` y `SymbolLayer` con texto.

## Decisión

1. El estilo base de la app es un **JSON generado en código** (`BaseMap.kt`) con dos fuentes GeoJSON
   locales: `basemap/land.geojson` (Natural Earth 110m) y `basemap/graticule.geojson` (meridianos y
   paralelos cada 10°, generados por `tools/build_basemap.py`).
2. Capas: fondo océano `#0b1626`, relleno de tierra `#1c2733`, línea de costa `#3a4a5a`, retícula
   `#17202b` con etiquetas `20°N` / `060°W` a partir de zoom 2.
3. **No se cargan teselas online** en esta fase. El mapa es idéntico con y sin red.
4. El detalle (costa fina, puertos, topónimos, luces) llega en una **fase 2** como capa de teselas
   vectoriales derivadas de OSM en formato **PMTiles**, ver más abajo. La costa Natural Earth queda
   siempre como piso: lo que se vea sin descargar nada.

## Por qué

- Para planificar océanos, la costa a 110m es suficiente: lo que importa son rutas, waypoints,
  cuencas y posición, no calles ni batimetría.
- 136 KB + retícula entran en el precache del service worker sin pensarlo.
- Una sola apariencia online/offline elimina la sorpresa de "el mapa se ve distinto en el mar".
- Natural Earth es dominio público: cero riesgo de licencia.

## Consecuencias

- **Positivas:** mapa garantizado sin red; sin dependencia ni petición a terceros; estilo náutico
  oscuro coherente con la app.
- **Negativas:** sin detalle costero fino (110m ≈ errores de varias millas en la costa); no sirve para
  aproximaciones a puerto, que de todos modos son un *non-goal* (no somos plotter). Si hiciera
  falta más detalle en zonas pobladas de rutas, se puede subir a Natural Earth 50m (~1 MB) sin
  cambiar la arquitectura.

## Fase 2: detalle sobre OSM con PMTiles (la opción más liviana y potente)

Objetivo: más detalle "como una capa sobre OSM", sin servidor propio y usable sin red.

**PMTiles** (Protomaps) es un archivo único de teselas vectoriales que se sirve desde cualquier
hosting estático por *HTTP range requests*: GitHub Pages lo soporta, no hay servidor de teselas ni
API key, y MapLibre lo lee con el protocolo `pmtiles://` (en Web, paquete npm `pmtiles` +
`maplibregl.addProtocol`; en MapLibre Native ya es nativo). Los datos son el *Protomaps basemap*
(OSM, licencia ODbL: exige atribución "© OpenStreetMap contributors", que va en el mapa y en la ayuda).

Diseño propuesto:

| Pieza | Qué | Tamaño aproximado | Cuándo se carga |
|---|---|---|---|
| Piso | Natural Earth 110m + retícula (esta ADR) | 0,2 MB | siempre, precacheado |
| Mundo | PMTiles del basemap global a zoom 0–6 (costas, países, ciudades grandes) | 10–30 MB | precache opcional ("Mapa detallado del mundo") |
| Zona | PMTiles de un recorte por cuenca/región a zoom 7–12 (puertos, fondeaderos, topónimos) | 20–150 MB según la zona | descarga explícita antes de zarpar: "Descargar Caribe" |

- La extracción de recortes se hace con `pmtiles extract` desde el basemap de Protomaps en un job de
  GitHub Actions y se publica en **GitHub Releases** (la rama `data` queda reservada al relay NHC).
- En la app, un panel "Mapas sin conexión" lista las zonas, con tamaño, y las guarda en **IndexedDB
  como un Blob por zona**.
- Estilo: un único estilo oscuro náutico propio sobre las capas de Protomaps (`water`, `landuse`,
  `places`, `boundaries`), coherente con el piso.
- Capas marítimas opcionales (más adelante): **OpenSeaMap** (balizas y luces, raster online, CC-BY-SA)
  y batimetría **GEBCO/EMODnet** (solo si se encuentra un recorte liviano). No son parte del
  compromiso de esta ADR.

Por qué PMTiles y no otra cosa: es el único formato que combina "archivo estático" (sin backend,
cumple ADR-002), "vectorial" (liviano y estilizable), "parcial" (se descarga solo lo que se mira o la
zona elegida) y soporte directo en MapLibre en Web y nativo. Las teselas raster online (OSM, Stamen)
son más simples pero no se pueden precachear por zona de forma razonable y tienen términos de uso que
prohíben el *bulk download*.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Seguir con `demotiles` | Online-only; apariencia pobre; no controlamos la caché |
| Teselas OSM/raster cacheadas por el SW | Volumen impredecible, términos de uso de los proveedores, no se puede precachear el mundo |
| PMTiles desde el día uno | Es el camino de la fase 2; primero hace falta el piso offline y el panel de descargas por zona |
