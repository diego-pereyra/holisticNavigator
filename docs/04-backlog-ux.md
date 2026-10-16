# Backlog técnico de usabilidad — para Big Pickle

**Estado:** **Listo para ejecutar.** Las preguntas de espíritu de [`03-ux-architecture.md §9`](03-ux-architecture.md)
están todas resueltas por Diego (2026-10-13): la app abre en *Aquí*; tabla de waypoints y exportación
GPX con atribución; APK Capacitor como P-H.
**Fecha:** 2026-10-13 · **Orden:** las épicas van en el orden listado; dentro de cada épica, las tareas
también. E0 es prerrequisito de todo lo demás.

Convenciones:
- Cada tarea tiene **archivos**, **qué hacer** y **aceptación** (verificable a mano o por test).
- Rutas relativas a la raíz del repo. `commonMain` = `composeApp/src/commonMain/kotlin`,
  `jsMain` = `composeApp/src/jsMain/kotlin`.
- La lógica pura nueva (parsers, resolver de contexto, formateo de coordenadas) va a
  `shared/src/commonMain/kotlin` con tests en `shared/src/commonTest/kotlin`. `composeApp` solo UI.
- Cada épica termina con build de producción + checklist de §8 del documento de arquitectura +
  revisión contra las **12 reglas de usabilidad a bordo** (§6 ter) sobre capturas de 390 px y 1366 px.
  Toda tarea que agrega UI debe decir en su commit qué reglas de §6 ter toca y cómo las cumple.
- Commits pequeños, un commit por tarea, mensaje en español como los existentes.

## Nombres fijos (no inventar otros)

| Cosa | Nombre |
|---|---|
| Claves del store | `hn.imported`, `hn.seenHelp`, `hn.position`, `hn.month`, `hn.active`, `hn.voyage.current`, `hn.voyage.archive`, `hn.nhc`, `hn.settings`, `hn.myRoutes`, `hn.tiles.<zona>` |
| Ids de capas del mapa (orden de abajo arriba) | `background`, `bathy-fill`, `country-fill`, `country-line`, `coast-line`, `graticule-line`, `graticule-label`, `country-label`, `city-dot`, `city-label`, `basin-label`, `detail-*` (PMTiles), `seamarks`, `wx-field`, `wx-waves`, `wx-isobars`, `wx-isobar-labels`, `wx-arrows`, `wx-arrows-head`, `wx-current-head`, `wx-waves-head`, `wx-isochrones`, `catalog-lines`, `route-lines`, `route-active`, `route-opt` (propuesta de enrutado, punteada), `route-wps`, `route-wp-labels`, `voyage-line`, `measure-line`, `cog-vector`, `range-rings`, `nav-to-wp`, `nav-wp-halo`, `nav-wp`, `storms`, `storm-labels`, `my-accuracy`, `my-halo`, `my-dot`, `mob` |
| Colores | océano `#0b1626` · tierra `#1c2733` · costa `#3a4a5a` · retícula `#17202b` · catálogo `#4FC3F7` α0,25 · ruta seleccionada `#4FC3F7` α0,6 · ruta activa `#4FC3F7` 2,5 px · waypoint `#FFCC80` · navegación `#00E676` · track `#FFD54F` · GPS `#2979FF` · manual `#B388FF` · simulada `#FF8F00` · alarma/MOB `#FF1744` · info `#80CBC4` · texto secundario `#9FB0C0` · mejor época `#2E7D32` · tormentas `#C62828` |
| Estados | `PositionSource { Gps, Manual, Simulated }` · `PositionStatus { Off, Searching, Fixed, Denied, Unavailable }` · `UiMode { Plan, Navigate }` · `Theme { Day, Night, Red, Auto }` · `SheetState { Peek, Half, Full }` |
| Composables | `ContextBar`, `Sheet`, `HereTab`, `CatalogTab`, `RouteSheet`, `VoyageTab`, `NavStrip`, `MonthStrip`, `MapControls`, `Help`, `UndoBar`, `AlarmBand` |
| Lógica pura (`shared`) | `Context.kt`, `Kinematics.kt`, `CoordParse.kt`, `CoordFormat.kt`, `Sun.kt`, `Navigation.kt` (movido), `Windows.kt` (espejo Kotlin del parser solo si hace falta en runtime; por defecto **no**: los meses ya vienen en el catálogo) |
| Versiones | `CATALOG_VERSION` sube en 1 en cada cambio de datos; `HN_CACHE` lo escribe el build (`hn-<sha>`), nunca a mano |
| Tamaños | hoja: peek 96 dp · half 50 % · full 92 % · panel escritorio 400 dp · umbral compact 700 px · toques 44 dp (Plan) / 56 dp (Navigate) · tipografía Navigate 24 sp / 40 sp |
| Umbrales | SOG para Navigate 0,5 kn / 2 min · desvío alarma 2 nm · llegada 1 nm · fondeo 50 m · deshacer 8 s · pulsación larga 600 ms · posición vieja 30 s · aviso viejo 6 h / 24 h · rutas cercanas 600 nm / máx. 8 |

---

## E0 · Catálogo v3: el contrato de datos que la UI necesita

### T0.1 Higiene del repo
**Archivos:** `.gitignore`, `tools/__pycache__/`
**Qué:** agregar `__pycache__/` y `*.pyc` al `.gitignore`; `git rm -r --cached tools/__pycache__`.
**Aceptación:** `git status` limpio tras ejecutar cualquier `tools/*.py`.

### T0.2 Parser de ventanas de meses (Python, con tests)
**Archivos:** `tools/windows.py` (nuevo), `tools/tests/test_windows.py` (nuevo)
**Qué:** `parse_window(text: str) -> Window` donde `Window = {en: str, es: str, months: list[int], zones: list[{label, months}]}`.
Gramática a cubrir (corpus real: 92 frases distintas de `bestTime`, 38 de `tropicalStorms` en
`data/epub/routes_v2.json`):
- `June to October`, `December to April` (rango que cruza el año → `[12,1,2,3,4]`), `April`,
  `June, October`, `June, September to October`, `Late May to mid-August` (→ `[5,6,7,8]`; los
  modificadores *early/mid/late* no cambian los meses incluidos pero sí el texto),
  `May to July, September to December`, `All year` (→ 1..12), `None` (→ `[]`).
- Paréntesis con sub-zona: `November to May (South Indian Ocean), April to July, September to
  December (North Indian Ocean)` → `months` = unión; `zones` = cada tramo con su etiqueta. La UI
  muestra la unión en la tira y el texto completo debajo.
- Traducción determinista al español: meses, `to` → `a`, `early` → `principios de`, `mid-` →
  `mediados de`, `late` → `finales de`, `all year` → `todo el año`, `None` → `sin temporada`,
  etiquetas de zona traducidas por tabla (South Indian Ocean → Índico Sur, etc.).
- Frase no reconocida → `months=[]`, `es=""`, se conserva `en` y el test lo reporta; **el build no
  debe fallar** por una frase nueva.
**Aceptación:** el test recorre **todas** las frases distintas del EPUB y afirma que ninguna queda
sin reconocer; casos unitarios para cada regla de arriba.

