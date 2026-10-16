ADELANTE

TAREA ÚNICA: E13.1 — Paquetes de pronóstico en vivo (Open-Meteo + Marine API, IndexedDB, edad visible).

Especificación: docs/adr/009-pilot-charts-y-clima-descargable.md §4 y §8.

Archivos: web/src/core/forecast.ts (nuevo), web/src/core/forecast.test.ts (nuevo), web/src/platform/forecast.ts, web/src/ui/app.ts.

1. fetchForecast(bbox, stepHours=3, days=7) — Open-Meteo Forecast + Marine API, caja = ruta activa + 300 nm margen, rejilla 1° (0,5° si < 20°), tope 1500 puntos, llamadas ≤200 coords, barra de progreso.
2. Variables: wind_speed_10m, wind_direction_10m, wind_gusts_10m, pressure_msl + wave_height, wave_direction, wave_period, ocean_current_velocity, ocean_current_direction. 7 días a 3 h (56 pasos).
3. storeForecast(pkg) — IndexedDB hn.forecast.<id> con Int16Array escala 0,1. Un paquete actual por travesía.
4. getForecastAge(pkg) — edad visible siempre.
5. Empalme con climatología más allá del horizonte ("clima medio").
6. Tests: descarga simulada Canarias–Caribe, guardado/lectura IndexedDB, edad, empalme.
7. npm test, build-web.sh, commit "E13.1: paquete de pronóstico Open-Meteo + IndexedDB", push, PARÁ.