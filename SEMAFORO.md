ADELANTE

TAREA ÚNICA: UX-N.1 — El mapa es la interfaz primaria: long-press → pin 📍 + hoja de acciones.
(Parte del rediseño de usabilidad — docs/07-rediseño-usabilidad.md, decisión D1. La meta de la
serie es 9/10 en celu vertical y tablet apaisada.)

Hoy el mapa no distingue toque de presión larga (cero handlers): "acciones sobre este punto"
no tiene camino — el clima exige seguir una ruta (8-10 pasos), la posición exige el menú del
chip, el waypoint exige la ficha. D1 lo cambia: mantener pulsado el mar pide acciones sobre
ese punto.

Archivos: web/src/main.ts (handler contextmenu/pointerhold), web/src/ui/app.ts (hoja y
acciones), web/public/app.css. Sin cambios en core ni en el worker.

1. **Long-press en el mapa:** mantener pulsado ~500 ms (móvil/táctil) o click derecho
   (escritorio) pone un pin 📍 en ese punto y abre la hoja `hn-point-actions` (patrón banda:
   abajo, sin modal del navegador). Un toque corto sigue haciendo TODO lo de hoy (rutas,
   cuencas, waypoints, fijar posición armada): cero regresión de los clicks existentes.
2. **La hoja — 4 acciones en N.1:**
   - **Clima acá:** panel con el clima del punto: pilot chart del mes de planificación
     (getCell de clim.ts) y, si hay paquete de pronóstico que cubra el punto, los datos de
     esa hora. (La descarga de una caja por punto llega en UX-N.2; acá solo mostrar.)
   - **Optimizar desde acá:** el pin es el origen; el próximo toque del mapa es el destino;
     corre el mismo motor (worker, modos Confort/Crucero/Regata, routing.e2e.test.ts verde)
     con anclas [pin, destino]. El resultado es la vista de E12.5 (isócronas + comparación,
     línea punteada): "Aplicar" crea una ruta propia nueva en Mis rutas; el catálogo jamás
     se toca y nada se guarda solo.
   - **Fijar posición acá:** posición manual en el pin (reusa UX-2: no pisa el GPS).
   - **Waypoint acá:** si hay edición de ruta armada, agrega el punto ahí; si no, arranca
     "+ Nueva ruta" en Mis rutas con ese primer punto.
   (Medir desde acá se agrega en UX-N.5 cuando exista la herramienta.)
3. **El pin es descartable:** toque fuera, Esc o ✕ lo quita; el panel de clima se cierra como
   las bandas.
4. **Aceptación medible:** el paso "long-press abre acciones" del UAT pasa de hallazgo a
   verde; J1 "¿qué viento hay acá?" queda en ≤ 3 toques (hoy ~8 + alarma falsa); el smoke de
   CI sigue verde (un toque corto en el mar no abre nada).
5. Tests (node:test): coordenadas del pin y destino de cada acción; la hoja muestra las 4;
   ningún cambio en el catálogo; el toque corto no dispara la hoja.
6. npm test (en web/), bash scripts/build-web.sh, commit "UX-N.1: long-press, pin y hoja de
   acciones", push, PARÁ.
