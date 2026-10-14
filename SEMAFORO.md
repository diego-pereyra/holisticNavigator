ADELANTE

TAREA ÚNICA: W4.4 — lista de rutas informativa y dos columnas en escritorio.


Diego: la hoja desde abajo no molesta, pero "el panel de la izquierda era más práctico en la
información que traía". Lo que el panel viejo mostraba y el nuevo perdió:

1. **El título del libro en cada fila.** La fila nueva dice `AN12 · Falmouth → Newport`; la vieja
   decía `AN12 / Europe to North America (southern routes) / Atlántico Norte`. El título dice de
   qué trata la ruta; origen→destino no. Fila nueva, tres líneas:
   `AN12 · Europe to North America (southern routes)` (negrita) ·
   `Falmouth → Newport · 3011–3309 nm · 3 variantes` ·
   insignia de mes a la derecha. Región solo si el filtro es "Todas".
2. **Contador** `133 de 400 rutas · Atlántico Norte` arriba de la lista, como antes.
3. **Lista y ficha a la vez en escritorio, en dos columnas.** Diego: "en la compu es aberrante lo
   que tenés que scrollear". En ≥ 1100 px: columna 1 = lista (320 px: tabs, búsqueda, chips,
   contador, lista con scroll propio); columna 2 = ficha (440 px, `class="hn-col-ficha"`, solo
   cuando hay ruta seleccionada, con scroll propio); el mapa ocupa el resto. Entre 700 y 1100 px:
   una columna de 400 px con lista arriba y ficha abajo al 50 % cada una, scroll propio en cada
   mitad. La lista nunca desaparece al elegir. En móvil se mantiene la hoja con `‹ Rutas`.
   *Criterio:* es el patrón establecido de las apps de mapas (Google Maps en escritorio: lista a la
   izquierda, detalle al lado, mapa siempre visible; en móvil, hoja inferior que se despliega) y el
   de savvy navvy (panel de información de ruta lateral en tablet/escritorio, hoja en teléfono).
   No inventar otro.
4. **Variantes como chips** `Todas · A · B · C` encima de la lista cuando hay ruta seleccionada
   (como el panel viejo), además de las filas de variantes dentro de la ficha. Las dos cosas mueven
   `selectedVariant`.
5. **Importar** vuelve a ser visible sin scroll: fila fija bajo la búsqueda, texto
   `+ Importar GPX / KML / CSV`.

`hn-count`, `hn-ficha-dock`, `hn-variant-chips`.

Aclaraciones:
- Archivos: web/src/ui/app.ts, web/public/app.css. Nada más.
- Las dos columnas de escritorio van con @media (min-width: 1100px); entre 700 y 1100 px, lista arriba y ficha abajo al 50 %.
- Al terminar: npm test, build-web.sh, commit "W4.4: lista informativa y dos columnas en escritorio", push, PARÁ.
