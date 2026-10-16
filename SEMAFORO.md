ADELANTE

TAREA ÚNICA: E13.4 — Fix regresión de E13.3: en Pronóstico no hay viento ni corrientes, y
las isobaras se ven rotas (reporte de Diego 2026-10-16).

Diagnóstico ya hecho (no buscar más):
- web/src/ui/weather.ts:531-533 — updateForecastWeather borra wx-field, wx-arrows,
  wx-arrows-dot y wx-current y nunca los llena: en modo Pronóstico el viento y las
  corrientes no existen, aunque el paquete tiene wind_speed, wind_direction,
  current_velocity y current_direction.
- web/src/ui/weather.ts:412-460 — marchIsobars emite segmentos sueltos de 2 puntos por
  celda: las isobaras se ven como rayitas cortadas; el caso de 3 cruces (silla) descarta
  el tercer punto; la etiqueta cae en el medio de un segmento cada 6 celdas, al azar.

Archivos: web/src/ui/weather.ts, web/src/ui/weather.test.ts (app.ts solo si hace falta).

1. Viento y corrientes en Pronóstico (updateForecastWeather):
   a. Dentro del horizonte: llenar wx-field (una caja por celda del paquete con {ws} de
      wind_speed), wx-arrows + wx-arrows-dot (flecha desde el centro de la celda, largo ∝
      wind_speed, props {ws, st: 100} — sin st el rampa de opacidad da 0,15 y las flechas
      quedan invisibles) y wx-current (de current_velocity + current_direction, props
      {mag}; el minzoom 3 se mantiene).
   b. Fuera del horizonte: viento y corriente desde la climatología del mes — extraer el
      llenado de updateWeather a un helper compartido en vez de duplicar el bucle.
   c. La dirección del API es de dónde VIENE el viento: la flecha apunta hacia donde VA
      (dir + 180), como ya hace waveArrows.
2. Isobaras cosidas (marchIsobars):
   a. Coser los segmentos por nivel en polilíneas contiguas (unir extremos compartidos con
      tolerancia 1e-4) y emitir UN LineString por tramo continuo, no un segmento por celda.
   b. Resolver el caso de 3 cruces (silla): decidir la conexión con la regla del punto
      medio (promedio de la celda comparado con el nivel).
   c. UNA etiqueta por polilínea con el valor en hPa (p. ej. "1012") en el punto medio del
      tramo más largo; sin números sueltos flotando entre rayitas.
3. Al terminar initWeatherLayers, aplicar applyWxLayers con el estado persistido (hoy el
   effect de arranque puede correr antes de que existan las capas y los interruptores no
   aplican hasta el primer cambio).
4. Tests (node:test): una grilla de presión sintética con un máximo y un mínimo produce
   polilíneas contiguas (ninguna de 2 puntos) con su etiqueta y su valor; las flechas de
   viento del pronóstico salen de speed+direction con la dirección invertida.
5. Prueba en browser: Pronóstico con paquete → viento (tinte + flechas), corrientes
   (zoom ≥ 3), olas e isobaras continuas con su hPa; Pilot chart sigue igual (viento y
   corrientes visibles por defecto); ninguna capa tapa rutas ni posición.
6. npm test (en web/), bash scripts/build-web.sh, commit "E13.4: viento y corrientes en
   Pronóstico + isobaras cosidas", push, PARÁ.

E12.1 (máscara de tierra) vuelve a la cola: es la siguiente cuando esto esté verde.
