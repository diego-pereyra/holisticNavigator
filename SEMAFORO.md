ADELANTE

TAREA ÚNICA: E12.6 — Optimizador v2: modos de ponderación, waypoints obligatorios por punto,
y nada por arriba de islas. (Iteración sobre E12.5 con Diego, 2026-10-16.)

Reglas de Diego:
- Modos: Crucero evita la ceñida sin demorarse demasiado; Regata minimiza el ETA.
- Cada waypoint lleva un flag "obligatorio" (true/false) que se marca en el editor. El
  optimizador pasa solo por los obligatorios; los opcionales pueden caerse al aplicar
  (avisando cuántos); los obligatorios JAMÁS se borran.
- Si el destino está del otro lado de una isla, el trazado nunca pasa por arriba.
  (Verificado: la máscara SÍ tiene a Fernando de Noronha — el bug es que la frontera solo
  valida el punto de aterrizaje de cada salto.)

Archivos: web/src/core/routing/isochrones.ts, isochrones.test.ts, web/src/core/routing/landmask.ts,
web/src/core/routes-own.ts (+test), web/src/ui/app.ts, web/src/ui/routes-own.ts, web/public/app.css
(tools/build_landmask.py solo si el off-by-one lo exige).

1. **Modos de enrutado** (chips en la vista de optimización, persistidos en
   hn.settings.routingMode):
   - **Confort** (el más blando): casi sin ceñida (TWA < 70°: factor decreciente hasta ~0,55
     antes del cono muerto), viento suave (TWS > 18 kn penaliza; TWS máx 22), coste de
     virada 20 min — virar lo menos posible aunque el ETA se alargue.
   - **Crucero** (default): penalización de ceñida (TWA < 55°: hasta ~0,75), penalización de
     viento fuerte (TWS > 25 kn), coste de virada 10 min, TWS máx 30. Prefiere el rumbo
     abierto sin frenar el ETA de forma absurda.
   - **Regata:** polar cruda, coste de virada 3 min, TWS máx 45, ETA mínimo.
2. **Flag obligatorio por waypoint:** cada waypoint de ruta propia/copia/importada lleva
   `mandatory: boolean` (default true); el editor lo muestra por waypoint en la fila. Los
   del catálogo no tienen flag (al copiar, todos nacen obligatorios).
3. **Optimización tramo a tramo:** los waypoints obligatorios son extremos de tramo; cada
   tramo entre obligatorios consecutivos se optimiza como pasada de isócronas independiente
   y se concatena. Los opcionales no participan.
4. **"Aplicar":** conserva TODOS los obligatorios con sus nombres y agrega los puntos
   optimizados entre ellos (~15 por tramo, tol 0,1°). Los opcionales que el trazado optimizado
   ya no toca se descartan, y la banda de confirmación lo dice ("Aplicar · se descartan 2
   waypoints opcionales"). Nunca se borra un obligatorio.
5. **Camino verificado en cada salto:** el avance de la frontera recorre las celdas del
   segmento (paso ≤ 0,05°, supercover con margen) — imposible aterrizar del otro lado de una
   isla de 1 celda. Además revisar/corregir el off-by-one de coma flotante en los índices de
   la máscara (usar floor((lat+90)*10 + 0.5), no /0.1) en landmask.ts y en el generador si
   corresponde.
6. **Tests:** (a) destino detrás de una isla de 1 celda (fixture) → el trazado la rodea;
   (b) waypoint obligatorio intermedio → el trazado pasa por él; (c) opcional se descarta al
   aplicar y obligatorio jamás;    (d) mismo escenario: Confort es el trazado más abierto (menos ceñida, más millas),
   Crucero intermedio y Regata el de ETA mínimo; (e) índices de máscara sin off-by-one en
   los bordes exactos de celda (p. ej. -3.8 exacto).
7. Prueba de Diego en el celu: ruta a Fernando de Noronha con waypoint de aproximación al
   norte (obligatorio) → entra por el norte y no pisa la isla; con el waypoint opcional → el
   trazado decide solo; Crucero vs Regata sobre el mismo tramo dan trazados distintos.
8. npm test (en web/), bash scripts/build-web.sh, commit "E12.6: modos, waypoints
   obligatorios y rodeo de islas", push, PARÁ.
