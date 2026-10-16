ADELANTE

TAREA ÚNICA: E13.5 — El mapa nunca queda en azul pelado (piso sin techo de zoom) + corrientes
legibles. Regresión reportada por Diego 2026-10-16: "volvió a fallar el zoom".

Diagnóstico ya hecho (no buscar más):
- web/src/main.ts:162, 169 y 176 — country-fill, country-line y coast-line tienen
  maxzoom: 4: a partir de z5 el piso Natural Earth se apaga. La carta de detalle (minzoom 4)
  cubre el hueco solo cuando el PMTiles terminó de cargar su directorio; en red lenta u
  offline la pantalla queda en azul oscuro sin costa ni países. Con zona descargada se ve
  bien: exactamente "general ✓ · intermedio sin descarga ✗ · descargado ✓".
- web/src/ui/weather.ts:82-94 — WX_CURRENT_WIDTH interpola 0,5 → 1,6 → 2,6 px con dash
  [1.6, 2] y opacity 0,85: corrientes típicas de 0,5–2 kn quedan casi invisibles.

Archivos: web/src/main.ts, web/src/ui/weather.ts (app.css solo si hace falta).

1. Piso sin techo: quitar el maxzoom: 4 de country-fill, country-line y coast-line. Los
   rellenos y la costa siguen dibujados a cualquier zoom, por debajo de la carta de detalle:
   cuando el PMTiles carga, detail-water/detail-earth los tapan; mientras carga u offline se
   ve el piso tosco y no azul pelado. country-label, city-dot y city-label CONSERVAN su
   techo (las etiquetas de z≥4 las pone detail-place).
2. Corrientes gruesas: WX_CURRENT_WIDTH pasa a interpolar 1,8 → 3,4 → 4,2 px (mag 0 / 2 / 4),
   line-opacity 0,95 y dash [2.5, 1.5]. La misma capa sirve en pilot chart y Pronóstico.
3. Verificar que la nota de UX-3 ("Sin detalle a esta escala · descargá la zona") siga
   apareciendo a z > 6 sin zona descargada — ahora sobre el piso visible, no sobre vacío.
4. Prueba en browser (smoke de CI): z5 sin red y sin PMTiles cargado → costa y países del
   piso visibles; con el detalle cargado → el piso queda debajo sin pelear; corrientes del
   Caribe legibles a z3 sin acercar más.
5. npm test (en web/), bash scripts/build-web.sh, commit "E13.5: piso siempre visible +
   corrientes legibles", push, PARÁ.

E12.2 (rutas sin tocar tierra) vuelve a la cola: es la siguiente cuando esto esté verde.
