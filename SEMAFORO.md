ADELANTE

TAREA ÚNICA: E13.7 — Ajuste de puntas: olas con punta y corrientes más chicas (prueba de
Diego en el celu tras E13.6).

Archivos: web/src/ui/weather.ts, web/src/ui/weather.test.ts.

1. Puntas en las olas del Pronóstico: capa nueva `wx-waves-head` con triángulo en el extremo
   de cada flecha de ola (`waveArrows`), color por la misma rampa de altura (`WX_WAVE_COLOR`
   sobre `h`). Las olas de climatología (más allá del horizonte) son cajas sin dirección: no
   llevan punta — no hay dirección guardada para marcar el sentido.
2. Puntas de corrientes más chicas: las alas del triángulo de `wx-current-head` pasan de
   ~35 % del largo del segmento a ~20 % (con tope absoluto en grados si hace falta): tiene
   que verse como una punta, no como un cometa.
3. Mismo patrón que E13.6: `headFeature` compartido, parametrizado por proporción; tests de
   las tres puntas (viento, corriente, olas).
4. Prueba en browser (smoke de CI + celu de Diego): flechas de ola con punta en Pronóstico;
   puntas de corriente visibles pero discretas.
5. npm test (en web/), bash scripts/build-web.sh, commit "E13.7: puntas en olas y puntas de
   corriente más chicas", push, PARÁ.

La siguiente será E12.5 (isócronas con Web Worker + "Optimizar con el viento").
