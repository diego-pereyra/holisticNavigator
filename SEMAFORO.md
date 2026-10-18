ADELANTE

TAREA ÚNICA: E12.7 — Optimizador v3: tramos robustos y contrato de falla. (Iteración
sobre E12.6 con Diego, 2026-10-18.)

Contexto: E12.6 (commit 984be7f) dejó los modos de ponderación, el flag "obligatorio" por
waypoint y el rodeo de islas con supercover. Faltan tres bordes que aparecen en casos
reales —origen en puerto, destino en tierra, islas chicas que la simplificación "recorta"—
y una salida digna cuando un tramo no se puede trazar.

Archivos: web/src/core/routing/isochrones.ts, isochrones.test.ts,
web/src/core/routing/landmask.ts (+test), web/src/core/routes-own.ts (+test),
web/src/ui/app.ts, web/public/app.css (solo si hace falta para "Bordo n").

1. **Extremos exentos.** Los extremos de cada tramo (las anclas: waypoints obligatorios; en el
   primer/último, origen y destino) quedan **exentos** del chequeo de tierra con margen: un
   puerto puede estar en tierra o a menos de 3 nm de la costa y el tramo debe poder
   arrancar/terminar ahí. El resto del trazado sigue validado (supercover con margen).
2. **Salto de anclaje verificado.** El tramo entre dos anclas consecutivas se cierra uniendo los
   waypoints optimizados; ese cierre (y cualquier salto de la frontera) se valida con el mismo
   supercover (paso ≤ 0,05° con margen), para que una isla de 1 celda no se pueda saltar de borde
   a borde.
3. **Post-verificación de la simplificación.** Tras simplificar/capear los waypoints de cada tramo
   (tol 0,1°, tope ~15), se re-verifica la polilínea reconstruida: ningún segmento puede cruzar
   tierra con margen ni superar el TWS máximo del modo. Si el recorte introduce un cruce, se
   reintroducen los waypoints necesarios (hasta el tope) para que la traza aplicada sea siempre
   navegable.
4. **Contrato de falla.** Si un tramo no llega: `reached: false` + `reason` (texto corto: sin
   viento, bloqueado por tierra, TWS > máximo…). El resultado NUNCA contiene una recta
   ancla-a-ancla de un tramo fallido (hoy, al no llegar, se conservaba el último nodo y el cierre
   podía dibujar/guardar una recta inválida). En la UI, "Aplicar optimización" queda
   **deshabilitado** con `reached:false` y se muestra el motivo; solo se puede Descartar.
5. **"Bordo n".** Los waypoints que caen en una virada se nombran por su bordo ("Bordo 1",
   "Bordo 2", …) al aplicar, en lugar de `WPn`, para que la traza sea legible. El conteo de ceñidas
   sigue en la comparación de E12.6 ("Ceñidas: N bordos"); los waypoints que no son virada
   conservan la numeración `WPn`.
6. **Épsilon de índice.** En `landmask.ts`, el índice de celda pasa a `floor((v + origin) * 10 +
   1e-6)` (no `/0.1` ni media celda), para que un borde exacto (p. ej. `-3.8`) no caiga en la
   celda vecina por error de redondeo.
7. **Tests (6):**
   (a) origen en puerto / destino en tierra → `reached:true` y ningún punto intermedio pisa tierra
       con margen;
   (b) isla de 1 celda en el punto medio entre dos anclas → el salto de anclaje la rodea
       (supercover), no la cruza;
   (c) la simplificación no recorta una isla: un tramo con quiebre alrededor de una isla chica
       queda navegable tras simplificar;
   (d) tramo irresoluble → `reached:false` + `reason`, sin recta ancla-a-ancla en el resultado;
   (e) "Bordo n": las viradas se nombran "Bordo 1..n" y el conteo coincide;
   (f) épsilon de índice: bordes exactos (p. ej. `-3.8`) sin off-by-one.
8. **Prueba de Diego en el celu:** ruta a Fernando de Noronha con waypoint de anclaje ⚓
   (obligatorio) → entra sin pisar la isla; origen en un puerto → arranca igual; destino detrás de
   una isla → la rodea y, si no puede, no aplica y avisa por qué.
9. npm test (en web/), bash scripts/build-web.sh, commit "E12.7: tramos robustos, contrato de falla
   y 'Bordo n'", push, PARÁ.