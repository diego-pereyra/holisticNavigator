ADELANTE

TAREA ÚNICA: E13.2 — Pronóstico visible en el mapa (toggle Tiempo, deslizador de hora, wx-isobars, wx-waves).

Especificación: docs/adr/009-pilot-charts-y-clima-descargable.md §5, §6 y §8 (tabla E13.2).

Archivos: web/src/ui/weather.ts, web/src/ui/app.ts, web/public/app.css.

1. Toggle "Tiempo" en barra de contexto: 3 estados — Apagado / Pilot chart / Pronóstico. Al elegir Pronóstico, activa los datos de hn.forecast.<id> (E13.1) y pinta wx-isobars + wx-waves sobre el mapa.
2. Deslizador de hora bajo la barra cuando está en Pronóstico: mié 14 · 15:00 UTC, paso 3 h, botón "ahora". Moverlo repinta < 50 ms.
3. Capas wx en Pronóstico: wx-isobars (isobaras cada 4 hPa), wx-waves (altura y dirección de ola). Se repintan con setData al cambiar la hora.
4. Empalme con climatología: más allá del horizonte del paquete (7 días), las capas usan la climatología del mes y muestran leyenda "clima medio".
5. Leyenda: rampa de isobaras + escala de altura de ola + fuente (Open-Meteo CC BY 4.0).
6. Prueba: AN12 seleccionada, Pronóstico activado, mover el deslizador → el mapa se repinta con isobaras y olas; pasado el horizonte dice "clima medio".
7. npm test, build-web.sh, commit "E13.2: pronóstico visible en mapa", push, PARÁ.

Nota: el push de SEMAFORO.md falló por credenciales de GitHub. El commit local existe pero no está en origin. Cuando se resuelva el auth, pushear.