### T0.3 Facts v3
**Archivos:** `tools/build_v2_catalog.py` (emite a `data/catalog/v3/`), `scripts/sync-catalog.sh`
**Qué:** cada línea de `facts/{CAP}.jsonl` pasa a:
```jsonc
{
  "code": "AN12", "title": "Europe to North America (southern routes)",
  "chapter": "AN", "region": "Atlántico Norte",
  "from": "Falmouth", "to": "Newport",            // de la variante A
  "when": {
    "bestEn": "Late May to mid-August", "bestEs": "finales de mayo a mediados de agosto",
    "bestMonths": [5,6,7,8],
    "stormsEn": "June to November", "stormsEs": "junio a noviembre", "stormMonths": [6,7,8,9,10,11],
    "zones": [ { "label": "Índico Norte", "months": [4,5,6,7,9,10,11,12] } ]   // solo si hay paréntesis
  },
  "charts": ["BA 4011", "US 121"], "guides": ["Atlantic Crossing Guide", "..."], "planner": ["A15a Voyages from Northern Europe"],
  "variants": [
    { "id": "AN12A", "from": "Falmouth", "to": "Newport", "nm": 3309, "coastal": false, "needsReview": true,
      "waypoints": [ { "name": "Falmouth", "lat": 50.0, "lon": -5.033333, "dest": false, "corrected": false }, ... ] }
  ],
  "tip": "...", "chapterTip": "...", "quoteEn": "...", "quoteEs": "...", "quoteSource": "...",
  "attribution": "World Cruising Routes, 8.ª ed. — Jimmy & Doina Cornell",
  "needsReview": true
}
```
Se eliminan del modelo de la app: `waypointCodes`, `printedPages`, `sourcePdfPages`, `charCount`,
`miles`, `monthsMentioned` (si se conservan en el archivo no importa; la app no los lee).
`nm` por variante = longitud ortodrómica del trazado (ya se calcula en `landcheck`/`build`).
**Aceptación:** 400 facts; `when.bestMonths` no vacío en ≥ 395; `variants[*].waypoints` coincide en
cantidad y orden con `routes.geojson`; `scripts/sync-catalog.sh` copia v3.

### T0.4 Índice v3
**Archivos:** `tools/build_v2_catalog.py`
**Qué:** cada entrada de `index.json` suma `from`, `to`, `nmMin`, `nmMax`, `variantCount`,
`bestMonths`, `stormMonths`, `bbox: [minLon, minLat, maxLon, maxLat]`. Se eliminan los `ports`
ruidosos ("Bay", "Strait N"): la búsqueda usa `from`, `to` y los nombres de waypoints **destino**
(`dest: true`) en un campo `searchNames`.
**Aceptación:** la lista puede mostrar `origen → destino`, millas e insignia de ventana sin cargar
facts; el índice pesa < 200 KB.

### T0.5 Cuencas
**Archivos:** `data/catalog/v3/basins.json` (nuevo), `tools/build_basins.py` (nuevo)
**Qué:** para cada una de las 13 regiones, una lista de cajas `[minLon, minLat, maxLon, maxLat]`
(solo cajas, nunca polígonos libres; el Pacífico se parte en dos cajas en el antimeridiano), `nhcBasins` (`AT` / `EP,CP` / ninguno) y `rsmc` (texto del
centro responsable: "NHC Miami", "CPHC Honolulu", "Météo-France La Réunion", "BoM Australia",
"RSMC Nadi (Fiji)", "JTWC / JMA", "IMD New Delhi"). Las tablas de ciclones por región de
`Recommendations.kt` migran aquí como `stormMonths` de respaldo.
**Aceptación:** test Python: el primer waypoint de ≥ 95 % de las variantes cae dentro del polígono de
su propia región; las excepciones se listan en la salida.

### T0.6 Modelos Kotlin y versión
**Archivos:** `commonMain/CatalogModel.kt`, `commonMain/Recommendations.kt`, `jsMain/Catalog.kt`
**Qué:** `RouteDetail`, `IndexEntry`, nuevos `RouteWhen`, `RouteVariant`, `Waypoint`, `Basin`;
`seasonFor(region)` pasa a leer `basins.json`; `CATALOG_VERSION = 10`.
**Aceptación:** compila; la ficha actual sigue funcionando con los campos nuevos (paso intermedio
antes de E3).

---

## E1 · Offline real

### T1.1 Mapa base empaquetado (ADR-005)
**Archivos:** `tools/build_basemap.py` (nuevo), `composeApp/src/jsMain/resources/basemap/land.geojson`,
`.../basemap/graticule.geojson`, `commonMain/BaseMap.kt` (nuevo), `commonMain/App.kt`
**Qué:**
- `build_basemap.py` copia `data/land/ne_110m_land.geojson` (136 KB) y genera la retícula de 10°
  (meridianos y paralelos como `LineString`, con `label` tipo `20°N`). Se ejecuta desde
  `scripts/sync-catalog.sh`.
- `BaseMap.kt` construye el JSON de estilo MapLibre: fuente `land` (`basemap/land.geojson`), fuente
  `graticule`, capas `background` (`#0b1626`), `land-fill` (`#1c2733`), `coast-line` (`#3a4a5a`,
  0.8 px), `graticule-line` (`#17202b`), `graticule-label` (symbol, `#44546a`, solo a zoom ≥ 2).
- `MaplibreMap(baseStyle = BaseStyle.Json(baseMapStyle()))`. Sin `BaseStyle.Demo`.
**Aceptación:** sin red, el mapa muestra costa y retícula idénticas a con red; no hay ninguna
petición a `demotiles.maplibre.org`.

### T1.2 Precache completo con manifiesto de build
**Archivos:** `scripts/sw-manifest.sh` (nuevo), `scripts/build-web.sh`, `scripts/package-web.sh`,
`.github/workflows/deploy-pages.yml`, `composeApp/src/jsMain/resources/service-worker.js`
**Qué:** tras el build, `sw-manifest.sh` lista en `sw-manifest.json` todos los archivos de la
distribución excepto `*.map`, `*.LICENSE.txt` y `service-worker.js`, y reemplaza en
`service-worker.js` el marcador `__HN_BUILD__` por el SHA corto de git (`HN_CACHE = "hn-" + sha`).
El SW en `install` hace `addAll` del manifiesto (≈ 18 MB: JS + wasm + catálogo + basemap). Estrategia:
*cache-first* para todo lo del manifiesto; *network-first con fallback a caché* para `nhc.json` (y
cualquier URL fuera del manifiesto).
**Aceptación:** tras una carga en línea, en DevTools → Application → Cache Storage aparecen todos los
`facts/*.jsonl` y el basemap; recargar sin red abre cualquier ruta de cualquier capítulo.

