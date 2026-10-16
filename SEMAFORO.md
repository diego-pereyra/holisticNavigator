ADELANTE

TAREA ÚNICA: E12.5 — Isócronas + "Optimizar con el viento" (vista sobre cualquier ruta; aplicar
solo en propias). La pieza final del enrutado: máscara ✓ + viento ✓ + polar ✓ → isócronas.

Reglas de Diego (2026-10-16): el botón optimizar NO es el que copia la ruta; tiene que poder
optimizar CUALQUIER ruta; editar vale para todas menos las del catálogo. Optimizar = calcular
y mostrar; guardar es acción aparte.

Especificación: docs/adr/008-weather-routing.md §Decisión (componentes 3–6) y §Plan (T12.5+T12.6
juntas).

Archivos: web/src/core/routing/isochrones.ts (nuevo), web/src/core/routing/isochrones.test.ts
(nuevo), web/src/core/routing/windfield.ts (nuevo), web/src/core/routing/isochrones.worker.ts
(nuevo), web/src/ui/app.ts, scripts/build-web.sh (bundle del worker), web/public/app.css.

1. **Optimizar = vista:** el botón "Optimizar con el viento" (o "Ruta del mes" sin paquete de
   pronóstico) funciona sobre CUALQUIER ruta seleccionada y muestra isócronas, trazado
   optimizado, comparación, ceñidas con bordos y ETA. No guarda nada por sí solo.
   - Ruta propia/importada/copia: botón "Aplicar optimización" reemplaza sus waypoints por el
     trazado óptimo (es tuya; recálculo de nm; deshacer con la banda de 8 s si existe).
   - Ruta del catálogo: sin "Aplicar"; el botón "Copiar ruta" (E11.5) ofrece copiar el trazado
     ORIGINAL o el OPTIMIZADO como ruta propia nueva.
2. **Motor de isócronas (puro, en core/routing/isochrones.ts):** routeOptimal(opts) — frontera
   por pasos Δt (1 h a menos de 2° de costa según la máscara, 3 h en océano), abanico ±110°
   respecto del rumbo directo con 48 rumbos, velocidad = polar(TWA, TWS) (E12.3), poda por
   sectores (un sobreviviente por sector angular desde el origen), coste de virada (5 min por
   bordo) y límite de bordos; restricciones: máscara de tierra E12.1 con margen (dilatación
   1 celda), TWS máx 40 kn, hielo (ice ≥ 15) excluido. Termina al alcanzar el destino;
   reconstrucción hacia atrás desde la llegada.
3. **Campo de viento (windfield.ts):** interfaz wind(lat, lon, t) → {dir, speed} con dos
   implementaciones: pronóstico del paquete E13.1 (interpolación bilineal en espacio, lineal
   en tiempo) dentro del horizonte, empalme con climatología del mes más allá ("clima medio");
   y climatología sola para "Ruta del mes".
4. **Web Worker:** isochrones.worker.ts corre routeOptimal con progreso por frontera y
   cancelación; el core queda puro para node:test. build-web.sh lo compila como bundle aparte
   (isochrones.worker.js, mismo patrón que main.js; al precache del SW).
5. **Resultado del cálculo:** polilínea óptima simplificada (tol 0,1°, tope ~40 waypoints; el
   primero y el último conservan los nombres del original), con ETA por waypoint, viento
   previsto por tramo y tramos de ceñida marcados con número de bordos. El trazado optimizado
   se dibuja como propuesta (línea punteada) hasta que se aplica o se copia.
6. **Capa wx-isochrones** (id de "Nombres fijos"): una línea por paso, #80CBC4 α0,45, 1 px,
   debajo de rutas y posición.
7. **Comparación siempre visible durante la vista:** "vs original: −12 h · +310 nm · viento
   máx 28 kn vs 34 kn" — el trazado original recorrido con el mismo viento y polar.
8. **Tests (node:test) del core:** viento uniforme de cola → una pata ~empopada; proa pura →
   ceñida en zigzag dentro del cono muerto con bordos ≥ 1; calma → motor, línea recta; tierra
   en el medio → rodeo con margen; Canarias → Barbados con viento sintético en < 5 s.
9. npm test (en web/), bash scripts/build-web.sh, commit "E12.5: isócronas + Optimizar con el
   viento (vista; aplicar solo en propias)", push, PARÁ.

Prueba de Diego en el celu: AN12 con pronóstico descargado → Optimizar → isócronas y
comparación sobre el mapa, el original intacto; Copiar ruta → elegir trazado optimizado →
queda en Mis rutas, editable, seguible y exportable.

La siguiente se decide con el reporte (candidatas: E7 avisos NHC o ajustes de la prueba).
