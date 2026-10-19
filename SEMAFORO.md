ADELANTE

TAREA ÚNICA: E12.10 — El trazado dice lo justo: waypoints solo donde el rumbo cambia.
(Diego con E12.8: "me encanta lo que hace pero 268 puntos es una sobredimensión; si no hay
variante de grados importante no debe poner un wp, o limpieza después de crear la ruta".)

Diagnóstico: el tope de waypoints se aplica POR TRAMO (~15) y con muchos ⚓ se multiplica;
la simplificación Douglas-Peucker es geométrica (tol 0,1° ≈ 6 nm), no náutica: una curva
suave deja un punto cada pocas millas aunque el rumbo no cambie significativamente.

Archivos: web/src/core/routing/isochrones.ts (+test), routing.e2e.test.ts (recuentos).

1. **Umbral náutico:** un waypoint de paso se emite solo si el cambio de rumbo ahí es
   ≥ `wpTurnDeg` (nuevo campo de IsoConfig, default 12°), o es una esquina de rodeo
   (cambio grande: cae sola en el umbral). El motor interno sigue con toda la resolución
   que necesite — esto es sobre la SALIDA, no sobre el cálculo.
2. **Siempre se emiten, sin importar el umbral:** anclas obligatorias (⚓), Bordos (viradas)
   y los puntos de llegada de cada tramo. Son la verdad del viaje.
3. **Limpieza post-creación:** tras concatenar los tramos, una pasada quita todo punto de
   paso cuyo rumbo combinado w[i-1]→w[i+1] difiera del par original en menos del umbral, y
   fusiona segmentos cortos (< 5 nm) que no cambien el rumbo. Anclas y Bordos jamás se tocan.
4. **Tope global:** los puntos de paso (ni anclas ni Bordos) quedan en ≤ 40 en total —
   prioridad: esquinas de rodeo primero, después por magnitud de cambio de rumbo. Si los
   Bordos y anclas llevan el total por encima, se respeta: es la realidad de la ceñida (el
   coste de virada ya limita cuántos puede haber).
5. **ETA por waypoint recalculada** sobre el conjunto reducido (la del punto crudo retenido
   más cercano); la comparación "vs original" no cambia.
6. **Tests:** (a) curva suave de 90° en 300 nm → ≤ 5 waypoints de paso, no uno cada pocas
   millas; (b) ceñida → TODOS los Bordos presentes; (c) rodeo de isla → la esquina queda;
   (d) muchos tramos → puntos de paso ≤ 40 globales; (e) routing.e2e.test.ts verde con los
   recuentos actualizados (Canarias→Barbados ≤ 15 waypoints totales).
7. Prueba de Diego: la ruta que dio 268 → ahora con las esquinas y los Bordos claros, tabla
   navegable sin scroll infinito.
8. npm test (en web/), bash scripts/build-web.sh, commit "E12.10: waypoints solo donde el
   rumbo cambia", push, PARÁ.