### T1.3 Aviso de versión nueva
**Archivos:** `jsMain/ServiceWorker.js.kt`, `service-worker.js`, `jsMain/Catalog.kt`
**Qué:** escuchar `registration.updatefound` → cuando el SW nuevo está `installed` y hay controlador
activo, mostrar banda inferior "Hay una versión nueva · Actualizar". Al tocar: `postMessage('skip')`
→ SW `skipWaiting()` → `controllerchange` → `location.reload()`.
**Aceptación:** desplegar dos builds seguidos; la segunda muestra la banda sin cerrar la pestaña.

### T1.4 Chip de conexión
**Archivos:** `jsMain/Platform.js.kt` (expect/actual `rememberOnline(): Boolean`), `commonMain/App.kt`
**Qué:** `navigator.onLine` + eventos `online/offline`. Chip abajo a la izquierda junto a "? ayuda":
`En línea` / `Sin conexión · listo` (si el SW está activo) / `Sin conexión · caché incompleta`.
**Aceptación:** alternar modo avión cambia el chip sin recargar.

---

## E2 · La posición manda

### T2.1 Modelo de posición con estado visible
**Archivos:** `commonMain/Position.kt`, `jsMain/Position.js.kt`, `desktopMain/Position.desktop.kt`
**Qué:** `sealed class PositionSource { Gps; Manual(lat, lon); Simulated }`,
`enum PositionStatus { Off, Searching, Fixed, Denied, Unavailable }`,
`data class PositionState(fix: NavPosition?, source, status)`. `rememberDevicePosition` devuelve el
estado completo; los errores de `watchPosition` (`code` 1 = Denied, 2/3 = Unavailable) van al estado,
no a `println`. Última fija GPS y posición manual se guardan en el store (`hn.position`).
**Aceptación:** sin permiso → `Denied`; en escritorio sin geolocalización → `Unavailable`; al abrir la
app sin red ni GPS se restaura la última posición conocida con etiqueta "última conocida".

### T2.2 Posición manual
**Archivos:** `shared/.../CoordParse.kt` (nuevo, con tests), `commonMain/App.kt`, `jsMain/Catalog.kt`
**Qué:** menú del chip de posición: *Usar GPS · Fijar en el mapa · Escribir coordenadas · Apagar*.
"Fijar en el mapa" arma un modo de un toque (banda "Tocá el mapa para fijar tu posición · Cancelar").
"Escribir coordenadas" abre un diálogo que acepta `15.5 -60.2`, `15°30'N 60°12'W`,
`15 30.0 N 60 12.0 W`, `15°30.5'N, 060°12.0'W`; muestra la interpretación antes de aceptar.
`parseCoordinates(text): Pair<Double, Double>?` en `shared` con ≥ 12 casos de test (incluye
negativos, S/W, sin símbolos, con comas).
**Aceptación:** los cuatro formatos fijan la misma posición ±0,01°; el marcador manual es visualmente
distinto del GPS (sin círculo de precisión, color violeta).

### T2.3 Resolver de contexto (lógica pura, con tests)
**Archivos:** `shared/.../Context.kt` (nuevo), `shared/src/commonTest/.../ContextTest.kt`
**Qué:**
```kotlin
data class NearbyRoute(val code: String, val variant: String, val distanceNm: Double, val nearestWp: String)
data class Context(val region: String?, val nhcBasins: Set<String>, val rsmc: String?,
                   val stormMonths: Set<Int>, val inStormSeason: Boolean,
                   val nearby: List<NearbyRoute>)
fun resolveContext(lat: Double, lon: Double, month: Int, basins: List<Basin>,
                   variants: List<VariantGeometry>): Context
```
`region` = primer polígono de `basins.json` que contiene el punto (point-in-polygon, antimeridiano
seguro). `stormMonths` = unión de `stormMonths` de las rutas de esa región (respaldo: el de la
cuenca). `nearby` = distancia mínima punto→polilínea (reutilizar `project()` de `Navigation.kt`,
movido a `shared`) para todas las variantes; hasta 8 con distancia ≤ 600 nm ordenadas; si ninguna,
las 3 más cercanas. Coste: 2 268 variantes × ~10 tramos, despreciable.
**Aceptación:** tests: Panamá (9.5, −79.6) → "Atlántico Tropical"; Fiji (−18, 178) y (−18, −179) →
"Pacífico Sur"; (36, −6) → "Atlántico Norte" con AN32 entre las cercanas; (−40, 10) → "Atlántico
Sur", `inStormSeason=false` en cualquier mes.

### T2.4 Barra de contexto y tab Aquí
**Archivos:** `commonMain/ContextBar.kt` (nuevo), `commonMain/HereTab.kt` (nuevo), `jsMain/Catalog.kt`
**Qué:** según §3.1 y §3.2 "Aquí" del documento de arquitectura. La barra ocupa el `TopCenter`
(reemplaza al chip de saludo). **La app abre siempre en el tab Aquí** (decisión 1 del §9), con la hoja
en estado `Half` en móvil y el panel abierto en escritorio; `?route=` en la URL abre la ficha encima. Sin posición: `📍 Sin posición · OCT ▾` y Aquí muestra las tres
formas de fijarla como botones grandes.
**Aceptación:** escenario §8.3 del documento de arquitectura.

### T2.5 Mes de planificación
**Archivos:** `commonMain/Planning.kt` (nuevo), `commonMain/ContextBar.kt`
**Qué:** `var planningMonth by remember { mutableStateOf(currentMonthUtc()) }` elevado a
`HolisticApp`, persistido en `hn.month` con la fecha de guardado (si pasaron > 7 días vuelve al
actual). Selector: hoja con 12 chips + botón "Hoy". Cambiarlo recalcula barra, Aquí, insignias de la
lista y la tira de la ficha.
**Aceptación:** elegir marzo con posición en Canarias muestra `—` o `✔` según `bestMonths` de cada
ruta cercana; "Hoy" vuelve al mes actual.

### T2.6 Ruta activa ("Seguir")
**Archivos:** `commonMain/App.kt`, `jsMain/Catalog.kt`
**Qué:** `activeRoute: Pair<code, variant>?` persistido en `hn.active`. Botón **Seguir** en la ficha
y en la tira peek; **Dejar de seguir** cuando está activa. El bloque de navegación (próximo
waypoint, rumbo, distancia, "desvío 0,3 nm a estribor", "tramo 3 de 8") solo aparece con ruta
activa y posición. Seleccionar para ver ≠ seguir.
**Aceptación:** explorar el catálogo no muestra navegación; "Seguir" sí; tras recargar sigue activa.

---

## E3 · Ficha de ruta

### T3.1 Hoja inferior / panel con navegación interna
**Archivos:** `commonMain/Sheet.kt` (nuevo), `jsMain/Catalog.kt` (se parte: `CatalogTab.kt`,
`RouteSheet.kt`, `VoyageTab.kt`)
**Qué:** en ancho < 700 px: hoja inferior con tres alturas (peek 96 dp · media 50 % · completa 92 %)
arrastrable y con tabs `Aquí · Rutas · Travesía`; el mapa queda visible en peek y media. En ancho
≥ 700 px: panel izquierdo de 400 dp con los mismos tabs. La ficha se abre *dentro* del tab Rutas y
tiene `‹ Rutas` para volver; ocupa toda la altura disponible con scroll (sin `heightIn(max=320)`).
El `fitPadding` del mapa usa la altura real de la hoja (abajo) o el ancho del panel (izquierda).
**Aceptación:** en 390 px con la hoja en peek, ≥ 60 % del mapa visible; en media, la ruta
seleccionada se ajusta a la parte visible del mapa.

