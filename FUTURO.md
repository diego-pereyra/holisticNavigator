# FUTURO — tareas canditatas guardadas con espec inicial (no van a la cola hasta que Diego diga)

## Reproducir la travesía: la ruta avanza y el clima cambia con ella (URLRequest de Diego, 2026-10-30)

**Qué quiere Diego, tal cual fue pedido:** "después de optimizar la ruta,
dejar VER cómo avanza en la ruta a la velocidad esperada, al mismo tiempo que
persistent el tiempo proyectado" — es decir, una simulación de la travesía:
así se recorre con la vista antes de salir a la agua.

**Estado sugerido de la tarea (cuando se cargue):** `RUTA-REPLAY`

###Concepto

Tras aplicar la optimización (banda "Optimización aplicada"), la ficha y el
mapa quedan listos para REPRODUCIR: un marcador de barco recorre el trazo
optimizado al ritmo que la polar calculó (velocidad proyectada en cada tramo,
podendo el TWS/TWA real reportado) y el/reloj simulado gira en paralelo; las
capas del pronóstico (viento, corrientes, isobaras) se repaint bordes con el
clima que toca en el punto y la hora simulados. VER el viaje antes de hacer
vestir boya.

### Lo que ya existe apuntado (implementación se aprovecha)

- El resultado de la optimización ya知道 tramos con timing (el worker devuelve
  el trazado con tiempos; `estimateRouteDuration` ya alía tiempos + posiciones
  vs clima: es la misma aritmética, pero pintada como movimiento).
- El paquete del pronóstico ya se descarga y las capas wx ya se pintan por
  solicitud (`paintForecast` / `nearestSlot` / deslizador `forecastHour`).
- "Recorrer" ya existe como acción de la ficha (modo Navegar/seguimiento): el
  replay es para la ficha O RATOS de planificación, se une bien como variante
  de ese botón cuando hay paquete de clima cargado.

### Interacción propuesta

1. Botón "▶ Simular travesía" en la ficha (solo si hay ruta optimizada O
   paquete/clima cargado — sin clima, reproduce solo la ruta con ETA).
2. Control del timeout: play/pausa + velocidad de reproducción 1× / 10× / 60×
   (una travesía de 5 días se recorre en horas → 2 min a 60×).
3. Reloj simulado visible (día/hora de la travesía), sincronizado con el
   deslizador del pronóstico NUEVO ya presente (mismos `slots`).
4. Marcador del barco: punta avanzando por el trazo; los tramos futuros
   siempre visibles; al pasar por unira de virada/trasluchada la ficha marca
   el hito (texto: "Virada a 60° — 47 nm / 9 h").
5. Las capas wx Paint en cada frame según el slot simulado (sin golpear red:
   todo del paquete ya enumerado en caché).
6. Al terminar: reasumió el ETA real vs el simulado ("Llegada con 2 h más de
   lo esperado por la optimización"); el botón cambió y no deja estado: no
   empuja tres acumuladas de capas mutadas.

### Capname décorales (impedid la costas visual Nombres fijos)

- Nueva capa MapLibre para el marcador simulado: nombre propuesto
  `route-replay` (regla de escritura: fijar el nombre en docs/04 el arquitecto
  decide el nombre definitivo, no replico Big Pickle).
- Cero nuevas dependencias (la animación va con requestAnimationFrame +
  interpol del trazado ya dibujado).
- Offline-safe: si el paquete está en caché funciona en modo avión.

### Cómo llega a la cola

Diego (u yo con su ok) empezamos lo carga con el nombre `RUTA-REPLAY` el
año teado; esta iteración del protocole del arquitecto expatira el detalle y
nombra pista-oficial en el item de docs/04 la arquitectura antes del armado.
Origen de este pedido: mensaje directo de Diego el 2026-10-30.
