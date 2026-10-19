ADELANTE

TAREA ÚNICA: UX-N.5b — "Sin conexión" son datos con dueño, no ajustes: cada paquete va con su
ruta, punto o vista. (Corrección de Diego a la spec de UX-N.4/4b: "los pronósticos están
atados a las rutas, no a la configuración — no podés dejarlo en la comunicación de forma
genérica".)

Diagnóstico (no buscar más):
- web/src/ui/app.ts:2557 — la fila sigue diciendo "Pronóstico de la travesía", genérico, con
  el id tomado del contexto (app.ts:2561-2562: ruta activa/seleccionada, si no "vista"): el
  usuario nunca sabe a CUÁL paquete apunta.
- Con UX-N.2 puede haber VARIOS paquetes (ruta/punto/vista) — platform/forecast.ts:51 ya
  lista todos (listForecasts) y removeForecast borra por id. Falta la comunicación.

Archivos: web/src/ui/app.ts, web/src/core/format.ts (solo si hace falta el formateo del
vínculo, +test), web/public/app.css.

1. **Ajustes queda solo preferencias:** unidades, visibilidad, tema, umbrales de alarma y
   ayuda — más un ENLACE claro a "Datos sin conexión". Cero datos mezclados con
   interruptores.
2. **"Datos sin conexión" = sección propia** (entrada destacada junto a Ajustes, mismo
   panel distinto marco): filas de datos, no settings. CADA paquete nombrado por su vínculo
   con listForecasts:
   - "Pronóstico · AN12 (ruta) · 0,6 MB · hace 4 h · [Actualizar] [Borrar]"
   - "Pronóstico · Clima acá · 15 N 60 W · hace 2 h · [Actualizar] [Borrar]"
   - "Pronóstico · Vista · hace 1 h · [Actualizar] [Borrar]"
   - "Pilot charts (12 meses) · 1,8 MB · ✓ guardado"
   - "Carta detallada · Caribe · 24 MB · [Borrar]"
   "Pronóstico de la travesía" genérico muere (app.ts:2557).
3. **La RUTA ACTIVA manda (regla de Diego: atado a la ruta):** con ruta activa, el modo
   Pronóstico, el panel de optimización y la ficha usan y ROTULAN el paquete de ESA ruta —
   "Pronóstico de AN12 · hace 4 h" — con su [Actualizar] ahí mismo. La ficha de la ruta y el
   panel "Clima acá" muestran EL paquete de su dueño; la descarga y la actualización viajan
   con él. El usuario nunca ve "un pronóstico" suelto: ve EL pronóstico de SU ruta.
4. Tests (node:test): el nombre del vínculo por tipo de id (ruta → código; punto-<hash> →
   "Clima acá · coords"; vista → "Vista") con función pura formateable; Ajustes sin la
   sección de datos.
5. Aceptación: cada paquete identificado por su dueño; la ficha muestra el estado de SU
   paquete con su [Actualizar]; en Ajustes no hay filas de datos.
6. Prueba de Diego: descargás el pronóstico con una ruta activa → en la ficha, en el modo
   Pronóstico y en Optimizar dice "Pronóstico de {código} · hace X h" y el [Actualizar]
   actualiza EL de esa ruta; las cajas de punto y vista aparecen nombradas aparte, cada una
   con su dueño y su edad.
7. npm test (en web/), bash scripts/build-web.sh, commit "UX-N.5b: datos sin conexión con
   dueño (ruta, punto o vista)", push. Al terminar escribí "Status: DONE" como última línea
   de este archivo.
