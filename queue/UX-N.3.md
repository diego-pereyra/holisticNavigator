ADELANTE

TAREA ÚNICA: UX-N.3 — Planificar y Navegar son modos reales: las alarmas solo suenan navegando.
(docs/07-rediseño-usabilidad.md, decisión D3. Hoy evalAlarms no tiene gate: ruta activa +
posición parada dispara XTE/llegada cada 10 s — core/alarms.ts:62-77, app.ts:2640-2721.
Diego planificando suena el teléfono.)

Archivos: web/src/core/store.ts (UiMode), web/src/ui/app.ts, web/public/app.css. core/alarms
sin cambios de semántica: el gate es de la UI.

1. **UiMode { planificar, navegar }** en el store, persistido en hn.settings. Chip visible en
   la tira (junto al estado de la ruta): "Planificar" / "Navegar", tocable.
2. **Enganche automático:** SOG sostenido ≥ 0,5 kn (2 min) con ruta activa → Navegar (la
   lógica de pose ya existe en app.ts:2590-2595 — reaprovecharla). Parar 2 min o tocar el chip
   → Planificar.
3. **Gate de alarmas:** XTE, llegada y fondeo solo evalúan en modo navegar. MOB queda por
   encima de todo (siempre inmediato). La banda de alarma, cuando está en Planificar, muestra
   el aviso pasivo "Alarmas en pausa — modo Planificar" en la tarjeta de Alarmas de Ajustes,
   no en el mapa.
4. **Wake lock** sigue igual (ruta activa/fondeo/MOB).
5. Tests (node:test): modo persistido; el cambio por SOG sostenido; con planificar, un fix a
   3 nm del trazado NO produce banda de alarma; con navegar, sí.
6. Aceptación: posición manual a 3 nm de la ruta seguida, parado → cero beep, cero banda;
   UAT J2 no registra banda de alarma durante la selección y el seguimiento.
7. npm test (en web/), bash scripts/build-web.sh, commit "UX-N.3: modos Planificar y
   Navegar, alarmas con gate", push. Al terminar escribí "Status:done" al final de este
   archivo.
