ADELANTE

TAREA ÚNICA: UX-N.4 — Un solo Ajustes: visibilidad de elementos y unidades (pedidos de Diego,
2026-10-16) + absorbe lo configurable que hoy vive disperso.
(docs/07-rediseño-usabilidad.md, decisión D4.)

Archivos: web/src/ui/app.ts, web/src/core/format.ts (nuevo, +test — formateo con unidades),
web/public/app.css. Persistencia: hn.settings.visibilidad, hn.settings.unidades.

1. **Entrada fija:** botón ⚙ en la barra de contexto → panel Ajustes (hoja completa en móvil,
   columna en escritorio). Todo setting a ≤ 3 toques del mapa.
2. **Visibilidad** (hn.settings.visibilidad, todos visibles por defecto): MOB · FAB ◉ ·
   nota de escala · retícula · balizas OSM online. Ocultar el MOB quita el botón Y su
   alarma de pulsación larga (el modo MOB activo siempre se ve: no se puede ocultar con un
   hombre en el agua).
3. **Unidades** (hn.settings.unidades, defaults náuticos): velocidad kn / km/h · distancia
   nm / km · profundidad m / ft. core/format.ts con formatSpeed/formatDistance/formatDepth y
   tests; TODOS los textos de velocidad y distancia de la UI pasan por ahí (nav strip, ficha,
   comparación de optimización, UAT metrics no cambia).
4. **Absorbe:** la tarjeta de Alarmas (umbrales), el selector de Tema con "De noche usar
   Rojo", y el panel "Sin conexión" completo se mudan a Ajustes. Aquí queda solo lo
   operativo del momento: posición, ruta en curso, fondeo activo, rutas cercanas.
5. Tests (node:test): formatSpeed/formatDistance/formatDepth en kn/nm/m y km/h/km/ft; los
   defaults; visibilidad persistida y aplicada al montar.
6. Aceptación: el MOB se oculta y aparece; cambiar a km/h cambia el nav strip y la ficha;
   cualquier setting a ≤ 3 toques; el UAT encuentra "Ajustes".
7. npm test (en web/), bash scripts/build-web.sh, commit "UX-N.4: ajustes central,
   visibilidad y unidades", push. Al terminar escribí "Status:done" al final de este
   archivo.

Status: ready
