# Registro de transparencia — Optimizador de isocronas (modo regata)

Fecha: 2026-11-11
Repositorio: diego-pereyra/holisticNavigator
Rama: main

## 1. El problema reportado

Diego detectó que en modo **regata** el trazado con preferencia costera ("costera alta") daba un ETA **menor** que el trazado directo (sin costera).

Ejemplo medido (clima noviembre, BA → Florianópolis, polar genérica):

| Modo | Sin costera | Costera alta |
|------|-------------|--------------|
| Regata | 232,6 h / 849 nm | **203,9 h / 790 nm** |

Regla de Diego: **regata optimiza solo el tiempo de llegada**. Si la costera es más rápida, regata debe tomar la costera, pero nunca al revés: regata no puede ser más lenta que costera.

## 2. Intento 1 — Regata ignora la preferencia costera (REVERTIDO)

Cambio en `web/src/ui/app.ts` (`optConfig`): si `mode === "regata"`, devolver solo `routingModeConfig(mode)` ignorando `COASTAL_WEIGHTS`.

Resultado: regata directa = 232,6 h, regata costera ignorada = 203,9 h (la costera seguía siendo más rápida cuando se corría por fuera).

Diego rechazó: "si regata costera es más rápida estás haciendo mal el cálculo de regata... busco que cuando te diga regata vayas por los mejores vientos para llegar más rápido".

Commit `ac26b4d` fue revertido.

## 3. Intento 2 — Comparar directa vs costera y quedarse con la ETA menor (REVERTIDO)

Se agregó `compareDirect` al worker de isocronas: en regata con sesgo costero activo, corre directa (`coastTargetNm: 0`) y costera, y devuelve la de menor `etaMs`.

Resultado verificado con datos reales:
- Regata costera alta: 203,9 h / 790 nm
- Regata directa: 232,6 h / 849 nm
- Ganador: costera.

Diego rechazó de nuevo: "pero eso no está encontrando la ruta más rápida de forma real... necesitamos una estrategia de poda... O sea necesito ir por la solución más robusta... es la que según mi polar vs el viento me permita llegar lo más rápido posible".

## 4. Intento 3 — "Route Relaxer" (EVALUADO POR AGENTE CRÍTICO, RECHAZADO)

Propuesta escrita:

1. Baseline: resolver origen → destino sin vias.
2. Waypoints de relajación cada `relaxEveryNm` sobre el trazado base.
3. Relajación por tramo: puntos intermedios se desplazan dentro de `relaxRadiusNm` evitando tierra.
4. Poda multi-criterio: agregar `t / distanciaAlDestino`.
5. Penalización de maniobras escalada por velocidad.
6. Último tramo: ±`lastLegMaxDeg` del bearing al destino, salvo `tws < motorMinTws`.
7. Regata: compara directa relajada vs costera, ETA menor.
8. Recalculo si pronóstico cambia >15° o >3 kn.

Presets por modo (regata / crucero / confort) con `relaxEveryNm`, `relaxRadiusNm`, poda beam, penalizaciones, `motorMinTws`, `lastLegMaxDeg`.

### Evaluación del agente `valorador-odioso` (sin contexto previo del proyecto)

**Puntaje: 22 / 100**
**Veredicto: RECHAZAR**

Críticas principales:
- P1: La línea base R0 ya tiene la poda defectuosa; relajar alrededor de R0 es optimización local disfrazada de global.
- P2: "Puntos sobre el mar" no garantiza agua navegable, calado, franja de seguridad ni zonas restringidas.
- P3: Optimizar tramo a tramo ignorando estado de llegada no compone al óptimo global.
- P4: `t / distanciaAlDestino` es basura dimensional (horas/milla no es criterio de dominancia válido).
- P5: Penalización por velocidad es circular y auto-sabotea: rama lenta arranca con más penalización y se descarta, refinando el sesgo contra ramas lentas que capturan viento.
- P6: ±45°/60°/90° es arbitrario; `motorMinTws` mezcla viento real con decisión de motor; no hay fallback si el destino está contra el viento y no hay motor.
- P7: Regata repite la elección binaria directa vs costera sin explorar rutas mixtas (dogleg offshore).
- P8: Recalculo es un restart sin continuidad ni histéresis → thrashing.
- P9: Confort solo difiere en números, no hay función real de confort (ola, período, balance, aceleración).
- P10: Todos los números son mágicos (30/60/120, 25/12/5, 4/6/8 kn, 45/60/90°) sin experimento ni sensibilidad.
- P11: El objetivo medible es un caso único (232,6 → 203,9 h) sin ablación ni ensemble.

Escenarios donde falla: shift persistente fuera del radio, línea base sobre banco/cabo, recálculo por celda aislada, Confort entrega ruta incómoda con etiqueta de confort, regata a motor, último tramo infactible sin motor.

## 5. Conclusión actual

**No se implementó ningún cambio de optimizador después del commit `ac26b4d` (revertido).**

El código actual en main es el del commit anterior al intento de corrección: `optConfig` aplica el sesgo costero en todos los modos, incluyendo regata. Regata puede seguir entregando una costera más rápida que la directa, lo cual viola la regla de Diego ("regata tiene que ser la más rápida").

## 6. Próximos pasos pendientes

Antes de tocar código, definir:

1. **Función de estado explícita**: (posición, hora, rumbo, amura) resuelta de una pieza, no tramo a tramo independiente.
2. **Función de costo por modo**: para Confort (ola, período, balance, aceleración), Crucero (descanso, llegada diurna, combustible), Regata (polar real).
3. **Cota o prueba de dominancia**: declarar el gap respecto de un solver de referencia. Sin esto, "menor ETA" es una opinión con decimales.
4. **Máscara de tierra con clearance y calado**, zonas restringidas, separación de tráfico.
5. **Validación con ensemble y ablación**: demostrar en qué casos la nueva versión gana al optimizador libre actual.
6. **Presupuesto de cómputo y latencia** en el dispositivo objetivo.

## 7. Reglas respetadas

- No se commiteó código de optimizador después del rechazo de Diego.
- No se tocó `docs/` ni `AGENTS.md`.
- Se usó el agente `valorador-odioso` (modelo opencode/big-pickle, sin contexto previo) para evaluar críticamente el tercer enfoque.
- Todo registrado aquí para transparencia.
