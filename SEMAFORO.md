ADELANTE

TAREA ÚNICA: E12.9 — Salida de puerto y llegada sin trucos: el enrutado arranca desde un ancla
tocada en el mapa. (Reporte de Diego tras E12.8: "sin corredor navegable cerca de (coords)
pero está en aguas abiertas". Reproducido y diagnosticado por el arquitecto con datos
reales — ver abajo.)

REPRODUCCIÓN YA HECHA Y COMITEADA (383552f): web/src/core/routing/routing.e2e.test.ts corre
sobre la máscara REAL (public/basemap/land.bits) y la climatología REAL (public/clim/m10.bin).
Hoy está EN ROJO — tu trabajo lo vuelve VERDE sin tocar los asserts.

Diagnóstico (evidencia del repro, no buscar más):
- **Ancla en celda de tierra + climatología → muerte al paso 0 con "sin datos de viento"**:
  getCell devuelve null en celdas de tierra (ws=255), climateWindField también, y el motor no
  arranca. La regla "el ancla es VERDAD" (E12.8) se aplicó al chequeo de tierra pero no al
  viento. Caso real: origen tocado en un puerto (28 N 16 W, Tenerife).
- **Con viento que nunca es null, la frontera se atasca igual**: 700 pasos y el nodo más
  cercano al destino solo avanzó 1 025 nm de 2 700. El reintento adaptativo de E12.8 inunda la
  frontera de micro-pasos (Δt 0,25 h ≈ 1,5 nm), que GANAN la poda por ETA (menor t) y la
  frontera avanza a paso de tortuga. De ahí el "sin corredor navegable" con posición en aguas
  abiertas: deathPos reporta el punto más cercano al destino de una frontera envenenada.
- **En aguas abiertas puras todo funciona** (18 pasos, reached) — el bug es específico del
  arranque/llegada en costa.

Archivos: web/src/core/routing/isochrones.ts, windfield.ts, isochrones.test.ts,
routing.e2e.test.ts (solo arreglar, no aflojar), climateWindField está en windfield.ts y
getCell en web/src/core/clim.ts.

1. **Anclas con viento garantizado:** si la consulta de viento cae en una celda sin viento
   (tierra en máscara/clim), el campo de viento NO la anula: devuelve el viento de la celda
   de agua más cercana (búsqueda en anillo, radio ~0,5°). Vale para climateWindField y para
   forecastWindField en los bordes de su caja. Un ancla es VERDAD y siempre tiene viento.
2. **Escape de puerto:** si el punto de partida (o el candidato de llegada) queda dentro de
   la zona bloqueada, caminata greedy por celdas de agua hasta agua despejada (dentro de la
   gracia de ~0,5°), sumando el tiempo al ETA; la frontera arranca desde el agua. La frontera
   NUNCA "lucha" contra la costa del puerto de salida.
3. **El reintento adaptativo no puede envenenar la poda:** los micro-pasos no compiten por
   menor t en la poda de sectores. A tu criterio: piso de reintento en 0,5 h y una sola
   reintentada por punto, o excluir los pasos de reintento de la poda normal (que compitan
   por progreso hacia el destino, no por ETA cruda). La frontera sana avanza a pasos reales.
4. **Los tests del repro pasan:** (a) aguas abiertas margen; (b) uniforme Canarias→Barbados
   reached en ≤ 400 pasos; (c) clim octubre Canarias→Barbados reached; (d) clim aguas
   abiertas reached; (e) uniforme agua→Barbados (celda de isla) reached; (f) ningún waypoint
   pisa tierra fuera de la gracia. Los unitarios de E12.6-E12.8 siguen verdes.
5. Prueba de Diego en el celu: la ruta que le falló + una salida de puerto real (Montevideo,
   Palma) + Noronha por el norte ⚓ — todas llegan, y si algo no llega, el motivo es de verdad.
6. npm test (en web/ — incluye routing.e2e.test.ts con datos reales), bash scripts/build-web.sh,
   commit "E12.9: salida de puerto y llegada sin trucos", push, PARÁ.

Nota de proceso (pedido de Diego, "ya van 2 fallidos"): desde acá, TODA tarea del enrutado
pasa por routing.e2e.test.ts en CI antes de publicarse — el repro rojo es el contrato.
