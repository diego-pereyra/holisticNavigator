ADELANTE

TAREA ÚNICA: E12.13b + E13.3 — primero las dos correcciones de la duración que quedaron
afuera de E12.13 (el número de 5 cifras que vio Diego SIGUE VIVO); después el pronóstico
robusto de 16 días. Dos partes, un commit cada una.

PARTE A — E12.13b: duración real y formato de días y horas. (Revisión del arquitecto sobre
f6ae590: las correcciones pedidas no entraron.)

Diagnóstico (verificado en el código):
- web/src/ui/app.ts:3911, 3913 y 5266 siguen pasando `etaMs / 3600_000` — el etaMs
  ABSOLUTO (fecha de llegada) — a duracionTexto(hours): muestra ~20.540 d (días desde
  1970). Es el número de 5 cifras de Diego.
- web/src/core/format.ts:64-70 sigue redondeando a media jornada ("≈ 20,5 días") — Diego
  pidió días y horas SEPARADOS.

1. **Duración, no fecha:** en las líneas del optimizador (3911, 3913, 5266 y su par del
   panel del pin), pasar la DURACIÓN en horas: `(etaMs - startMs) / 3600_000`. startMs
   sale del job (agregalo al lanzar el cálculo si no está).
2. **Formato único "días separados y horas" (regla de Diego):** formatDuration pasa al
   desglose de duracionTexto con el "≈" delante: "≈ 20 d 6 h" (minutos solo < 1 día:
   "≈ 6 h"; exacto: "≈ 20 d"). El optimizador sigue con duracionTexto sin "≈" ("21 d 6 h")
   — un solo desglose en toda la app.
3. Tests: formatDuration con 20,5 días → "≈ 20 d 12 h"; con 6 h → "≈ 6 h"; los renders
   reciben horas de duración (~536 h), nunca horas de epoch (~493.000 h).
4. npm test (en web/), bash scripts/build-web.sh, commit "E12.13b: duración real y
   formato d+h".

PARTE B — E13.3: pronóstico robusto y 16 días de horizonte real. (Reporte de Diego: "el
pronóstico me da error de conexión" + "¿otro servicio con más tiempo de predicción?".
Verificado por el arquitecto con curl: ambas APIs de Open-Meteo vivas, CORS correcto, y
ACEPTAN temporal_resolution=hourly_3 con forecast_days=16 → 128 pasos de 3 h, un tercio
del peso horario. Verificado en forecast Y en marine. No existe mejor servicio sin clave
ni backend: 16 días es el techo del viento operacional; más allá, pilot charts — línea
roja de E12.12 y aviso de E12.11.)

5. **16 días y 3-hourly:** FORECAST_DAYS = 16 y FORECAST_DAYS_MAX = 16; las dos URLs
   agregan temporal_resolution=hourly_3. El submuestreo cliente (idx += stepHours) queda
   como red de seguridad. El deslizador (128 pasos) queda lleno entero.
6. **Robustez (el error de Diego):** defaultJson con timeout propio (AbortController,
   30 s) y 2 reintentos por bloque (esperas de 1 s y 4 s); bloques de a 2 en paralelo.
   Un tirón lento de la red móvil ya no mata la descarga completa.
7. **Error honesto:** el mensaje dice qué falló ("viento" o "olas"), si fue red o HTTP
   (con código); "Reintentar" arranca limpio; el progreso por bloque se mantiene.
8. **Horizonte:** el aviso (E12.11) y el rojo (E12.12) se recalculan solos — la parte
   azul de un crossing corto cubre casi toda la travesía (16 d × 5,4 kn ≈ 2.000 nm).
9. Tests: URL builder con forecast_days=16 + temporal_resolution; el retry (fetch mock
   que falla 1 vez por bloque y sale a la segunda); el timeout (mock mudo → 2 reintentos
   → "sin conexión · viento"); el paquete decodifica 128 pasos.
10. npm test (en web/), bash scripts/build-web.sh, commit "E13.3: pronóstico de 16 días
    y robusto", push. Al terminar escribí "Status: DONE" como última línea de este
    archivo.

Prueba de Diego al final: en la red del celu que fallaba, bajar el pronóstico de una ruta
→ completo con progreso; deslizador con 16 días reales; "Optimizada: 21 d 6 h" (y NUNCA más
un número de 5 cifras); AN12 en octubre → duración estimada ≈ 22 d en la ficha con el
formato nuevo.
