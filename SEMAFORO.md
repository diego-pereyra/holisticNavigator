ADELANTE

TAREA ÚNICA: UX-N.4b — Completar el Ajustes: el núcleo de unidades ya está (format.ts, 178
tests verdes); falta TODA la interfaz que el DONE de UX-N.4 dejó afuera (revisión del
arquitecto: formatSpeed/formatDistance se usan 0 veces en la UI; no existe el panel).

Archivos: web/src/ui/app.ts, web/public/app.css. core/format.ts ya está hecho — usalo.

1. **Entrada fija:** botón ⚙ en la barra de contexto → panel Ajustes (hoja completa en móvil,
   columna en escritorio). Todo setting a ≤ 3 toques del mapa.
2. **Visibilidad** (hn.settings.visibilidad, todos visibles por defecto): MOB · FAB ◉ ·
   nota de escala · retícula · balizas OSM online. Ocultar el MOB quita el botón y su
   pulsación larga; un MOB ACTIVO nunca se oculta (hombre al agua siempre visible).
3. **Unidades conectadas de verdad** (hn.settings.unidades, defaults kn/nm/m): los
   selectores de Ajustes y TODOS los textos de velocidad/distancia/profundidad de la UI
   pasan por formatSpeed/formatDistance/formatDepth: tira de navegación, ficha (millas),
   comparación de optimización, clima del pin, fondeo (radio en m/ft). Cero números
   crudos: si cambiás a km/h y km, el nav strip y la ficha cambian.
4. **Absorbe en Ajustes:** la tarjeta de Alarmas (umbrales desvío/llegada), el Tema (chips +
   "De noche usar Rojo") y el panel "Sin conexión" completo. En Aquí queda solo lo operativo
   del momento: posición, ruta en curso, fondeo activo, rutas cercanas.
5. Tests (node:test): visibilidad persistida y aplicada al montar (MOB/FAB ocultos de
   arranque tras recargar); unidades kn/nm/m y km/h/km/ft en los formatters ya cubiertos —
   sumá un test de la configuración aplicada (hn.settings.unidades sobrevive recarga).
6. Aceptación: el MOB se oculta y aparece; cambiar a km/h cambia la tira Y la ficha;
   cualquier setting a ≤ 3 toques del mapa; el UAT encuentra "Ajustes".
7. npm test (en web/), bash scripts/build-web.sh, commit "UX-N.4b: ajustes central
   completo (UI de visibilidad y unidades)", push. Al terminar escribí "Status: DONE"
   como última línea de este archivo.

Status: done
