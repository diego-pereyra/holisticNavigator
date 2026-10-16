ADELANTE

TAREA ÚNICA: E12.1 — Máscara de tierra 0,1° (base del motor de enrutado).

Especificación: docs/adr/008-weather-routing.md §Decisión (componente 1: máscara de tierra)
y §Plan (T12.1). Prerrequisito de T12.2, T12.5 y T12.6; no toca UI.

Archivos: tools/build_landmask.py (nuevo), web/src/core/routing/landmask.ts (nuevo),
web/src/core/routing/landmask.test.ts (nuevo), scripts/sync-catalog.sh (publica land.bits),
scripts/build-web.sh (precache).

1. tools/build_landmask.py: genera basemap/land.bits — rejilla de bits de 0,1°
   (3 600 × 1 800 bits ≈ 810 KB), origen (-180, -90), filas de sur a norte, 1 = tierra.
   Fuente: Natural Earth 10m land (o GSHHG intermedio si 10m no sirve; anotar cuál en el
   commit). Sin dependencias nuevas (stdlib + numpy, como el resto de tools/); descarga con
   caché como build_basemap.py.
2. core/routing/landmask.ts: `loadLandmask(): Promise<Landmask>` (fetch de
   basemap/land.bits + decodificación a un array tipado en memoria),
   `isLand(lat, lon): boolean` en O(1), `isLandWithMargin(lat, lon, nm)` con el margen
   costero dilatando k = ceil(nm / 6) celdas (mínimo 1).
3. land.bits entra al precache del SW (PRECACHE_URLS) y queda fuera del presupuesto de
   primera carga (como tiles/).
4. Tests (node:test): Panamá (9,5 N, 79,6 W) y Gibraltar (36 N, 5 W) son tierra;
   (15 N, 60 W) es mar; margen 3 nm sobre la costa de Portugal marca tierra a 2 nm de la
   costa y mar a 5 nm; 1 000 000 de consultas tardan < 50 ms.
5. Verificación contra landcheck.py: concordancia ≥ 99 % en los tramos del catálogo; el
   script imprime el porcentaje (no corta el build, solo lo reporta).
6. npm test (en web/), bash scripts/build-web.sh, commit "E12.1: máscara de tierra 0,1°",
   push, PARÁ.
