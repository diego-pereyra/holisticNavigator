# W-XX: Simulación en el tiempo

**Pedido:** Diego 2026-11-10 — feature de producto (no reel).

## Descripción
Añadir modo "Simulación en el tiempo" al programa:
- Contador de días visible (día 1, día 2, ... día N)
- Polares del barco: mostrar curva polar / performance para el día actual
- Posición del barco: animar/indicar dónde está el barco en la ruta día a día

## UX esperada
- Botón/control "Simular" en la hoja de ruta propia o en la ficha de optimización
- Al activar: slider o autoplay día a día
- Cada día: actualiza posición (waypoint intermedio o tramo), muestra viento del día (pronóstico ya descargado), velocidad polar (SOG), rumbo
- UI ligera: superposición en el mapa + panel chico con "Día X · Viento: NO 15kt · SOG 6.2kn · Rumbo 045°"

## Integración
- Usa `voyage.ts` (ya calcula log de travesía con tiempos/distancias)
- Usa `forecast.ts` (pronóstico por horas/días ya descargado)
- Usa polar del barco (`polarPorDefecto()` en theme.ts)
- No requiere nuevo backend; todo offline con datos ya en cliente

## Prioridad
Alta — Diego quiere empezar YA en paralelo con reels.
