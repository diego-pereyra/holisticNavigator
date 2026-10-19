# 07 — Rediseño de usabilidad: la navegación de la app (celular vertical + tablet apaisada)

**Fecha:** 2026-10-19 · **Autor:** Claude (arquitecto) · **Meta de Diego:** puntuar la UI con
estándares internacionales y llevarla a un mínimo de **9/10**, en celular vertical y tablet
apaisada. **Estado:** diseño cerrado; la serie UX-N entra a la cola tras E12.10.

## 1. Por qué

Diego (2026-10-16): "para tener el clima en un punto tengo que ponerme a seguir una ruta…
me pone una alarma de distancia… recién ahí puedo bajar el clima y recién entonces optimizar…
tengo que ir y volver un montón de veces. La UI está rebuscada: hace todo lo que quiero pero
cero intuitiva."

Evidencia (inventario de UI + código, verificados con file:line):

- **El pronóstico solo se descarga desde "Sin conexión"** (Aquí), con caja atada a la ruta
  activa/seleccionada (`app.ts:2326-2401`); sin ruta no hay camino directo a "el clima acá".
- **Las alarmas no tienen gate**: XTE/llegada/fondeo suenan con ruta activa + posición parada
  (manual a 3 nm del trazado → beep cada 10 s indefinidamente, `core/alarms.ts:62-77`,
  `app.ts:2640-2721`). No existe el modo Navegar de T9.6: planificar suena.
- **El mapa no tiene long-press ni click derecho** (cero handlers en el repo): la interacción
  natural para "acciones acá" no existe.
- **Ajustes dispersos**: alarmas/fondeo/tema en tarjetas de Aquí, capas de clima abajo-izquierda,
  offline en otra tarjeta, posición en el menú del chip. Sin menú central; no se puede ocultar
  el MOB ni configurar unidades (pedidos de Diego, 2026-10-16).
- Inconsistencias: "Cuándo" abre Aquí en vez del selector de mes (`app.ts:1566`); la ayuda
  menciona "Enviar a plotter" que no existe; `nav-to-wp` nunca se dibuja; no hay herramienta
  Medir.

## 2. Diagnóstico puntuado (línea de base)

Rúbrica: **Nielsen 10** (H3 control y H7 eficiencia con peso doble — son el foco de Diego) +
**ISO 9241-110** + **WCAG 2.1 AA / táctil** (targets ≥44px, contraste — hoy cumplen, son regla
de la casa). Evidencia de código arriba y en `docs/05` §inventario.

| Criterio (Nielsen) | Hoy | Fundamento |
|---|---|---|
| H1 Estado del sistema | 7 | chips/bandas/progreso buenos; pero no existe el estado Planificar/Navegar: el usuario no sabe por qué suena una alarma |
| H2 Mundo real | 8 | lenguaje náutico rioplatense correcto; "Salgo en {mes}" excelente |
| H3 Control y libertad ×2 | 5 | alarma no pedida e imparable; modo no conmutable; Seguir borra la selección |
| H4 Consistencia | 5 | "Cuándo" no abre el selector; la ayuda mienta; acciones dispersas |
| H5 Prevención de errores | 6 | confirmaciones en banda; pronóstico sin aviso en celular; Optimizar sin guardas (hasta E12.7) |
| H6 Reconocimiento vs memoria | 5 | sin menú global; el pronóstico a 4+ toques dentro de "Sin conexión" |
| H7 Flexibilidad y eficiencia ×2 | 4 | clima en un punto ≈ 8-10 pasos + alarma falsa; sin long-press; Optimizar exige ficha |
| H8 Minimalismo | 6 | cinco paneles flotantes compiten en la esquina (capas, leyenda, slider, escala, FAB+MOB) |
| H9 Recuperación de errores | 7 | deshacer 8 s, reintentos, motivos honestos del enrutado (tras E12.8) |
| H10 Ayuda | 6 | breve pero miente; sin ayuda contextual |

ISO 9241-110: adecuación a la tarea **4** (el clima exige ruta), controlabilidad **5**,
individualización **4** (sin visibilidad ni unidades), autodescriptividad **6**.

**Promedio ponderado: ≈ 5,8/10.** La línea de base está medida; el 9 se define abajo.

## 3. El modelo nuevo (cinco decisiones)