### T3.2 Cabecera, acciones y variantes
**Archivos:** `RouteSheet.kt`
**Qué:** según §5.1, §5.2, §5.5. Las variantes son filas (no chips) con `A · Falmouth → Newport ·
3309 nm`; una sola variante no muestra selector.
**Aceptación:** AN12 muestra tres filas con millas distintas; tocar una resalta solo esa.

### T3.3 Bloque "Cuándo" con tira de meses
**Archivos:** `commonMain/MonthStrip.kt` (nuevo), `RouteSheet.kt`
**Qué:** composable `MonthStrip(best: Set<Int>, storms: Set<Int>, planning: Int)`: 12 celdas de
≥ 24 dp con inicial del mes, verde `#2E7D32` para `best`, rayado rojo `#C62828` para `storms`
(si un mes es `best` y `storms` a la vez: mitad superior verde, mitad inferior roja), borde claro en `planning`. Textos debajo según §5.3; si
`when.zones` no está vacío, el texto completo en inglés traducido se muestra tal cual del campo `es`.
Sin datos de ruta → tabla de cuenca y sufijo "(estimación por cuenca)".
**Aceptación:** AN14 ("Late May to mid-August" / "None") → 4 celdas verdes, ninguna roja; IS13C →
rojo nov–abr; PT con `All year` → 12 rojas.

