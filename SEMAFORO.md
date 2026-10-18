ADELANTE

TAREA ÚNICA: E12.7 — La optimización no pisa tierra: completar el contrato de seguridad de
E12.6 (el trazado optimizado cruza tierra; reporte de Diego tras 984be7f).

Diagnóstico ya hecho (no buscar más):
- web/src/core/routing/isochrones.ts:579-581 — el salto de anclaje final (candidato de
  llegada → destino exacto, hasta ~29 nm en modo océano) jamás pasa por segmentClear.
- isochrones.ts:583 — la simplificación Douglas-Peucker con tol 0,1° (~6 nm, el doble del
  margen de 3 nm) endereza el trazado verificado y nunca se re-verifica contra la máscara.
- isochrones.ts:404 — segmentClear muestrea desde i=0: el origen NO está exento. Un origen
  o ancla en celda de puerto (los puertos son tierra en la máscara, lección de E12.2)
  colapsa la frontera, el tramo no llega y multiRouteCoords une las anclas con líneas
  rectas: el esqueleto que "pisa tierra".
- Además faltan del spec aprobado: el contrato de falla (reached:false + reason, Aplicar
  bloqueado — grep: cero "reached"/"reason" en la UI) y "Bordo n" (cero apariciones).

Archivos: web/src/core/routing/isochrones.ts (+test), web/src/core/routing/landmask.ts,
web/src/ui/app.ts, web/src/ui/routes-own.ts.

1. **Extremos exentos:** origen, destino y anclas obligatorias exentos del chequeo de
   margen — solo el camino ENTRE extremos se verifica. segmentClear gana modo escape:
   salta la muestra i=0 del origen y usa isLand sin margen a menos de ~0,05° de cada
   extremo (salir y entrar a puerto es legal).
2. **Salto de anclaje verificado:** un candidato solo "llega" si la recta de él al
   destino exacto despeja la máscara (extremo exento); si no, la frontera sigue avanzando
   y otro candidato puede llegar. Jamás reemplazar el último punto por las coordenadas del
   destino sin verificar ese tramo.
3. **Post-verificación de la simplificación:** cada segmento del trazado simplificado pasa
   por segmentClear; el que falla se re-subdivide con los puntos crudos a tolerancia
   mitad (piso 0,02°). Los waypoints emitidos siempre dibujan una línea que despeja la
   máscara (salvo en los extremos exentos).
4. **Contrato de falla:** tramo colapsado o no llegado → reached:false + reason
   ("sin-camino" / "sin-viento-en-la-zona"); multiRouteCoords JAMÁS une anclas con recta
   de un tramo fallido (el tramo se corta y se marca); Aplicar se bloquea con el aviso —
   la ruta del usuario nunca se destruye por un cálculo fallido.
5. **Bordo n (aprobado en E12.6, faltante):** los cambios de amura del camino
   reconstruido se marcan como viradas; D-P no puede eliminarlos; al aplicar se llaman
   "Bordo 1…n".
6. **Épsilon de índice:** cellIndex/rowIndex pasan a floor(x·10 + 1e-6) (endurecimiento
   menor; el +0,5 quedó descartado por desalinear la costa — resuelto en BLOCKERS).
7. **Tests:** (a) origen en celda de puerto → corre y produce trazado (no esqueleto
   recto); (b) destino tras isla de 1 celda → acercamiento final claro; (c) simplificación
   con rodeo exigido < 6 nm → nunca cruza la máscara; (d) tramo fallido → reached:false y
   Aplicar bloqueado; (e) contra el viento → ≥ 2 waypoints "Bordo" en zigzag; (f) índice
   en -3,8 exacto y 0,1 exacto.
8. Prueba de Diego en el celu: Noronha con aproximación al norte ⚓; ruta con origen en
   puerto; ruta con destino tras una isla — ninguna línea pisa tierra.
9. npm test (en web/), bash scripts/build-web.sh, commit "E12.7: la optimización no pisa
   tierra (contrato de seguridad de E12.6)", push, PARÁ.
