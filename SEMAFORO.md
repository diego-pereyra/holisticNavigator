ADELANTE

TAREA ÚNICA: E12.8 — El optimizador fino con la tierra: margen real, corredores y anclas de
confianza. (Reporte de Diego tras E12.7: "me dice bloqueado por tierra y todavía no llegué a
la isla; tiene que ser más fino con la tierra; sino no va a poder entrar por canales; si tengo
un punto obligatorio debe tomarse como correcto".)

Diagnóstico ya hecho (no buscar más):
- web/src/core/routing/landmask.ts:62-79 — isLandWithMargin con nm=3 usa una caja de
  k=ceil(3/6)=1 celda alrededor de cada muestra: bloquea hasta ~0,15-0,2° (~9-12 nm) alrededor
  de CADA celda de tierra. Un canal de menos de ~12 nm queda bloqueado de lado a lado: de ahí
  el "bloqueado por tierra" sin haber llegado a la isla.
- isochrones.ts (motivo mentiroso) — con reached:false, el motivo se diagnostica con la RECTA
  origen→destino (segmentClear(origin, dest)): como esa recta cruza la isla — que es justo lo
  que el enrutado evita — el motivo dice "bloqueado por tierra" SIEMPRE que hay obstáculo de
  por medio, aunque la frontera haya muerto a 100 nm por otra razón.
- La gracia de las anclas es ±0,1° (graceDeg = max(3,6)/60): insuficiente para puertos en
  bahías cóncavas y para confiar en un punto obligatorio pegado a la costa.
- El paso cerca de costa avanza ~5-8 nm por salto (1 h): un canal de 4 nm no se atraviesa si
  ningún rumbo aterriza adentro; falta reintento con paso reducido.

Reglas de Diego (van como contrato):
- Un waypoint obligatorio (⚓) es CORRECTO por definición: el optimizador confía en él y jamás
  lo rechaza por tierra.
- Tiene que entrar por canales: el margen de 3 nm es 3 nm de verdad, no una caja de una celda.

Archivos: web/src/core/routing/landmask.ts (+test), web/src/core/routing/isochrones.ts
(+test), web/src/ui/app.ts (solo el texto del motivo).

1. **Margen fino (transformada de distancia):** al decodificar la máscara, calcular una
   transformada de distancia (dos pasadas, chamfer; el paso horizontal ponderado por
   cos(latitud) por fila — o BFS con costes escalados, a criterio). isLandWithMargin(lat,
   lon, nm) pasa a comparar la distancia REAL en millas contra nm. El margen de 3 nm bloquea
   3 nm, no 9-12. nm=0 sigue siendo isLand puro. El cálculo corre una vez al cargar
   (< 300 ms en un móvil medio; mantener el test de 1 M de consultas < 50 ms).
2. **Anclas de confianza:** la gracia por ancla sube a ±0,2° (~12 nm) y las anclas (from/to de
   cada tramo, incluidos los ⚓) son VERDAD: el motivo de falla jamás las cuestiona. El
   usuario marcó el punto; el optimizador lo respeta.
3. **Motivo honesto:** eliminar el diagnóstico por recta origen→destino. El motivo sale del
   último estado de la frontera (contar por qué mueren los candidatos: tierra / sin viento /
   TWS máximo / límite de bordos) y dice DÓNDE murió: "sin corredor navegable cerca de (lat,
   lon)", "sin datos de viento en la zona", "viento supera el máximo del modo", "se agotaron
   los pasos antes de llegar". Nunca "bloqueado por tierra" si la frontera murió lejos del
   obstáculo.
4. **Paso adaptativo en corredores:** si TODOS los candidatos de un punto mueren por tierra,
   reintentar ese punto con Δt reducido a la mitad (piso 15 min) antes de darlo por muerto:
   pasos de 1-2 nm atraviesan canales que los de 7 nm saltan.
5. **Tests:** (a) canal de 0,2° (12 nm) entre isla y continente → el trazado lo atraviesa con
   margen de 3 nm; (b) isLandWithMargin en el medio de un canal de 0,1° con margen 3 nm →
   false (el margen es 3 nm reales, no la caja); (c) motivo honesto: frontera muerta lejos del
   obstáculo → el texto no dice "bloqueado por tierra" y trae la posición; (d) ancla a 1 nm de
   la costa → el tramo parte y llega sin rechazo; (e) reintento de paso: corredor de ~3 nm →
   al menos un candidato sobrevive con Δt reducido; (f) TODOS los tests de E12.7 siguen
   verdes (puerto, isla de 1 celda, simplificación, "Bordo n").
6. Prueba de Diego en el celu: Noronha por el norte ⚓ y un canal angosto (p. ej. entre islas
   del Caribe) → el optimizador entra; si algo no llega, el motivo dice dónde y por qué de
   verdad.
7. npm test (en web/), bash scripts/build-web.sh, commit "E12.8: margen fino, corredores y
   anclas de confianza", push, PARÁ.