### T3.4 Tabla de waypoints
**Archivos:** `shared/.../CoordFormat.kt` (nuevo, con tests), `RouteSheet.kt`
**Qué:** `formatLat(50.0) == "50°00.0'N"`, `formatLon(-5.033333) == "005°02.0'W"`. Filas: `#`,
nombre, lat, lon, `●` destino, `⚑` corregido (tooltip). Tocar → `animateCameraTo(wp, zoom 6)` y
resaltar ese punto 2 s.
**Aceptación:** tests de formato (0, negativos, redondeo a 0,1'); tocar un waypoint centra el mapa.

### T3.5 Referencias y nota de trazado
**Archivos:** `RouteSheet.kt`
**Qué:** `Cartas · BA 4011, US 121`, `Guías · …`, `Planificador · …` (solo si no vacíos). `needsReview`
→ texto informativo azul según §5.8; nunca rojo. Eliminar `Waypoints: n (codes…)`, `Millas: …`, y la
línea "8.ª edición · waypoints GPS reales" del catálogo (pasa a la ayuda).
**Aceptación:** ninguna ficha muestra códigos en minúscula ni listas de millas sin etiqueta.

### T3.6 Exportar GPX de una ruta
**Archivos:** `commonMain/Gpx.kt` (`routeToGpx`), `jsMain/Download.js.kt`
**Qué:** `<gpx>` con `<metadata><copyright author="Jimmy & Doina Cornell"><license>World Cruising
Routes, 8.ª ed. — uso personal</license></copyright></metadata>` y un `<rte>` por variante elegida
(`<rtept lat lon><name>Falmouth</name><desc>destino</desc>`). Nombre de archivo
`AN12A-Falmouth-Newport.gpx`. Descarga por `Blob` + `URL.createObjectURL` (no `data:` URI; también
para la bitácora).
**Aceptación:** el archivo abre en OpenCPN/Navionics con los waypoints nombrados.

### T3.7 "Recorrer la ruta" (simulador reubicado)
**Archivos:** `RouteSheet.kt`, `commonMain/App.kt`
**Qué:** el simulador sale del panel flotante y pasa a la ficha: `Recorrer ▶` abre una fila
`⏸ · velocidad x4 / x16 / x64 · reiniciar · 123 / 3309 nm`. Al iniciar, `PositionSource` pasa a
`Simulated`; al detener vuelve la fuente anterior. Marcador ámbar y chip de posición `simulada`.
Corregir el bug de precedencia en `App.kt`: en simulación hoy no se muestran las coordenadas
(`if (simOn) "SIMULACIÓN  " else "Mi posición  " + …`).
**Aceptación:** no queda ningún control de simulador fuera de la ficha; detener restaura el GPS.

### T3.8 Enlace profundo
**Archivos:** `jsMain/Catalog.kt`
**Qué:** al cambiar selección, `window.history.replaceState(null, "", "?route=AN12&variant=AN12B")`
(o sin query si se deselecciona). Botón `Enlace` copia la URL al portapapeles y confirma "Enlace
copiado".
**Aceptación:** recargar conserva ruta y variante; abrir el enlace en otro dispositivo abre la ficha.

---

## E4 · Mapa explorable

### T4.1 Capa de catálogo
**Archivos:** `commonMain/App.kt`, `jsMain/Catalog.kt`
**Qué:** nueva `LineLayer("catalog-lines")` con **todas** las variantes del filtro vigente (cuenca,
búsqueda, "cerca de mí") en `#4FC3F7` alpha 0,25, ancho 1 px; clicable (selecciona). Encima,
`route-lines` (variantes de la ruta seleccionada, alpha 0,6) y `route-active` (variante elegida,
2,5 px). Con el filtro "Todas" y sin búsqueda se dibujan las 2 268 (una sola fuente GeoJSON, sin
`cluster`, sin `tolerance` custom). Si el rendimiento en móvil resulta inaceptable, **no se cambia el
diseño**: se anota en `BLOCKERS.md` con la medición y se sigue con la tarea siguiente.
**Aceptación:** con el chip "Pacífico Sur", el mapa muestra solo rutas PS y tocar cualquiera abre su ficha.

### T4.2 Waypoints con nombre
**Archivos:** `commonMain/App.kt`
**Qué:** `FeatureCollection` de puntos para la variante activa: `CircleLayer` (destino 6 dp, resto
4 dp) + `SymbolLayer(textField = name, textSize 11, textOffset (0, 1.2), textHaloColor #0b1626,
textAllowOverlap = false)`.
**Aceptación:** AN11A muestra "Falmouth … Halifax" legibles; sin solapes ilegibles a zoom 3.

### T4.3 Cámara predecible
**Archivos:** `commonMain/App.kt`
**Qué:** ajustar la cámara solo al cambiar ruta/variante o al tocar un waypoint; al abrir/cerrar la hoja,
cambiar el `fitPadding` **sin** animar ni re-encuadrar (hoy `LaunchedEffect(catalogOpen)` pelea con
el usuario). En el tab Aquí, botón "Ver rutas cercanas" encuadra posición + rutas listadas.
**Aceptación:** abrir y cerrar la hoja no mueve el mapa si el usuario ya lo desplazó.

### T4.4 Marcador con rumbo y avisos
**Archivos:** `commonMain/App.kt`
**Qué:** si `headingDeg != null`, dibujar un triángulo orientado en lugar del punto. Tormentas activas
(E7) como `CircleLayer` roja + `SymbolLayer` "IAN · 85 kt".
**Aceptación:** con heading, el marcador gira; sin heading, punto.

---

## E5 · Travesía (bitácora) que sobrevive

### T5.1 Store asíncrono
**Archivos:** `commonMain/Platform.kt`, `jsMain/Platform.js.kt`, `desktopMain/Platform.desktop.kt`
**Qué:** `expect class KeyValueStore { suspend fun get(key): String?; suspend fun put(key, value);
suspend fun remove(key) }`. JS: IndexedDB (base `hn`, store `kv`), con fallback a `localStorage` si
falla la apertura. Migrar `hn.imported`, `hn_seen_help`, `hn.position`, `hn.month`, `hn.active`.
**Aceptación:** test manual: 100 000 puntos de track se guardan y restauran sin error de cuota.

### T5.2 Persistencia y estado visible
**Archivos:** `commonMain/Voyage.kt`, `VoyageTab.kt`, `commonMain/ContextBar.kt`
**Qué:** autosave al llegar a 20 puntos nuevos y, además, cada 30 s si hay al menos 1 punto nuevo; `recording` persistido (al reabrir con GPS sigue grabando);
chip `● 12,3 nm` en la barra de contexto mientras graba. Borrar pide confirmación.
**Aceptación:** grabar, recargar, seguir grabando: el track es continuo; nada se pierde.

### T5.3 Notas
**Archivos:** `commonMain/Voyage.kt`, `VoyageTab.kt`, `commonMain/Gpx.kt`
**Qué:** `Note(t, lat, lon, text)`; botón `+ Nota` (diálogo de una línea); línea de tiempo en el tab;
exportación GPX como `<wpt>` con `<time>` y `<desc>`.
**Aceptación:** una nota escrita sin red aparece tras recargar y en el GPX exportado.

### T5.4 Varias travesías
**Archivos:** `commonMain/Voyage.kt`, `VoyageTab.kt`
**Qué:** `Nueva travesía` archiva la actual (nombre editable, fechas, nm); lista de anteriores con
Exportar y Borrar (confirmación).
**Aceptación:** dos travesías conviven; exportar cada una da un GPX distinto.

---

## E6 · Controles, idioma y limpieza

### T6.1 Chip de posición con estados y menú
**Archivos:** `commonMain/ContextBar.kt`
**Qué:** estados de T2.1 con texto y color; menú de T2.2.
**Aceptación:** cada estado se puede provocar y se ve distinto.

### T6.2 Respuesta al cambio de tamaño
**Archivos:** `jsMain/Catalog.kt`
**Qué:** `compact` sale de un `mutableStateOf` actualizado por `window.addEventListener("resize")`
(con `DisposableEffect`), no de `window.innerWidth` leído en composición.
**Aceptación:** girar el teléfono o redimensionar la ventana cambia el layout sin recargar.

### T6.3 Objetivos táctiles y textos
**Archivos:** todos los composables de UI
**Qué:** `minHeight = 44.dp` en chips, filas y botones; reemplazos de texto: `XTE` → `desvío`,
`der/izq` → `estribor/babor`, `tramo 3` → `tramo 3 de 8`, `◉` → icono + "Centrar", `↺` →
"Reiniciar", `⋯ controles` desaparece. Eliminar el chip de saludo y `sharedGreeting()`.
**Aceptación:** inspección visual en 390 px; ninguna cadena de la lista anterior sigue en pantalla.

### T6.4 Ayuda de primer uso
**Archivos:** `jsMain/Catalog.kt` (→ `commonMain/Help.kt`)
**Qué:** reescribir con el modelo de tres entradas: *Posición* (GPS, fijada, escrita) · *Mes* ·
*Ruta* (ver, seguir, recorrer, exportar); "Funciona sin conexión: agregala a la pantalla de inicio";
atribución y edición del libro; versión del build (SHA) al pie.
**Aceptación:** cabe en una pantalla de 390 × 844 sin scroll.

### T6.5 Documentación alineada
**Archivos:** `README.md`, `docs/02-content.md`
**Qué:** estado real del proyecto; 8.ª edición como fuente de datos; quitar la referencia a `relay/`
inexistente (se crea en E7; hasta entonces el README dice "pendiente").
**Aceptación:** ningún documento contradice el código.

---

## E7 · Avisos NHC reales (ADR-006)

### T7.1 Relay por rama `data`
**Archivos:** `.github/workflows/relay-nhc.yml` (nuevo), `relay/fetch_nhc.py` (nuevo)
**Qué:** cron cada 15 min; `fetch_nhc.py` lee `CurrentStorms.json` y `index-{at,ep,cp}.xml`, produce
el esquema 1 del ADR-003 (`storms[]`, `advisories[]`, `fetchedAt`) y lo escribe en la rama `data`
como `nhc/nhc.json` **solo si cambió**. Si NHC falla, no se toca el archivo (queda el último bueno) y
el job termina en verde con aviso.
**Aceptación:** `https://raw.githubusercontent.com/diego-pereyra/holisticNavigator/data/nhc/nhc.json`
responde con `access-control-allow-origin: *` y `fetchedAt` reciente.

### T7.2 Repositorio de avisos en la app
**Archivos:** `commonMain/Nhc.kt` (nuevo), `jsMain/Catalog.kt`
**Qué:** `NhcRepository.refresh()`: fetch con timeout 8 s a la URL de T7.1; guardar en el store con
`fetchedAt`; en fallo, usar lo guardado; si no hay nada, el `nhc.json` empaquetado. Exponer
`ageMinutes`. Refrescar al abrir, al volver en línea y cada 30 min.
**Aceptación:** Aquí muestra "avisos de hace 12 min" en línea y "sin conexión · últimos avisos de
hace 2 d" sin red.

### T7.3 Avisos en Aquí y en la ficha
**Archivos:** `HereTab.kt`, `RouteSheet.kt`, `commonMain/App.kt`
**Qué:** tormentas de la cuenca del usuario con distancia a su posición; en la ficha, tormentas de las
cuencas NHC de la ruta; marcadores en el mapa (T4.4). Fuera de cobertura: texto con el `rsmc` de
`basins.json`.
**Aceptación:** con un `nhc.json` de prueba con una tormenta en (20, −60), Aquí la lista con distancia
y el mapa la dibuja.

---

## E8 · Viento y corriente mensual (solo diseño en este ciclo)

### T8.1 ADR-009 "Pilot charts y clima descargable" — escrita; tareas E8.1–E8.4 y E13.1–E13.2 en el ADR
**Archivos:** `docs/adr/007-climatology.md` (nuevo)
**Qué:** proponer fuente abierta (candidatas: medias mensuales ERA5 de viento a 10 m, Copernicus, con
atribución; climatología de corrientes OSCAR, NASA, dominio público), rejilla 2°, 12 meses, `u/v` en
`int8` → ≈ 0,8 MB por variable; formato: PNG de 180×90 con `u` en R y `v` en G (sin binario propio); render como `SymbolLayer` de
flechas por celda con color por intensidad; selector = mes de planificación (T2.5); presupuesto de
tamaño total ≤ 3 MB; licencia y atribución en la ayuda.
**Aceptación:** ADR revisado por Diego antes de implementar.

---

## E9 · Seguir la ruta y seguridad (capas 1–2 de §6 bis: "casi un plotter")

### T9.1 Cinemática: SOG, COG, VMG, ETA
**Archivos:** `shared/.../Kinematics.kt` (nuevo, con tests), `commonMain/App.kt`
**Qué:** a partir de las últimas fijas (ventana 60 s): velocidad sobre el fondo (usar `speedMps` del
GPS si existe, si no derivarla de posiciones), rumbo sobre el fondo, VMG hacia el próximo waypoint,
ETA al próximo waypoint y al destino (suma de tramos restantes / SOG media). Sin movimiento → "—".
**Aceptación:** tests con una serie sintética a 6 kn; ETA coherente al minuto.

### T9.2 Pantalla "Navegando" en la tira peek
**Archivos:** `commonMain/Sheet.kt`, `commonMain/NavStrip.kt` (nuevo)
**Qué:** con ruta activa y posición, la tira peek muestra en tipografía grande:
`Sable · 212° · 418 nm · ETA mié 14:30` y debajo `desvío 0,8 nm estribor · SOG 6,2 kn · tramo 4 de 8`.
Alto contraste; opción "modo noche rojo" (paleta roja sobre negro) en Aquí → Ajustes.
**Aceptación:** legible en 390 px a un metro; cambia de waypoint al pasar el radio de llegada.

### T9.3 Alarmas de desvío, llegada y fondeo
**Archivos:** `commonMain/Alarms.kt` (nuevo), `jsMain/Platform.js.kt` (sonido via `AudioContext`,
`navigator.vibrate`), `HereTab.kt` (ajustes)
**Qué:** ajustes persistidos: desvío máximo (por defecto 2 nm), radio de llegada (por defecto 1 nm),
fondeo on/off con radio (por defecto 50 m) tomando la posición al activar. Al disparar: sonido
repetido + vibración + banda roja persistente hasta "Silenciar". Advertir en la ayuda que en Web
las alarmas solo funcionan con la app abierta.
**Aceptación:** simular con "Recorrer" una ruta y un desvío manual → la alarma suena; fondeo con
posición manual movida 80 m → suena.

### T9.4 Hombre al agua (MOB) y pantalla encendida
**Archivos:** `commonMain/App.kt`, `commonMain/Alarms.kt`, `jsMain/Platform.js.kt`
**Qué:** botón **MOB** siempre visible sobre el mapa (rojo, 56 dp, con confirmación de 1 s de
pulsación larga para evitar toques accidentales): guarda la posición y hora, crea un waypoint "MOB
14:32", lo pone como objetivo de navegación (rumbo, distancia, tiempo transcurrido en grande) y
dispara alarma. Se cancela desde la misma banda. `navigator.wakeLock.request('screen')` mientras hay
ruta activa, fondeo o MOB; liberar al salir.
**Aceptación:** pulsación larga marca MOB y la tira muestra rumbo de vuelta; la pantalla no se apaga
mientras se navega (probar en Android Chrome).

### T9.6 Modo Navegar automático y deshacer
**Archivos:** `commonMain/Sheet.kt`, `commonMain/NavStrip.kt`, `commonMain/Undo.kt` (nuevo)
**Qué:** cambio automático Planificar ↔ Navegar según §6 ter (ruta activa + SOG ≥ 0,5 kn durante
2 min, fondeo o MOB); forzable con un toque en la tira. En Navegar: hoja en peek, tipografías 24/40 sp,
controles del pulgar en el tercio inferior (lado derecho por defecto; ajuste "Mano izquierda" en Ajustes), sin campos de texto ni modales.
`Undo.kt`: banda inferior "… · Deshacer" durante 8 s para quitar ruta, borrar waypoint propio,
detener grabación y silenciar alarma.
**Aceptación:** con "Recorrer" la app pasa sola a Navegar; parar el simulador la devuelve a
Planificar en 2 min; cada acción listada se deshace con un toque.

### T9.5 Parte diario
**Archivos:** `commonMain/Voyage.kt`, `VoyageTab.kt`
**Qué:** de la bitácora: millas últimas 24 h, velocidad y rumbo medios, millas totales, "faltan X nm ·
Y días al ritmo actual" si hay ruta activa. Botón "Copiar parte" (texto plano para enviar por
mensaje/satélite).
**Aceptación:** con un track sintético de 48 h, los números coinciden con el cálculo a mano.