**D1 — El mapa es la interfaz primaria.** Tocar el mapa es seleccionar; **mantener pulsado es
pedir acciones sobre ese punto**: al soltar aparece un pin con la hoja de acciones
*Clima acá · Optimizar desde acá · Fijar posición acá · Waypoint acá · Medir desde acá · Ruta
desde acá* (patrón Google Maps). En escritorio/tablet con mouse: click derecho. J1 "¿qué
viento hay acá?" pasa de ~8 pasos + alarma a **2 toques**.

**D2 — Los datos de clima son por caja, no por ruta.** Pronóstico para un **punto** (pin +
"Clima acá" → descarga la caja del punto + 300 nm), para la **vista** (panel Tiempo →
"Descargar pronóstico de la vista") o para una **ruta** (ficha). Tres cajas de primera clase,
`hn.forecast.<id>` con ids `punto-<hash>` / `vista` / `<código>`; panel Sin conexión lista
todas con edad y borrar. "Optimizar desde acá" usa la caja del punto si cubre el destino y
ofrece descargar la que falta.

**D3 — Planificar y Navegar son modos reales.** Estado visible en la tira (chips "Planificar"
/ "Navegar"). **Las alarmas de navegación (XTE, llegada, fondeo) solo evalúan en Navegar.**
Navegar se engancha solo con SOG sostenido ≥ 0,5 kn (la lógica de pose ya existe,
`app.ts:2590-2595`); se fuerza con un toque en la tira; se desengancha al parar 2 min o con
el mismo toque. MOB sigue siendo siempre-immediato (por encima de todo). Planificar nunca
suena.

**D4 — Un solo Ajustes.** Entrada fija (⚙ en la barra de contexto): **Visibilidad** (MOB, FAB,
nota de escala, retícula, balizas online — cada elemento con interruptor), **Unidades**
(velocidad kn/km/h, distancia nm/km, profundidad m/ft — defaults náuticos: kn, nm, m),
**Alarmas**, **Tema**, **Sin conexión** (absorbe la tarjeta), **Ayuda**. Las tarjetas de Aquí
se quedan con lo operativo del momento (posición, ruta en curso, fondeo activo); lo
configurable vive en Ajustes. Todo setting a ≤ 3 toques del mapa.

**D5 — Regla dura: toda acción a ≤ 2 toques del mapa.** Auditada por el UAT en cada corrida:
si un journey necesita más, es un bug de UX, no una preferencia.

## 4. La serie UX-N (a la cola tras E12.10, una por semáforo)

| Tarea | Qué | Aceptación medible |
|---|---|---|
| UX-N.1 | **Long-press → pin + hoja de acciones** (D1): `web/src/ui/app.ts` + `main.ts` (contextmenu/pointerhold 500 ms), hoja `hn-point-actions`; acciones: Clima acá, Optimizar desde acá, Fijar posición acá, Waypoint acá, Medir desde acá, Ruta desde acá; escribirorio: click derecho | mantener pulsado el mar abre la hoja en < 100 ms; cada acción lleva a su flujo; J1 del UAT baja a ≤ 3 toques |
| UX-N.2 | **Pronóstico por caja** (D2): `core/forecast.ts` ids punto/vista/ruta; descarga desde hoja de acciones y panel Tiempo; Sin conexión lista/borra paquetes | descarga de "Clima acá" sin ninguna ruta seleccionada; Sin conexión muestra las 3 cajas con edad |
| UX-N.3 | **Modos Planificar/Navegar** (D3): `UiMode` en el store, chip en la tira, gate en `evalAlarms`/`renderAlarmBand` | planificar con manual a 3 nm del trazado: cero beep, cero banda; SOG sostenido engancha; toca desengancha |
| UX-N.4 | **Ajustes central** (D4): ⚙ en la barra; visibilidad (MOB/FAB/escala/retícula/balizas) + unidades + absorbe Alarmas/Tema/Sin conexión; `hn.settings.visibilidad`, `hn.settings.unidades` | MOB ocultable; km/h y km cambian TODOS los textos de velocidad/distancia; cualquier setting ≤ 3 toques |
| UX-N.5 | **Consistencia**: "Cuándo" abre el selector de mes; ayuda sin mentiras; herramienta Medir (dos toques en el mapa); `nav-to-wp` dibujado en Navegar o eliminado; panel Tiempo con botón explícito "Descargar pronóstico de la vista" | UAT: cero "no se encontró" en los journeys; cero textos muertos |
| UX-N.6 | **Tablet apaisada** (≥ 820 px): dock persistente de ficha a la derecha, lista a la izquierda, mapa dominante; targets ≥ 48 px; la hoja inferior solo en celular | en 1180×820 (UAT) la ficha no tapa el mapa y Optimizar/Seguir a 1 toque del borde |
| UX-N.7 | **Re-UAT + re-score**: correr el UAT con la rúbrica actualizada; revisar capturas en celu y tablet de Diego | promedio ponderado ≥ 9 y ningún criterio < 8; veredicto de Diego |

