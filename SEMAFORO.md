ADELANTE

TAREA ÚNICA: E13.6 — Punta de flecha en viento y corrientes (el vector marca dirección y sentido).

Motivo (Diego, 2026-10-16): "las corrientes y el viento tienen que tener una punta de flecha
que marque el sentido; el vector tiene dirección pero no sentido". El círculo del extremo
(wx-arrows-dot) se lee como manecilla de reloj; las corrientes son rayitas sin sentido visible.

Archivos: web/src/ui/weather.ts, web/src/ui/weather.test.ts.

1. Punta triangular en cada flecha de viento: polígono de 3 vértices en el extremo del
   segmento (ápice en la punta, alas ≈ 35 % del largo hacia atrás, perpendiculares al
   vector). Capa nueva `wx-arrows-head` (fill) con la misma rampa de color por ws y
   opacidad ∝ st; `wx-arrows-dot` se elimina (la punta lo reemplaza).
2. Punta igual en las corrientes: capa nueva `wx-current-head` (fill, #2e9bff, opacidad
   0,95) en el extremo de cada segmento de corriente.
3. Ambos modos: las puntas se llenan junto con los trazos en updateWeather,
   updateForecastWeather y el helper de climatología (pilot chart y Pronóstico).
4. Las capas nuevas entran en WX_LAYER_IDS y WX_LAYER_TO_IDS (wind / current) y van debajo
   de rutas, posición y MOB (mismo apilado que las otras wx).
5. Tests: el triángulo sale del vector (u,v) con ápice en el extremo y alas atrás
   perpendiculares; en Pronóstico con st: 100.
6. Prueba en browser: alisios del Caribe con punta que marca el sentido; Corriente del Golfo
   azul con punta; nada de manecillas.
7. npm test (en web/), bash scripts/build-web.sh, commit "E13.6: puntas de flecha en viento
   y corrientes", push, PARÁ.

La siguiente será E12.3 (polar del barco: parser del formato tabulado + polar genérica).