---

## E10 · Carta de detalle (capa 3 de §6 bis · ADR-005 fase 2)

### T10.0 Batimetría en el piso
**Archivos:** `tools/build_basemap.py`, `composeApp/src/jsMain/resources/basemap/bathy.geojson`, `commonMain/BaseMap.kt`
**Qué:** descargar Natural Earth `ne_10m_bathymetry_*` (dominio público; polígonos 0, 200, 1000,
2000, 3000, 4000, 5000… m), simplificar con tolerancia 0,05° (Douglas-Peucker, `shapely.simplify`) y fusionar en un
GeoJSON con propiedad `depth` (límite duro 2 MB; si se supera, subir la tolerancia a 0,1°); `FillLayer`
con rampa fija `0:#13223a 200:#0f1d33 1000:#0c182b 2000:#0a1425 4000:#081120`; sin etiquetas de
profundidad. Entra en el precache.
**Aceptación:** sin red se ven plataformas continentales y fosas; el archivo pesa ≤ 2 MB.

### T10.1 Protocolo PMTiles en el target Web
**Archivos:** `composeApp/build.gradle.kts` (npm `pmtiles`), `jsMain/Main.kt`, `commonMain/BaseMap.kt`
**Qué:** registrar `pmtiles://` en `maplibregl` antes de crear el mapa; agregar al estilo base una
fuente vectorial `detail` apuntando a la URL fija de `tiles.json` (constante `TILES_INDEX_URL`) y las capas `water`, `land`,
`places`, `boundaries` con el estilo oscuro; atribución "© OpenStreetMap contributors · Protomaps"
visible en el mapa.
**Aceptación:** con el archivo mundial zoom 0–6 publicado, el mapa muestra países y ciudades;
sin el archivo, sigue el piso Natural Earth sin error.

### T10.2 Job de extracción y publicación
**Archivos:** `.github/workflows/tiles.yml` (nuevo), `tools/tiles/zones.json` (nuevo)
**Qué:** `pmtiles extract` del basemap de Protomaps: mundo z0–6 y recortes por zona definidos en
`zones.json` (una zona por cuenca del catálogo, misma caja que `basins.json`, z7–11); publicar
**siempre en GitHub Releases** (tag `tiles-YYYYMMDD`), con `tiles.json` índice (nombre, bbox, bytes,
sha256, url). Nunca en la rama `data` (reservada a NHC).
**Aceptación:** `tiles.json` accesible con CORS; cada archivo abre en `pmtiles show`.

