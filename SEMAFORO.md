ADELANTE

TAREA ÚNICA: E12.12 — La parte de pilot charts del trazado optimizado se pinta de rojo
punteada. (Diego: "la ruta usa el pronóstico hasta que se acaba y después salta a las
pilot charts — clarísimo, así está bien; pintá la línea de las pilot punteada de rojo".)

REGLA (no negociable): el comportamiento del motor NO se toca. El salto
pronóstico→pilot charts en el horizonte es correcto y querido. Nada de blend, nada de
suavizados, nada de cambios en windfield. Esta tarea es SOLO VISUAL.

Archivos: web/src/ui/app.ts (optDraw / fuente optroute / capa route-opt),
isochrones.test.ts (solo si el test necesita exponer algo del split), web/public/app.css
(solo si la leyenda del panel lo pide).

1. **El corte:** el primer waypoint del trazado optimizado con `etaMs` mayor que
   `forecastHorizon(pkg)` (windfield.ts:138) marca dónde empieza la parte de pilot
   charts. Con "Ruta del mes" (climateOnly) TODO el trazado es de pilots.
2. **La pintura:** los features de la fuente `optroute` se parten en ese punto y llevan
   la propiedad `clima: true | false`; el paint de la capa `route-opt` pasa `line-color`
   a `["case", ["get","clima"], "#FF1744", "#4FC3F7"]`:
   - azul `#4FC3F7` punteada `[3, 2]` → donde hay pronóstico real;
   - ROJO `#FF1744` punteada `[3, 2]` → donde rige la pilot chart (clima medio).
   Mismo dash en ambos (lo punteado distingue la propuesta de la ruta real); el COLOR
   distingue el dato: azul = viento real, rojo = clima medio. El `#FF1744` queda
   registrado en "Nombres fijos" (docs/04) con esta acepción: "trazado optimizado en
   clima medio (pilot charts)".
3. **La leyenda del panel de optimización**, junto al aviso de horizonte de E12.11:
   "— azul = pronóstico real · - - rojo = pilot charts (clima medio)".
4. Tests (node:test): con horizonte, los features se parten en el waypoint correcto
   (clima:false antes, clima:true después); climateOnly → un solo feature con
   clima:true; todo dentro del horizonte → todo clima:false.
5. Prueba de Diego: optimizás una travesía más larga que el paquete → azul hasta
   donde llega el pronóstico, rojo punteada desde ahí; "Ruta del mes" → todo rojo.
6. npm test (en web/), bash scripts/build-web.sh, commit "E12.12: pilots en rojo
   punteada", push. Al terminar escribí "Status: DONE" como última línea.

Status: DONE