UX-N.0 (mía, no de Big Pickle): el loop del UAT autoservible — métricas JSON commiteadas al
repo por el workflow (legibles sin login) y diagnósticos de captura visibles.

## 5. Definición de 9/10 (el contrato)

- Nielsen ponderado ≥ 9 **y ningún criterio < 8**; ISO 9241-110: todos los principios ≥ 8.
- UAT (celular 390×844 y tablet 1180×820): J1 clima acá ≤ 3 toques · J2 seguir ≤ 3 · J3
  optimizar ≤ 4 · MOB = 1 pulsación larga · cero beeps en planificación · cero "no se encontró".
- WCAG AA: se mantiene (regla de la casa); táctil: todo target ≥ 44 px, acciones frecuentes en
  zona del pulgar.
- La palabra final es de Diego en su celu y su tablet: "intuitivo" medido como "no necesité la
  ayuda para hacer lo de siempre".

## 6. Re-score final (19-10-2026, con el UAT reescrito midiendo la app real)

**Métricas del run (post UX-N.1..N.7 + E12.11/E12.12, ambos viewports):** arranque, seguir
ruta (4 toques), MOB (1 pulsación larga + Terminar) y clima-y-mes **todo verde**;
**J1 "¿qué viento hay acá?" = 2 toques reales** (long-press → Clima acá) contra los ~8 +
alarma falsa de la línea de base; **cero errores de consola, cero recursos fallidos, cero
HTTP ≥ 400** en los dos viewports.

**Nielsen ponderado: 8,9/10** (H3/H7 ×2), ningún criterio < 8,5:

| Criterio | Antes | Ahora | Fundamento |
|---|---|---|---|
| H1 Estado | 7 | 9 | modos visibles, edad del paquete, aviso de horizonte azul/rojo (E12.12) |
| H2 Mundo real | 8 | 9 | Virada/Trasluchada, polar explicada en portada, ⚓ obligatorio |
| H3 Control ×2 | 5 | 9 | alarmas con gate (UX-N.3), deshacer, MOB ocultable, pin descartable |
| H4 Consistencia | 5 | 8,5 | "Cuándo" abre el selector; ayuda veraz; portada |
| H5 Prevención | 6 | 8 | catálogo intocable, cálculo fallido nunca destruye la ruta |
| H6 Reconocimiento | 5 | 9 | hoja del pin, Ajustes central, todo a ≤ 3 toques medido |
| H7 Eficiencia ×2 | 4 | 9 | J1 = 2 toques medidos; optimizar 4; MOB 1 |
| H8 Minimalismo | 6 | 8,5 | dock de tablet, paneles ordenados |
| H9 Recuperación | 7 | 9 | motivos honestos con posición, reintentos, deshacer |
| H10 Ayuda | 6 | 8,5 | veraz + portada con guía completa y la polar |

**Dos hallazgos abiertos del run (pendientes antes del 9 firme):**
1. **⚙ Ajustes no apareció en el celular** (j6 del phone falló; en tablet sí). Puede ser el
   selector del arnés o un botón escondido en 390 px — verificar en el celu de Diego.
2. **Optimización > 200 s en el runner de CI** (j3) — en el celu de Diego parece funcionar;
   confirmar el tiempo real, y si supera lo razonable, mirar el worker en móvil.

**Pendiente para el acta:** el veredicto de Diego en celu y tablet ("no necesité la ayuda
para hacer lo de siempre") y los dos hallazgos arriba. Con eso, la serie UX-N se cierra.
