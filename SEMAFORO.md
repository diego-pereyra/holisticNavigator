ADELANTE

TAREA ÚNICA: E13.3 — Usabilidad del clima: selector de capas, contraste e isobaras con hPa
(prioridad MVP; pedido de Diego 2026-10-16: no se distinguen las capas, el color tapa el mapa
y las isobaras sin número no dicen nada).

Archivos: web/src/ui/weather.ts, web/src/ui/app.ts, web/public/app.css.

1. Selector de capas: al activar "Tiempo" (Pilot chart o Pronóstico), mini-panel con un
   interruptor por capa: Viento (wx-field + wx-arrows) · Corrientes (wx-current) ·
   Olas (wx-waves) · Isobaras (wx-isobars) · Ciclones (wx-cyclone) · Hielo (wx-ice).
   Persistido en hn.settings.wxLayers. Por defecto: Viento y Corrientes activos, el resto
   apagado. Apagar "Tiempo" sigue quitando todo.
2. Contraste que no rompe el mapa: wx-field fill-opacity 0,35 (tinte, nunca sólido); flechas
   de viento con círculo y trazo del MISMO color (rampa 0–5–10–15–20–30–40+ kn); corrientes
   finas, discontinuas, siempre azules. Con todo activado se siguen leyendo costa, retícula,
   rutas y posición; si algo tapa, se baja la opacidad, no se sube.
3. Isobaras con su valor: cada línea de wx-isobars lleva el número en hPa (SymbolLayer, 10 px,
   con halo; p. ej. "1012"). Sin el número, la isobara no entra.
4. Leyenda según lo activo: muestra solo las capas encendidas; en Pronóstico incluye la escala
   de hPa; en Pilot chart la rampa de nudos y "flechas tenues = viento variable".
5. Prueba en browser: solo Viento → ninguna otra capa visible; activar Isobaras → líneas con
   su hPa legibles a zoom 3; todo activado → ruta activa, posición y MOB siguen visibles
   (orden de "Nombres fijos" de docs/04-backlog-ux.md).
6. npm test (en web/), bash scripts/build-web.sh, commit "E13.3: selector de capas de clima,
   contraste e isobaras con hPa", push, PARÁ.
