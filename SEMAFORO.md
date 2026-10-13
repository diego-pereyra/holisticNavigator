ADELANTE

TAREA ÚNICA: W4.2-GPS — que la app use el GPS al abrir, y botón ◉ para centrar.

Archivos: web/src/ui/app.ts, web/public/app.css. Nada más.

1. En mountApp, después de wireGps(ui), agregá:
     navigator.permissions?.query({ name: "geolocation" as PermissionName })
       .then((p) => { if (p.state === "granted") wireGpsStart(); })
       .catch(() => undefined);
2. En positionLabel: si no hay posición y el estado es "off", devolvé "Usar GPS".
   En el click del chip de posición (hn-ctx-pos): si no hay posición y el estado es "off",
   llamá wireGpsStart() en vez de abrir el diálogo de coordenadas. Si hay posición o el GPS
   está denegado, abrí un menú simple (div class="hn-menu") con 3 botones:
   "Usar GPS" → wireGpsStart();  "Escribir coordenadas" → openManualPosition(ui);
   "Apagar" → ui.position.set(null), ui.gpsStatus.set("off") y parar el watch.
3. Botón flotante: en mountApp creá <button class="hn-fab" aria-label="Centrar">◉</button>,
   agregalo a root, abajo a la derecha, 56×56 px, por encima de la hoja (CSS en app.css:
   position: fixed; right: 16px; bottom: calc(var(--hn-sheet-h, 96px) + 16px); z-index 30).
   Click: si no hay posición → wireGpsStart(); si hay → ui.map.flyTo({ center: [lon, lat],
   zoom: Math.max(ui.map.getZoom(), 6) }).
4. Probá: npm test en web/, bash scripts/build-web.sh. Commit "W4.2-GPS: GPS al abrir, chip
   Usar GPS, menú de posición y botón ◉". git push origin main.

Cuando termines: PARÁ. No hagas nada más. Claude escribe la siguiente tarea acá.