### T10.3 Panel "Mapas sin conexión"
**Archivos:** `HereTab.kt` → sección Ajustes, `jsMain/Platform.js.kt` (Cache Storage / IndexedDB)
**Qué:** lista de zonas con tamaño y estado (no descargado / descargando % / listo); descarga a
**IndexedDB como un único Blob por zona** (nunca Cache Storage) y el protocolo `pmtiles://` lee
rangos del blob local si existe, si no de la red; borrar por zona.
**Aceptación:** descargar "Caribe", pasar a modo avión, hacer zoom a Portobelo: se ven puertos y
topónimos.

### T10.4 Balizas y luces (OpenSeaMap)
**Archivos:** `commonMain/BaseMap.kt`, `HereTab.kt` (Ajustes → capas)
**Qué:** `RasterSource` `https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png` como capa con
interruptor "Balizas" (apagada por defecto), visible solo a zoom ≥ 9 y solo con red; atribución
"© OpenSeaMap (CC BY-SA)". No se precachea.
**Aceptación:** con red y zoom en un puerto aparecen las balizas; sin red la capa desaparece sin error.

---

## E11 · Herramientas de carta (capa 4 de §6 bis)

### T11.1 Modo seguir y proa arriba
**Archivos:** `commonMain/App.kt`, `commonMain/MapControls.kt` (nuevo)
**Qué:** botón ◉ con tres estados: libre → centrado (sigue la posición) → proa arriba (centrado +
`bearing` de cámara = COG, con rosa de los vientos fija arriba a la izquierda que al tocarla vuelve a
norte arriba). Cualquier arrastre del usuario vuelve a "libre" y muestra un botón "Volver a seguir".
**Aceptación:** en "Recorrer" la cámara acompaña y gira; arrastrar la suelta.

### T11.2 Vector de rumbo y anillos de distancia
**Archivos:** `commonMain/App.kt`
**Qué:** línea desde la posición en dirección COG con marcas a 10, 30 y 60 min según SOG; anillos de
distancia alrededor de la posición con radio fijo por zoom: z ≤ 4 → 50 nm, z 5–7 → 10 nm, z 8–10 → 5 nm,
z ≥ 11 → 1 nm; interruptor en Ajustes, apagado por defecto.
**Aceptación:** a 6 kn el vector mide 6 nm en la marca de 60 min.

### T11.3 Medir
**Archivos:** `commonMain/MapControls.kt`
**Qué:** herramienta "Medir": tocar dos o más puntos → distancia por tramo y total, rumbo de cada
tramo, ETA al SOG actual; se dibuja en línea de puntos; "Limpiar". Útil para desvíos y abrigos.
**Aceptación:** medir entre dos waypoints de una ruta coincide con el `nm` del tramo ±1 %.

### T11.4 Waypoints y rutas propias
**Archivos:** `commonMain/MyRoutes.kt` (nuevo), `commonMain/Gpx.kt`, `RouteSheet.kt`, `CatalogTab.kt`
**Qué:** mantener pulsado el mapa → "Crear waypoint aquí" (nombre editable) o "Agregar a la ruta en
edición". Editor de rutas propias: nueva ruta vacía, **copiar una ruta de Cornell a mis rutas**
(los datos del libro no se tocan), arrastrar waypoints, insertar en un tramo, borrar, invertir,
renombrar; millas por tramo y total; guardar en el store; exportar/importar GPX. Las rutas propias
aparecen en el tab Rutas bajo "Mis rutas" y se pueden seguir y recorrer como las del libro.
**Aceptación:** copiar AN12A, mover un waypoint 20 nm y seguirla: la navegación usa la copia; el
original queda intacto; el GPX exportado abre en OpenCPN.

### T11.5 Temas Día / Noche / Rojo
**Archivos:** `commonMain/Theme.kt` (nuevo), `commonMain/BaseMap.kt`, `shared/.../Sun.kt` (nuevo, con tests)
**Qué:** tres paletas (UI y estilo de mapa): Día (fondo claro, datos ≥ 7:1), Noche (actual), Rojo
(rojo sobre negro). Selector de un toque en la tira y "Automático" por hora solar: salida/puesta
calculadas de la posición y la fecha (`Sun.kt`, algoritmo NOAA simplificado, test con Panamá y
Falmouth). Persistido.
**Aceptación:** contraste medido en los tres temas; en Rojo no hay ningún píxel blanco ni azul; el
automático cambia a Noche al anochecer en una posición simulada.

---

## Orden sugerido de entrega (commits)

Orden revisado tras la decisión "casi un plotter" (2026-10-13): lo que hace plotter (seguir ruta,
seguridad, carta) va antes que el tab Aquí.

1. T0.1 → T0.6 (catálogo v3; la app sigue funcionando)
2. T1.1 → T1.4 (offline real: piso de costa + precache + versión nueva)
3. T3.1 → T3.8 (hoja/panel y ficha; incluye Seguir, Exportar GPX, Recorrer)
4. T2.1 → T2.2 → T2.6 (modelo de posición, posición manual, ruta activa) — sin el tab Aquí todavía
5. T5.1 → T5.2 (store asíncrono y track persistente)
6. **T9.1 → T9.5** (SOG/COG/ETA, pantalla Navegando, alarmas, fondeo, MOB, Wake Lock, parte diario)
7. T10.0 (batimetría en el piso) → T4.1 → T4.4 (mapa explorable, waypoints con nombre, rumbo)
8. T2.3 → T2.5 → T2.4 (resolver de contexto, mes, tab Aquí)
9. T5.3 → T5.4 (notas, varias travesías) · T6.1 → T6.5 (limpieza)
10. T7.1 → T7.3 (avisos NHC reales)
11. T10.1 → T10.4 (PMTiles por zonas, balizas)
12. T11.1 → T11.5 (proa arriba, vector, medir, rutas propias, modo noche)
13. T8.1 (ADR climatología) · **ADR-010 Empaquetado Capacitor** (P-H, decidido; se escribe al cerrar E9)
14. **E12 Motor de enrutado** (ADR-008: máscara de tierra, arreglo de rutas que tocan tierra, polar, pronóstico Open-Meteo, isócronas en Web Worker, UI "Optimizar con el viento"). Depende de E8 y E11. Las capas de tiempo (T12.7) se adelantan justo después de E8.

Cada bloque termina con build de producción, prueba offline y prueba móvil (§8 del documento de
arquitectura).

## E14 · Cartas propias (pregunta de Diego, 2026-10-15: "¿podría aceptar cartas de OpenCPN?")

| Formato | Viabilidad | Cómo |
|---|---|---|
| GPX (rutas, waypoints) | hecho | importar / Enviar a plotter |
| PMTiles | fácil | "Importar carta" → blob en IndexedDB, protocolo `pmtiles://` existente, capa raster o vectorial según metadatos |
| MBTiles | fácil | igual, leyendo la SQLite con sql.js cargado bajo demanda (~600 KB) o pidiendo conversión a PMTiles |
| BSB/KAP, GeoTIFF (raster) | medio | `tools/charts/convert.py` (GDAL: reproyectar + teselar → PMTiles) que corre el usuario en su PC |
| S-57 ENC (.000) | medio/alto | mismo convertidor con GDAL (S57 → GeoJSON → teselas vectoriales) y un estilo S-52 mínimo (profundidades, peligros, boyas); zona "NOAA ENC EE. UU." publicada por nosotros (dominio público) |
| oeSENC / o-charts / CM93 | no | cifradas o legalmente grises |

