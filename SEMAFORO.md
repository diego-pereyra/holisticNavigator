ADELANTE

TAREA ÚNICA: W4.3 — mapa legible: países, fronteras y ciudades en la carta base.


Diego vio la app nueva: "el mapa muestra todas las rutas y es un lío" y "me gusta la división por
países, si no no sé en qué costa estoy". Un solo commit `W4.3 Mapa legible` después de W4.2:

**A. Carta base con países y ciudades** (`tools/build_basemap.py`, `main.ts`, precache)
- Reemplazar `land.geojson` por `countries.geojson` = Natural Earth 110m `admin_0_countries`,
  coordenadas a 2 decimales, solo propiedades `name` y `mapcolor7` (objetivo ≤ 100 KB gzip).
- Capas, de abajo arriba: `country-fill` (relleno por `mapcolor7` con 7 tonos apagados sobre el
  oscuro: `#1c2733 #202c3a #1a2a31 #22293a #1e2f3a #242a33 #1b2d38`), `country-line` (`#3a4a5a`,
  0,6 px), `coast-line` igual que hoy, `country-label` (símbolo con `name`, 11 px, `#6b7f96`, halo
  `#0b1626`, visible desde zoom 2, sin solapes).
- `cities.geojson` = Natural Earth 110m `populated_places` (≈ 240 puntos, `name`, `pop_max`): capas
  `city-dot` (2 px `#9FB0C0`) y `city-label` (10 px) visibles desde zoom 3; desde zoom 5 todas.
- La retícula y sus etiquetas se mantienen. Tema oscuro se mantiene (el tema Día llega con T11.5).

**B. Rutas: nunca las 2 268 a la vez** (`ui/app.ts`)
- Zoom < 3 (mundo): **ninguna ruta**. En su lugar, `basin-label`: las 13 cuencas con su nombre en
  el centro de su caja (`basins.json`), 12 px `#4FC3F7` α0,7; tocar una cuenca = chip de cuenca.
- Zoom ≥ 3: se dibujan solo las rutas de la **cuenca bajo el centro del mapa** (o del filtro
  activo: chip, búsqueda, "cerca de mí"), y **una línea por ruta** (la variante A) en
  `catalog-lines` α0,35, 1 px. Cambiar de cuenca al mover el mapa actualiza el filtro de la capa
  (expresión `in`), con un retardo de 300 ms tras `moveend`.
- Ruta seleccionada: todas sus variantes en `route-lines` α0,6; la elegida en `route-active`.
- Búsqueda con texto: solo las coincidencias, en cualquier zoom.
- Aquí → "Rutas que te pasan cerca": esas rutas se dibujan también en `route-lines` mientras la
  pestaña Aquí está visible.
- Prueba: a zoom mundial no hay líneas y se leen las 13 cuencas; con el centro sobre el Atlántico
  Norte a zoom 4 hay ≤ 133 líneas (una por ruta AN), ninguna de otra cuenca.

`country-label`, `city-dot`, `city-label`, `basin-label`, `moveend`, `countries.geojson`,
`cities.geojson`.

Aclaraciones:
- La parte B (rutas por cuenca) ya está hecha en W4.6: no la rehagas. Solo la parte A.
- Fuentes: descargar en tools/build_basemap.py desde https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip y ne_110m_populated_places_simple.zip (dominio público); convertir con shapely/json, sin dependencias nuevas en web/.
- Si el geojson de países supera 100 KB gzip, redondear a 2 decimales y quitar propiedades hasta cumplir; no bajar de 110m.
- Al terminar: npm test, build-web.sh, commit "W4.3: países, fronteras y ciudades en la carta base", push, PARÁ.
