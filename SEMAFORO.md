ADELANTE

TAREA ÚNICA: E13.8 — Fix: la suscripción del optimizador se acumula y congela la UI tras
varios cambios de paquete. (Hallazgo de la revisión del arquitecto sobre el fix 1c678c3.)

Diagnóstico: `ui.forecast.subscribe(() => optRefreshPanel(ui))` quedó DENTRO de `optRender`
(web/src/ui/app.ts ~3892). optRender corre en cada re-render, así que cada ejecución agrega
un suscriptor al Set de la signal y nadie lo remueve: tras cada cambio de paquete los
suscritores se duplican (1, 2, 4, 8…) y el panel se re-renderiza esa cantidad de veces por
cambio. A los ~10 cambios de paquete la UI se cuelga. Además, cerrar la ficha no limpia las
suscripciones: viven en la signal, no en el DOM.

1. Mover la suscripción FUERA de optRender: suscribir una sola vez en optMount
   (app.ts:3979) y guardar el unsubscribe en una variable de módulo (optPanelUnsub).
2. En renderFicha (app.ts:4006, donde se resetea optPanelEl), llamar optPanelUnsub?.()
   antes de nullar, para que cerrar la ficha libere la suscripción.
3. Equivalente aceptada si el refactor molesta: dentro de optRender, limpiar la suscripción
   previa antes de crear la nueva. Lo NO negociable: como máximo UNA suscripción viva por
   panel, siempre.
4. Verificación: bajar paquete, cambiar de ruta activa, bajar otro, borrar paquete… × 6 →
   el panel se refresca UNA sola vez por cambio (sin congelamiento; se puede verificar con
   un contador temporal o midiendo renders).
5. npm test (en web/), bash scripts/build-web.sh, commit "E13.8: suscripción única del
   optimizador (no se duplica por render)", push. Al terminar escribí "Status: DONE" como
   última línea.
Status: DONE