Tareas, cuando toque: E14.1 Importar carta (PMTiles) · E14.2 MBTiles · E14.3 convertidor GDAL ·
E14.4 estilo S-52 mínimo y zona NOAA ENC.

## E15 · Integración con OpenCPN y el bus del barco (Diego, 2026-10-15)

| Tarea | Qué | Coste |
|---|---|---|
| E15.1 Capas GPX para OpenCPN | job que exporta el catálogo de Cornell como `layers/<cuenca>.gpx` (rutas con waypoints nombrados, atribución) publicados en Releases; instrucciones "copiá a la carpeta layers de OpenCPN" | bajo |
| E15.2 Cliente SignalK | `platform/signalk.ts`: conexión WebSocket a `ws://<ip>:3000/signalk/v1/stream` en la red del barco; fuente de posición "barco" (navigation.position, speedOverGround, courseOverGroundTrue), viento real (environment.wind.*), profundidad; descubrimiento por mDNS no (browser), IP manual en Ajustes | medio |
| E15.3 AIS desde SignalK | objetivos AIS (vessels.*) como capa `ais-targets` con rumbo, velocidad, nombre y CPA/TCPA simple; alarma de CPA | medio |
| E15.4 Plugin OpenCPN | plugin C++ (plantilla oficial) que muestra el planificador de salida y las pilot charts como panel y dibuja rutas de Cornell sobre cualquier carta, incluidas o-charts | alto, proyecto aparte |

No viable: embeber el motor de cartas de OpenCPN ni leer o-charts fuera de OpenCPN.


## E16 · Mareas y corrientes de marea sin red (camino al plotter)

Armónicos públicos (XTide `harmonics-dwf`, dominio público; ~5 000 estaciones) empaquetados por
zona (~50 KB por zona). `core/tides.ts`: predicción de altura y corriente por estación y hora
(suma de constituyentes), test contra tablas conocidas. UI: estaciones como capa `tide-station` desde
zoom 8; tocar una → curva del día y próximas pleamar/bajamar; en la ficha de puerto de destino, la
marea a la ETA. Tareas: E16.1 datos por zona · E16.2 motor y tests · E16.3 UI.

## Sesión y multiusuario (pregunta de Diego, 2026-10-16 — para más adelante)

Diego: "tengo que ver cómo manejo la sesión por usuario… ¿podría usar el login de GitHub?"

Para qué serviría: sincronizar rutas propias, ajustes y paquetes entre dispositivos; compartir
rutas. Hoy todo es local (IndexedDB) y la app funciona sin cuenta (ADR-002: sin backend).

| Opción | Qué exige | Veredicto |
|---|---|---|
| Sin login (hoy) | nada | MVP correcto: local-first, offline total |
| Archivos (GPX/JSON export/import) | nada | ya existe para rutas; extensible a ajustes |
| Login de GitHub (OAuth) | backend mínimo para el intercambio del código (GitHub deprecó el flujo implícito SPA) + nueva ADR que revise la 002 | no recomendado como principal: la audiencia son navegantes, no devs |
| Passkeys/WebAuthn | poco (device-bound, sin contraseñas) | si hiciera falta identidad por dispositivo |
| Backend liviano (Workers/Supabase) + email magic link / Google / Apple | nueva ADR + coste | la vía si algún día hay sync multi-dispositivo real |

Decisión: postergada. Antes de elegir mecanismo hay que definir QUÉ datos son por usuario
(rutas propias, ajustes, paquetes de pronóstico) y si la sincronización es requisito real del
producto. Hasta entonces: sin login.

## Opción futura, no decidida: camino a un plotter completo (orden posible tras E12)

E15.2 SignalK → E15.3 AIS → E14.1–E14.4 cartas propias y NOAA ENC → E16 mareas → E11 herramientas
de carta → ADR-010 Capacitor (segundo plano, NMEA TCP).

---
## UX pendiente — arquitectura de menús y usabilidad (sin prioridad)

Sugerencias de usabilidad para revisar cuando se tenga prioridad. Basadas en estándares IMO/ECDIS,
Google Maps, savvy navvy y Navionics, y en las 12 reglas de usabilidad a bordo (§6 ter de
03-ux-architecture.md).

**1. Jerarquía de navegación — pestañas principales**
- Aquí: posición actual, GPS, estado del barco, rutas cercanas. Pantalla de inicio por defecto.
- Rutas: catálogo, búsqueda, importar, planificar.
- Travesía: ruta activa, bitácora, alarmas, MOB.
Escritorio: tres columnas (lista | ficha | mapa). Móvil: hoja inferior con pestañas.

**2. Barra de contexto — acciones globales**
Solo acciones de toda la app: tema (☀️/☾/● Auto), tiempo (apagado / pilot chart / pronóstico),
capas (balizas, zonas), menú (⋮: ayuda, ajustes, acerca de). Nada que dependa de una pestaña
específica.

**3. FAB ◉ — acción primaria única**
Sin posición: "Encender GPS". Con posición: "Centrar en mí". En navegación: "Próximo WP". Un solo
botón; menú adicional solo al mantener presionado.

**4. Hoja inferior — tres estados**
Peek (96 dp) / Media (50 %) / Completa (92 %). El mapa nunca desaparece completamente.

**5. Ficha de ruta — jerarquía de información**
- Cabecera fija: código, título, origen → destino, botones (Seguir / Exportar / Recorrer / Enlace).
- Datos clave (rejilla): cuenca, millas, variantes, mejor época, ciclones, veredicto del mes.
- Tira de meses con score. Acordeones: Consejo · Variantes · Waypoints · Referencias · Del libro.

**6. Colores y contraste (WCAG 2.1 AA)**
Texto principal ≥ 4.5:1 sobre fondo. Rojo solo para noche (destruye la visión nocturna de día).
Colores de posición consistentes: GPS #2979FF · manual #B388FF · simulada #FF8F00.

**7. Feedback del sistema**
Pantalla de carga con progreso por pasos. Tiempo máximo 8 s, luego "Cargando…" con "Reintentar".
Errores en pantalla (banda inferior), no solo consola. Edad visible de los datos.

**8. Teclado y accesibilidad**
Esc cierra ficha. / enfoca búsqueda. ↑/↓ navega lista, Enter abre. Foco visible (anillo 2 px color
acento). Todo funcional sin ratón.

**9. Tacto móvil**
Targets ≥ 44 px. Chips horizontales con scroll (no wraps). Importar como última fila visible.
Pinch-to-zoom, doble toque para centrar.

**10. Estados vacíos y errores**
Nunca pantalla en blanco. Ejemplos: "No hay rutas. Importá una o buscá en el catálogo",
"Activá GPS para ver dónde estás", "Modo offline: usá cartas y pilot charts descargadas".

Sin prioridad. No bloquea ninguna tarea del semáforo.
