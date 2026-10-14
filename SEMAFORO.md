ADELANTE

TAREA ÚNICA: E10.3 — balizas, boyas y luces sin red, por zona.


Las teselas de Protomaps no incluyen `seamark:*`. Por cada zona de `zones.json`, el job de teselas
descarga de Overpass (`https://overpass-api.de/api/interpreter`) los nodos con `seamark:type` en
`buoy_lateral, buoy_cardinal, buoy_safe_water, buoy_special, buoy_isolated_danger, beacon_lateral,
beacon_cardinal, beacon_special, light_major, light_minor, lighthouse, harbour, mooring` dentro del
bbox, y publica `zones/<id>-seamarks.geojson` (propiedades: `type`, `name`, `colour`, `shape`,
`light` = carácter si existe). Tamaño típico: 100–500 KB. La app lo descarga junto con la zona y lo
dibuja desde zoom 11 con `SymbolLayer`: texto del símbolo por tipo (● lateral con color
rojo/verde, ◆ cardinal amarillo/negro, ✦ luz, ⚓ puerto/amarre), nombre desde zoom 13, y el
carácter de la luz al tocar. Con red, además, capa raster OpenSeaMap `seamarks` (apagada por
defecto, interruptor "Balizas OSM online"). Commit `E10.3: balizas sin red por zona`.

Pasos concretos:
1. tiles.yml: por cada zona con bbox, consulta Overpass QL (POST, timeout 180 s, reintento ×3):
   [out:json][timeout:180];
   node["seamark:type"~"^(buoy_lateral|buoy_cardinal|buoy_safe_water|buoy_special|buoy_isolated_danger|beacon_lateral|beacon_cardinal|beacon_special|light_major|light_minor|lighthouse|harbour|mooring)$"](S,W,N,E);
   out body;
   Convertir a GeoJSON de puntos con propiedades type (sin el prefijo seamark:), name,
   colour (seamark:*:colour), shape, light (seamark:light:character + :colour + :period si existen).
   Publicar zones/<id>-seamarks.geojson en la release y copiarlo al sitio en deploy-pages.yml.
2. tiles.json: por zona, agregar "seamarks": { "url", "bytes" }.
3. App: downloadZone descarga también el geojson de balizas y lo guarda como string en
   hn.tiles.<id>.seamarks; al arrancar, por cada zona descargada, fuente geojson seamarks-<id> y capas:
   - seamarks-<id>-sym: symbol, minzoom 11, text-field por type: lateral "●", cardinal "◆",
     safe_water "○", isolated_danger "◉", special "▲", light_* y lighthouse "✦", harbour "⚓",
     mooring "⊙"; text-color por colour (red → #FF5252, green → #69F0AE, yellow → #FFD740,
     black/white → #E0E0E0, resto #B0BEC5); text-size 16; halo #0b1626.
   - seamarks-<id>-name: symbol, minzoom 13, name, 11 px, offset abajo.
   - Tocar una baliza: pequeño popup (MapLibre Popup) con type, name y light.
4. Con red: capa raster "seamarks-online" https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png,
   minzoom 9, apagada por defecto, interruptor "Balizas OSM online" en el panel Sin conexión;
   atribución "© OpenSeaMap (CC BY-SA)". Nunca precacheada.
5. Prueba: descargar Río de la Plata, modo avión, zoom 13 sobre el puerto de Montevideo →
   boyas y luces del canal con sus colores; tocar una → su característica.
6. npm test, build-web.sh, commit "E10.3: balizas sin red por zona", push, PARÁ.
