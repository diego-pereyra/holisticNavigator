ADELANTE

TAREA ÚNICA: UX-N.6 — Tablet apaisada de primera: dock persistente, mapa dominante, pulgar
cómodo. (docs/07-rediseño-usabilidad.md, §4 UX-N.6. El layout de escritorio existe
(≥1100 px, dos columnas — app.css:1454-1470): verificarlo, no reinventarlo.)

Archivos: web/public/app.css (principalmente), web/src/ui/app.ts (offsets de bandas/paneles).

1. **En ≥ 820 px de ancho (tablet apaisada):** panel de lista (320 px) + ficha en dock
   persistente a la derecha cuando hay selección — el mapa NUNCA queda tapado por la hoja;
   la ficha no desaparece al tocar el mapa. Reutilizar el layout ≥1100: el objetivo es que
   1180×820 se comporte como escritorio, no como celular grande.
2. **Targets de tablet:** ≥ 48 px para botones/filas en ≥ 820 px (44 en celular se mantiene);
   la barra de contexto y la tira crecen un escalón tipográfico (12/13 sp).
3. **Paneles flotantes:** el stack del clima (capas + leyenda + deslizador) se ordena en
   columna sobre el borde izquierdo del mapa sin tapar el panel; en tablet la leyenda puede
   ser horizontal.
4. **Offsets verificados:** banda de alarma, deshacer, fix-band, pin y hoja de acciones,
   MOB, FAB — todos respetan el dock de ficha (no quedan debajo ni se cortan).
5. Aceptación (UAT tablet-1180): la ficha abierta no tapa el mapa; Optimizar y Seguir a un
   toque del borde; cero "no se encontró" en tablet; capturas del UAT revisadas por Diego.
6. npm test (en web/), bash scripts/build-web.sh, commit "UX-N.6: tablet apaisada de
   primera", push. Al terminar escribí "Status:done" al final de este archivo.

Status: ready

Status:done
