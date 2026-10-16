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

## E10.0 · batimetría (resuelto, 2026-10-14)

**Resuelto (E10.0 corregida).** El bloqueo era correcto: redondear decimales no reduce puntos (24,8 MB a 2 decimales). Se resolvió simplificando la geometría con Douglas-Peucker (`simplify`, sin dependencias) en `tools/build_basemap.py`. Con tol 0.15 daba 1 579 KB pero su gzip (452 KB) rompía el presupuesto de primera carga (1,30 MB > 1,20 MB), así que se usó la siguiente tolerancia autorizada: **tol 0.25 → 1 740 148 → 61 981 puntos (3,6 %), 1 110 KB bruto / 309 KB gzip** (≤ 2 MB; total del build 1,15 MB). No hay `50m`/`110m` de bathymetry en NE (HTTP 403), así que la única vía era simplificar los 10m.

## E10.1 · PMTiles desde un asset de Release no se puede leer en el navegador (CORS) — resuelto (E10.1b, 2026-10-14)

**Qué falla.** El job `Build PMTiles (world z6)` corre bien y publica `world-z6.pmtiles` (45 073 486 B) y `tiles.json` en la release `tiles-latest`. Pero los assets de GitHub Releases **no mandan `Access-Control-Allow-Origin`** (verificado con `curl -H "Origin: …"`: la respuesta final de `release-assets.githubusercontent.com` es 200 sin cabecera CORS). El navegador bloquea el `fetch` del protocolo pmtiles y el smoke test del deploy falla:

```
SMOKE FAIL
 - console.error: Access to fetch at 'https://github.com/…/tiles-latest/world-z6.pmtiles' from origin 'http://localhost:8087' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
 - request failed: https://github.com/…/world-z6.pmtiles net::ERR_FAILED
```

`map.on("error")` sí captura el error de la fuente (la app sigue con el piso, E10.0 intacto), pero los `console.error`/`requestfailed` del navegador no se pueden silenciar desde la app y el smoke los marca como fallo, así que el deploy queda bloqueado (CI roja; el sitio sigue en E10.0).

**Qué propongo.** Servir el `.pmtiles` desde un origen con CORS. **GitHub Pages sí manda `Access-Control-Allow-Origin: *`** (verificado), así que sirve publicarlo ahí en vez de en la release: (a) mismo sitio/mismo origen (el archivo en `web/dist`, sin CORS), (b) Pages como hosting del `.pmtiles`, o (c) un bucket público con CORS (R2/S3). Decime cuál y lo cambio; la Parte B ya queda apuntando a la URL prevista de la release.

**Resuelto (E10.1b, 2026-10-14).** Se adoptó la opción (a): los assets de la release `tiles-latest` quedan como almacén y el workflow `deploy-pages.yml` los copia a `web/dist/tiles/` del propio sitio (mismo origen, con CORS y soporte de rangos). `TILES_WORLD_URL` ahora es `new URL("tiles/world-z6.pmtiles", document.baseURI)`; `tiles/` queda fuera del precache del SW (que además saltea esas peticiones `Range`) y del presupuesto de primera carga. Sin peticiones cross-origin, el bloqueo CORS desaparece.

**Nota (desvío del enunciado).** El smoke de CI servía la dist con `python3 -m http.server`, que **no soporta HTTP Range**: responde 200 con el archivo entero y el `fetch` de pmtiles se aborta (`ERR_ABORTED` → `requestfailed`), así que el smoke habría seguido rojo aunque el CORS estuviera resuelto. Como Pages sí soporta rangos, el paso del smoke (en `deploy-pages.yml`, sin tocar `web/smoke.mjs`) ahora levanta un servidor con Range para que el test refleje a Pages. Verificado el servidor con `curl` (200/206/416 correctos) antes de subirlo.

## E9.4 · Prueba manual con posición simulada ("Recorrer") no existe en la web — resuelto (SIM)

**Qué fallaba.** El paso 4 pide grabar 2 minutos con posición simulada usando "Recorrer" y luego
probar el portapapeles y el GPX en OpenCPN. En `web/` la acción `Recorrer` de la ficha
(`web/src/ui/app.ts`) solo encuadraba la ruta en la cámara (`fitTo`); **no había simulador de
posición**: no existía nada que produjera `PositionSource "simulated"` (solo estilos de color para
ese caso) ni velocidades x4/x16/x64, que eran de T3.7 en la app Kotlin. Además, en WSL no abro un
navegador (los browsers corren en CI, `web/smoke.mjs`).

**Resuelto (SIM, 2026-10-15).** Se implementó el simulador real de "Recorrer la ruta"
(`hn-sim`: ▶/⏸ · velocidad x4/x16/x64 · ↺ Reiniciar · avance `nnn / mmm nm` · ✕ Terminar), con
avance por `requestAnimationFrame` sobre `pointAlongTrack`, fuente de posición `simulated`,
pausa con la pestaña oculta, y restauración de la fuente anterior al terminar. La prueba manual de
2 minutos + OpenCPN queda para Diego/CI (sigue sin haber navegador en WSL), pero el flujo ya se
puede ejecutar de punta a punta en el navegador.

## E8.1 · Punto de validación de hielo (75 N, 0 E) no se cumple en la realidad — desvío autorizado

**Qué falla (en la spec).** El paso 4 de E8.1 exige "celda (75 N, 0 E) marzo: `ice` ≥ 15". Medido
sobre ERA5 `sea_ice_cover` media mensual 1991–2020, esa celda da **≈ 2 %**: es mar abierto del mar
de Groenlandia (el borde de hielo en 0° E en marzo está en ~78,5° N; `ice` ≥ 15 % recién en 79° N =
35,6 % y 80° N = 74,8 %). No es un error de la rejilla (tierra = 0 en `land_sea_mask`, lon 0° E
correcta): el punto elegido no tiene hielo.

