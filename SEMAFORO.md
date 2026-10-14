ADELANTE

TAREA ÚNICA: UX-2 — la posición manual no la pisa el GPS.


Diego (2026-10-14): fijás la posición a mano y enseguida vuelve a GPS. Causa: el watch del GPS sigue
corriendo y cada fix pisa `ui.position`.

Archivos: `web/src/ui/app.ts`, `web/src/platform/position.ts`. Commit `UX-2: la posición manual manda hasta que elijas GPS`.

1. `watchGps` devuelve la función de parada; guardarla en `ui.gpsStop`. "Fijar en el mapa" y
   "Escribir coordenadas" llaman `ui.gpsStop?.()`, ponen `gpsStatus = "off"` y `position.source = "manual"`.
2. Mientras `position.source === "manual"`, ningún fix de GPS se aplica (guardia en el callback).
3. Al abrir la app: si hay posición manual persistida, se restaura y **no** se arranca el GPS
   aunque el permiso esté concedido; el chip dice "manual" y el menú ofrece "Usar GPS".
4. "Usar GPS" vuelve a arrancar el watch y el primer fix reemplaza la manual.
5. Prueba: escribir 15N 60W con GPS activo → la posición queda en 15N 60W y el chip dice "manual";
   recargar → sigue manual; "Usar GPS" → vuelve a la real.

6. npm test, build-web.sh, commit, push, PARÁ.
