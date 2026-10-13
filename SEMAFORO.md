ADELANTE

TAREA ÚNICA: W4.6 — móvil usable: sin tela de araña y con la hoja que se arrastra.

Archivos: web/src/ui/app.ts, web/public/app.css. Nada más.

A. Rutas en el mapa (decisión cerrada: nunca todas)
1. En installMapLayers, catalog-lines arranca con filter ["==", ["get","variant"], ""] (vacío).
2. Nueva función applyCatalogFilter(ui):
   - zoom = ui.map.getZoom(). Si zoom < 3 → setFilter("catalog-lines", ["==", ["get","variant"], ""]) y return.
   - center = ui.map.getCenter(). region = la cuenca de basins.json cuya caja contiene center
     (si ninguna, la de ui.region() si hay chip; si no, ninguna → filtro vacío).
   - codes = filterEntries(ui.index, { query: ui.query(), region: ui.region() || region })
     .map(e => e.code).
   - ids = por cada code, la PRIMERA variante de ui.variants con ese code (una línea por ruta).
   - setFilter("catalog-lines", ["in", ["get","variant"], ["literal", ids]]).
3. Llamar applyCatalogFilter: al montar, en ui.map.on("moveend") con debounce de 300 ms,
   y cada vez que cambian query, region o nearMe.
4. Etiquetas de cuenca a zoom < 3: source "basins" (puntos en el centro de cada caja de
   basins.json, propiedad name) + SymbolLayer "basin-label" (text-field name, 12 px,
   color #4FC3F7, halo #0b1626, maxzoom 3). Click en basin-label → ui.region.set(name),
   goTo(ui, "rutas").
5. La ruta seleccionada se sigue dibujando en route-lines (todas sus variantes) y route-active.

B. Hoja arrastrable y lista scrolleable
6. En renderSheet, sobre .hn-handle: pointerdown/pointermove/pointerup (setPointerCapture).
   Al soltar: desplazamiento > 24 px hacia arriba → estado siguiente (peek→half→full);
   hacia abajo → anterior; menor → sin cambio. CSS .hn-handle { touch-action: none; }
   y área de arrastre de 44 px de alto.
7. CSS: .hn-sheet { touch-action: pan-y; } .hn-sheet-body { overflow-y: auto;
   -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
   #hn-loading.done { display: none; } (además de opacity 0).
8. goTo(ui, "rutas") y openRoute ponen la hoja en "half" como mínimo (si está en peek).

9. npm test (web/), bash scripts/build-web.sh. Commit "W4.6: rutas por cuenca visible, etiquetas
   de cuenca, hoja arrastrable". git push origin main. PARÁ.

Cuando termines: PARÁ. Claude escribe la siguiente tarea acá.
