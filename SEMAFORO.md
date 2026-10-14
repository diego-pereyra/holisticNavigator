ADELANTE

TAREA ÚNICA: E10.0 — batimetría en el piso del mapa (relieve del océano sin red).

Archivos: tools/build_basemap.py, web/src/main.ts, scripts/sync-catalog.sh (si copia basemap),
web/public/service-worker.js solo si el precache no se genera solo. Nada más.

1. tools/build_basemap.py: descargar de https://naciscdn.org/naturalearth/10m/physical/
   los zips ne_10m_bathymetry_K_200.zip, ne_10m_bathymetry_J_1000.zip, ne_10m_bathymetry_I_2000.zip,
   ne_10m_bathymetry_H_3000.zip, ne_10m_bathymetry_G_4000.zip, ne_10m_bathymetry_F_5000.zip
   (shapefiles, dominio público). Leerlos con el mismo lector stdlib que ya usás para países
   (si el lector es solo GeoJSON, descargar en su lugar los GeoJSON equivalentes desde
   https://github.com/nvkelso/natural-earth-vector/raw/master/geojson/ne_10m_bathymetry_K_200.geojson
   etc.). Fusionar en web/public/basemap/bathy.geojson con una sola propiedad `depth` (200, 1000,
   2000, 3000, 4000, 5000). Simplificar: redondear coordenadas a 2 decimales y eliminar puntos
   consecutivos repetidos; quitar polígonos con menos de 4 puntos. Límite duro: 2 MB brutos; si se
   supera, redondear a 1 decimal.
2. main.ts, estilo base: fuente "bathy" y capa "bathy-fill" (type fill) entre "background" y
   "country-fill", con fill-color por depth: 200 → #13223a, 1000 → #0f1d33, 2000 → #0c182b,
   3000 → #0a1425, 4000 → #081120, 5000 → #060d1a. Sin contorno. El fondo "background" pasa a
   #15263f (aguas someras, más claro que 200 m) para que la plataforma continental se lea.
3. bathy.geojson entra al precache del SW (manifiesto automático de build-web.sh).
4. Prueba: sin red, a zoom 2 se ven plataformas continentales claras y fosas oscuras; el archivo
   pesa ≤ 2 MB; el presupuesto de primera carga no cambia (la batimetría se carga con el estilo,
   medir y anotar el gzip en el commit).
5. npm test, build-web.sh, commit "E10.0: batimetría en el piso del mapa", push, PARÁ.
