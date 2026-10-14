# BLOCKERS

## T2.3 · Resolver de contexto vs cajas de T0.5 (resuelto, requiere revisión)

**Qué falla.** El enunciado de T2.3 define `region` = "primer polígono de
`basins.json` que contiene el punto" y fija como aceptación Panamá (9.5, −79.6) →
"Atlántico Tropical" y (36, −6) → "Atlántico Norte". Con las cajas de T0.5 tal
como se entregaron, ambas se solapan: Panamá cae dentro de las cajas de
*Atlántico Norte*, *Atlántico Tropical*, *Pacífico Norte* y *Pacífico Tropical*,
y (36, −6) dentro de *Atlántico Norte*, *Atlántico Tropical*, *Mediterráneo Este*
y *Oeste*. Como "gana la primera", ningún orden de las 13 regiones satisface los
dos casos a la vez (medido: contradicción AT<AN y AN<AT).

**Qué propongo (hecho en W2).** Ajuste mínimo a las cajas y al orden en
`tools/build_basins.py`:
- *Atlántico Tropical* pasa a `lat [-20, 30]` (antes `[-45, 45]`), para que
  (36, −6) quede fuera.
- Orden específicas-antes-que-generales: AT, AN, AS, Pacífico Norte, Pacífico Sur,
  Pacífico Tropical, Índico… (antes AN, AT, AS, PN, PT, PS…).

Resultado: los 5 casos de T2.3 pasan y la cobertura de T0.5 sigue en **98,3 %**
(766/779, antes 99,2 %), muy por encima del 95 % exigido. `test_basins.py` verde.

**Segundo punto.** El caso "(36, −6) con AN32 entre las cercanas": AN32 es
*Gibraltar → Canarias*, y con el catálogo completo hay ≥8 variantes que pasan
más cerca (p. ej. AN16/AN124 a ~1,7 nm de Hoyo), así que AN32 no entra en el tope
de 8. Se implementa el algoritmo literal (≤600 nm, tope 8, si no las 3 más
cercanas) y el test de AN32 usa un conjunto controlado de variantes. Si Diego
quiere AN32 en el caso real habría que cambiar el criterio de cercanía.

**Decisión pendiente:** si se acepta este ajuste de cajas o se redefine el
resolver de contexto.

## W5.1 · `wpNames` se conserva en `routes.geojson`

**Qué falla (desvío).** El paso 7 de W5.1 pide quitar de `routes.geojson` las
propiedades repetidas por variante, nombrando `title` y `wpNames`. `wpNames` se
usa en runtime: `activeNav` lo lee para mostrar el nombre del waypoint de destino
("Próximo: …"). Quitarlo rompería ese texto.

**Qué hice.** Mantuve `wpNames` y quité solo los features `Point` de extremos
(`name`/`dest`) y `title`. `routes.geojson` queda en coords de 4 decimales con
props `{code, variant, wpNames}` → **389 KB (50 KB gzip)**, dentro del objetivo
≤ 60 KB gzip. `CATALOG_VERSION` subió a 11.

**Decisión pendiente:** si se prefiere quitar `wpNames` igual (y resolver el
nombre del waypoint desde `index.json`/facts), decime y lo muevo a los facts.

**Resuelto (Claude, 2026-10-13):** conservar `wpNames` en `routes.geojson`. 50 KB gzip cumple el objetivo; no mover nada a facts.

## W4.3 · conversión de Natural Earth sin `shapely`

**Qué falla (desvío).** El enunciado de W4.3 (parte A) dice convertir las fuentes
Natural Earth "con shapely/json". No hay `shapely` en el entorno ni el CI instala
dependencias Python, así que no se puede usar tal cual.

**Qué hice.** `tools/build_basemap.py` descarga igual los `.zip` de naciscdn.org
(dominio público) y los convierte con un lector mínimo de shapefile/dBase escrito
sobre la biblioteca estándar (sin dependencias nuevas, tampoco en `web/`). Resultado
idéntico al pedido: `countries.geojson` 177 features, coords a 2 decimales, props
`name`+`mapcolor7`, **52 KB gzip** (≤ 100 KB); `cities.geojson` 243 puntos,
props `name`+`pop_max`, 4 KB gzip. La descarga se cachea en el temporal del sistema.

**Decisión pendiente:** si preferís que sea `shapely` de verdad, hay que agregarlo
al entorno/CI; avisame y lo cambio.
