ADELANTE

TAREA ÚNICA: E13.7 — Isobaras legibles + fix del label del optimizador (no refresca tras
bajar el pronóstico).

0. **FIX PREVIO (reporte de Diego 2026-10-27):** tras bajar el paquete, el botón sigue
   diciendo "Ruta del mes" — hay que switchear a Regata y volver a Crucero para que se
   actualice. Causa exacta: `optRender` (web/src/ui/app.ts:3855) calcula
   `hasPkg = !!ui.forecast()` al renderizar y `optRefreshPanel` solo se llama desde los chips
   de modo, desde "Descartar" y desde "Aplicar" — nunca cuando `ui.forecast()` cambia.
   Fix: en `optMount` (app.ts:3979) suscribir un efecto a `ui.forecast()` que llame a
   `optRefreshPanel(ui)` (el estado del job vive en `optJobs`, no se pierde al re-renderizar;
   los chips leen `ui.settings.routingMode`, tampoco). También actualizar la línea
   "Pronóstico de {dueño} · edad". Commit: "fix: label del optimizador se refresca al bajar
   el paquete".

1. **Una etiqueta por NIVEL, no por fragmento:** de todas las polilíneas del mismo hPa,
   etiquetar solo la de mayor arco (en grados); en líneas muy largas (≥ 15° de arco) puede
   ir una segunda etiqueta a mitad del segundo tramo. Polilíneas de < 1° de arco no se
   etiquetan jamás.
2. **Fusionar fragmentos del mismo nivel:** polilíneas del mismo hPa cuyos extremos quedan
   a menos de media celda se unen (respetando la dirección de cada una); las que quedan
   con < 0,5° de arco o menos de 3 puntos se descartan. La cascada de ~46 vuelve a ser
   ~10 líneas limpias.
3. **Suavizado:** Chaikin de 2 pasadas preservando extremos y después Douglas-Peucker a
   0,01° para no engordar el GeoJSON. Función pura con tests: un zigzag entra y una curva
   sale; los extremos no se mueven; el conteo de vértices no explota.
4. **Estilo callado (acorde a las flechitas discretas de E13.6):** línea de 0,75 px, color
   #9FB0C0, opacidad 0,55; etiqueta de 9 px en #9FB0C0 con el halo de siempre. El color va
   a "Nombres fijos" (docs/04): "isobaras #9FB0C0".
5. Tests (con un paquete sintético de ~8 niveles, como el del arquitecto): máximo una
   etiqueta por nivel; ninguna polilínea de < 3 puntos en la salida; el quiebre máximo
   tras suavizar baja de 61° a < 30°; los extremos de cada polilínea suavizada coinciden
   con el original.
6. Prueba en browser: tras bajar el paquete, el botón pasa solo a "Optimizar con el viento"
   (sin switchear modo); modo Pronóstico con paquete → pocas isobaras prolijas y curvas,
   cada una con su número en su lugar.
7. npm test (en web/), bash scripts/build-web.sh, push. Al terminar escribí "Status: DONE"
   como última línea.