**Qué hice (autorizado por Diego).** Se dejó el pipeline y los 12 `.bin` con el dato real, y se
movió **solo esa aserción** al punto válido más cercano, **(79 N, 0 E) marzo `ice` ≥ 15** (≈ 36 %),
que prueba lo mismo (que el campo de hielo existe y llega bien). El resto de las validaciones del
paso 4 quedan literales y pasan (15 N 60 W marzo: 14 kn, dir ≈ 81° ENE, constancia 97 %; Corriente
del Golfo > 0,8 kn en (35 N, 75 W); `tc` = 4 en (18 N, 65 W) septiembre).

**Decisión pendiente:** que Claude confirme el punto corregido en el ADR-009 §tarea E8.1.

## E12.1 · coordenada "Gibraltar (36 N, 5 W)" y concordancia con `landcheck.py` — desvío

**Qué falla (en la spec).**
- El paso 4 pide que **Gibraltar (36 N, 5 W) sea tierra**, pero ese punto cae en aguas del
  estrecho de Gibraltar: lo clasifican **mar** tanto la máscara nueva (Natural Earth 10m) como el
  `landcheck.py` existente (NE 110m). El Peñón está en **36,14 N, 5,35 W**. Usé esa cota real
  (sigue siendo "Gibraltar") en el test en lugar de la coordenada del enunciado.
- El paso 5 espera **≥ 99 %** de concordancia con `landcheck.py` "en los tramos del catálogo".
  Con la base de 10m la concordancia medida es **94,17 %** (212 423 puntos) y **todas** las
  diferencias caen a menos de una celda (0,1°) de la costa, donde la base de 10m es más fina que
  la de 110m; fuera de esa franja costera la concordancia es **100 %**. El script imprime el
  porcentaje y no corta la build, tal como pide el propio punto 5.

**Qué propongo.** Corregir la coordenada del test a 36,14 N / 5,35 W (o a otra cota terrestre del
Peñón) y fijar la concordancia sobre puntos a más de una celda de la costa (o bajar el umbral a
~94 % cuando la fuente es de 10m). Fuente usada: Natural Earth **10m** `ne_10m_land`.

**Resuelto (Claude, 2026-10-16):** acepto ambos desvíos. (1) Gibraltar: la coordenada del
enunciado (36 N, 5 W) cae en agua del estrecho; el test queda en el Peñón real (36,14 N, 5,35 W).
(2) Concordancia: el criterio pasa a ser **100 % a más de 0,1° de la costa**, sin exigencia dentro
de la franja costera (ahí la máscara 10m manda sobre la referencia 110m de `landcheck.py`); el
umbral de 99 % del enunciado estaba mal planteado contra una referencia más gruesa.

## E12.2 · umbral de `needsReview` y variantes que no se pueden sacar de tierra — desvío

**Qué falla (en la spec).** El paso 5 de E12.2 exige "ninguna variante cruza tierra con margen" y
`needsReview < 20`. Con el optimizador pedido (A* sobre la máscara 10m dilatada 1 celda ≈ 3 nm,
rodeo ≤ 15 %) quedan **28 variantes** que no se pueden sacar de tierra sin forzar canales no
navegables, así que el umbral no se alcanza tal como está escrito.

**Qué hice.**
- **Detector de cruces** (en `tools/landmask.py`): cuenta un cruce de tierra **solo si es interior**
  (ignora los tramos que tocan un extremo del tramo ruteado, es decir las aproximaciones a puerto).
  Sin esto el conteo nunca baja de 20 (los puertos están sobre tierra). La medición del build usa
  el resultado del propio optimizador (`ok` de `optimize_passes`), porque a margen 0 el detector
  marca aproximaciones a puerto como "cruces" que no lo son.
- **Tres pasadas** (`optimize_passes`): (1) margen 3 nm, rodeo ≤ 15 %; (2) **sin margen** (abre los
  pasos navegables entre islas), rodeo ≤ 15 %; (3) margen 3 nm, rodeo ≤ 50 %. Resultado: 751/779
  variantes resueltas, **28 `needsReview`** (rutas como AN104/AN115/IS16/PN74/PS17 que pasan por
  encima de Uruguay/islotes: acortar el rodeo exigiría canales que no existen).
- **Conteo real:** el catálogo tiene **400 rutas / 779 variantes** (la spec asumía 2 268; el "164"
  del ADR era con la máscara 110m). Se insertaron **2 090** waypoints `Costa 1..n`
  (`corrected:true`), alineados 1:1 con `routes.geojson` (779 features, 0 desalineados).

**Decisión pendiente:** aceptar el umbral real (**28**, documentado) o ampliar el rodeo/afinar la
rejilla (con margen 0 + rodeo 300 % + celda 0,05° baja a 17, pero a costa de rutas mar adentro
poco realistas). Los 3 waypoints del libro intactos en todas las variantes.

**Resuelto (Claude, 2026-10-16):** acepto el resultado tal como está. (1) El detector de cruces
"solo interior" es la semántica correcta: una ruta que termina en un puerto toca tierra en su
extremo por naturaleza; eso nunca fue un cruce. (2) Las tres pasadas del optimizador quedan como
diseño definitivo. (3) El umbral real es **28 de 779 (3,6 %)** con `needsReview` visible (⚑ y nota
azul de §5.8): ese es exactamente el mecanismo previsto para los casos dudosos, y la alternativa
que baja a 17 produce rutas mar adentro irreales — peor producto para ganar un número. El < 20 del
enunciado era mi estimación, no un requisito del producto. (4) Quedan registrados los conteos
reales: 400 rutas / 779 variantes (la spec citaba 2 268, que era el conteo viejo del backlog).


