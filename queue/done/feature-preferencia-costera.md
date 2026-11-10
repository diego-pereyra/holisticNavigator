# W-XX: Preferencia costera en el optimizador

**Pedido:** Diego 2026-11-10 — feature de producto (no reel).

## Descripción
Opción en el optimizador: "Preferir costa" / "Costera" — dar más peso a los rumbos que pasan cerca de la costa, para que la ruta abrace la costa en lugar de abrirse al océano abierto.

## Comportamiento
- Checkbox/opción en la hoja de optimización (junto a "Obligatorio", "Velocidad", "Distancia", "Sonda")
- Al activar: la función de coste del pathfinder añade término de penalización inversamente proporcional a la distancia a la costa (shapefile / raster de costa ya disponible en `catalog.ts`?)
- Parámetro configurable: "Peso costero" (slider 0–1 o bajo/medio/alto)
- Resultado: rutas que se ciñen a la costa cuando el viento lo permite, sin forzar waypoints manuales

## Integración
- `routing/` (pathfinder A* / Dijkstra) — añadir coste extra por celda basada en `distanceToCoast(lat,lon)`
- Datos de costa: `catalog.ts` tiene `coastLine` / shapefiles? Ver `web/src/core/catalog.ts`
- Compatible con waypoints obligatorios existentes (el punto fijo de Diego a 50nm de SP sería caso particular)

## Prioridad
Alta — complementa la simulación en el tiempo (rutas costeras = más realistas).
