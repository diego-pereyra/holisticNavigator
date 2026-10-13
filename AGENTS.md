# EMPEZÁ ACÁ — Big Pickle

## Qué cambió en este repo (2026-10-13)

Claude hizo una auditoría de usabilidad de la app contra la misión y dejó **todo el trabajo
siguiente ya decidido y escrito**. No hay nada que diseñar: hay que ejecutar.

| Archivo | Qué es | Para qué lo usás |
|---|---|---|
| `docs/04-backlog-ux.md` | **Tu lista de tareas**, T0.1 → T12.1, cada una con archivos, qué hacer y criterio de aceptación | Es lo único que ejecutás. En orden. |
| `docs/03-ux-architecture.md` | Por qué de cada tarea, pantallas (§3), ficha (§5), "casi un plotter" (§6 bis), 12 reglas de usabilidad (§6 ter) | Lo consultás cuando una tarea dice "según §X" |
| `docs/adr/005-offline-basemap.md` | Mapa base empaquetado (costa + batimetría + retícula), sin teselas online | Lo aplicás en T1.1 y T10.x |
| `docs/adr/006-nhc-relay-data-branch.md` | Relay NHC por rama `data` | Lo aplicás en E7 |
| `docs/00-mission.md`, `01-target.md` | Espíritu actualizado: la app es "casi un plotter" | Contexto; no se edita |
| `BLOCKERS.md` (lo creás vos si hace falta) | Donde anotás lo que no podés hacer tal cual | Nunca improvisás una alternativa |

Las decisiones de producto están todas tomadas (ver `03-ux-architecture.md §9`). No preguntes
si hacer algo del backlog: hacelo. Preguntá solo vía `BLOCKERS.md` cuando algo no se puede hacer
como está escrito.

## ▶ AHORA: plan W1 → W5 de ADR-007 (decidido por Diego, 2026-10-13)

E0 cerrado. **ADR-007 está aceptado**: el target Web se reescribe como frontend DOM ligero
(TypeScript estricto + esbuild + MapLibre GL JS, sin framework). Leé completo
[`docs/adr/007-web-ligero.md`](docs/adr/007-web-ligero.md) y `03-ux-architecture.md §6 quater`
(presupuestos). Después ejecutá, en orden y con un commit por paso:

| Paso | Commit | Qué |
|---|---|---|
| **W1** | `W1 Esqueleto web/ con esbuild y mapa base` | `web/` con `package.json` (solo `esbuild`, `typescript`, `maplibre-gl`, versiones exactas), `tsconfig.json` estricto, `web/src/main.ts`, `web/index.html`, `manifest.webmanifest`, `scripts/build-web.sh` reescrito (esbuild → `web/dist/`), mapa base ADR-005 desde `data/basemap/*.geojson` (si `tools/build_basemap.py` no existe todavía, hacelo primero como parte de W1). Node: `.tools/node/bin`. Aceptación: `scripts/build-web.sh` < 5 s; `web/dist` muestra costa + retícula sin red. |
| **W2** | `W2 Lógica pura en TypeScript con tests` | `web/src/core/{navigation,kinematics,coords,context,sun,gpx,voyage}.ts` portados de `shared/` y `composeApp/commonMain` con tests `node:test` (`npm test` < 3 s). Mismos casos de aceptación que el backlog (T2.3, T3.4, T9.1, T11.5). |
| **W3** | `W3 Store reactivo y KeyValueStore` | `core/store.ts` (señales, ~60 líneas, con tests) con las tres entradas; `platform/store.ts` sobre IndexedDB con fallback a localStorage (claves de "Nombres fijos"). |
| **W4** | `W4 UI equivalente y retiro de Compose` | Barra de contexto, hoja/panel, tab Rutas (lista, búsqueda, chips), ficha v3 completa (§5: Cuándo con tira de meses, variantes, waypoints, cartas, acciones Seguir/Exportar GPX/Recorrer/Enlace), importar GPX/KML/CSV, GPS/manual, bitácora básica. Checklist §8. **En este mismo commit** se borran `composeApp/`, `shared/`, `build.gradle.kts`, `settings.gradle.kts`, `gradle/`, `gradlew*`, `gradle.properties`, `kotlin-js-store/`, `.kotlin/`; `scripts/sync-catalog.sh` copia a `web/public/catalog/`. |
| **W5** | `W5 Presupuestos y CI` | `scripts/budget.sh` (gzip de `web/dist`; falla si supera §6 quater), `.github/workflows/deploy-pages.yml` apuntando a `web/dist` (sin Java ni Gradle), SW con manifiesto de precache (T1.2) y aviso de versión (T1.3), chip de conexión (T1.4). |

## ▶ W4.1 — correcciones obligatorias antes de W5 (revisión de Claude, 2026-10-13)

W4 está bien encaminado: 470 KB gz de primera carga, 41 tests, sin framework. Pero se desvió de
"Nombres fijos" y de varios criterios del backlog. Un solo commit `W4.1 Correcciones de revisión`
con **todo** lo siguiente; no se empieza W5 sin esto.

| # | Qué está mal | Qué hacer (sin alternativas) |
|---|---|---|
| 1 | Ids de capas y colores inventados (`selected-line`, `active-line`, `me-point`, `catalog-points`, `#2ecc71`, `#f0c419`, `#4aa3df`, `#9b59b6`, catálogo `#2a3b4d`) | Usar **exactamente** la tabla "Nombres fijos" del backlog: `catalog-lines` `#4FC3F7` α0,25 · `route-lines` (variantes de la ruta seleccionada) `#4FC3F7` α0,6 · `route-active` `#4FC3F7` 2,5 px · `route-wps` `#FFCC80` · `voyage-line` `#FFD54F` · `my-accuracy` (círculo de precisión, 64 vértices) · `my-halo` / `my-dot` con color por fuente: GPS `#2979FF`, manual `#B388FF`, simulada `#FF8F00` · `nav-to-wp` `#00E676` (línea posición → próximo waypoint, solo con ruta activa). Eliminar `catalog-points` (no se dibujan waypoints de todo el catálogo). Importadas: `imported-lines` `#B388FF` discontinua. |
| 2 | Las rutas del catálogo no se pueden tocar en el mapa (solo los puntos) y el mapa no obedece al filtro de la lista | `catalog-lines` clicable (`map.on("click","catalog-lines")`, con `queryRenderedFeatures` en un buffer de 8 px); filtro por expresión `["in", ["get","code"], ["literal", codes]]` sincronizado con búsqueda, chip de cuenca y "cerca de mí". |
| 3 | "Recorrer" solo encuadra; no hay simulador | T3.7: recorrer la variante elegida con `requestAnimationFrame` (pausa con `visibilitychange`), velocidad x4/x16/x64, reiniciar, `nm recorridas / total`; fuente de posición `simulated` mientras dura y vuelta a la anterior al parar. |
| 4 | Exportar GPX: solo la primera variante, sin atribución, nombre `AN12.gpx` | T3.6: variante elegida; `<metadata><copyright author="Jimmy & Doina Cornell"><license>World Cruising Routes, 8.ª ed. — uso personal</license></copyright></metadata>`; `<rtept>` con `<name>` y `<desc>destino</desc>`; archivo `AN12A-Falmouth-Newport.gpx`. |
| 5 | La variante elegida no existe como estado: Seguir toma siempre la A y la tabla de waypoints muestra siempre la A | Señal `selectedVariant`; las filas de variantes la fijan (marcada con `.on`); Seguir, Exportar, Recorrer y la tabla de waypoints usan esa variante; por defecto la A. |
| 6 | Enlace usa `?ruta=`; no se lee la URL al abrir; no hay `history.replaceState` | T3.8: parámetros `route` y `variant`; leer al boot y abrir la ficha; `replaceState` en cada cambio de selección; Enlace copia la URL actual. |
| 7 | `needsReview` dice "Datos por revisar (no es un error)" y la etiqueta "revisar" | T3.5: texto `Trazado orientativo: en tramos costeros faltan waypoints intermedios. Verificá con tu carta.` en clase `hn-info` (color `#80CBC4`), sin etiqueta en las variantes. |
| 8 | Navegación: "Desvío 0,8 nm" sin lado; falta "tramo n de m" | `Desvío 0,8 nm a estribor` / `a babor` (signo de `xteNm`: positivo = estribor); celda `Tramo` = `${legIndex+1} de ${coords.length-1}`. |
| 9 | Objetivos táctiles < 44 px (botones 10 px de padding, chips 26 px) | `min-height: 44px` en `.hn-btn`, `.hn-row`, `.hn-chip`, `.hn-tab`, `.hn-month`, `.hn-variant`, `.hn-wp`, `.hn-ctx-*`; separación ≥ 8 px. |
| 10 | Sin layout de escritorio: en 1366 px la hoja sigue abajo a pantalla completa | `@media (min-width: 700px)`: la hoja pasa a panel izquierdo de 400 px, alto completo, con los mismos tabs; `fitTo` usa `padding.left = 400` en escritorio y `padding.bottom = alto real de la hoja` en móvil. |
| 11 | Alturas de hoja: peek 108 px, half 48vh, full 88vh | peek **96 px**, half **50vh**, full **92vh**. |
| 12 | El GPS no arranca nunca al abrir: solo al tocar Seguir o Grabar | Al boot: `navigator.permissions.query({name:"geolocation"})`; si `granted`, `watchGps` inmediato; si `prompt`, el chip dice "Usar GPS" y arranca al tocarlo; si `denied`, "GPS denegado". Regla 1 de §6 ter. |
| 13 | El chip de posición abre directo el diálogo de coordenadas; falta "Fijar en el mapa" | Menú de 4 opciones (T2.2): *Usar GPS · Fijar en el mapa · Escribir coordenadas · Apagar*. "Fijar en el mapa" = banda superior "Tocá el mapa para fijar tu posición · Cancelar" y un solo click en el mapa. |
| 14 | `alert()` para errores de importación y de coordenadas | Mensaje inline bajo el botón/campo (clase `hn-error`), sin `alert`. `confirm()` solo queda en "Nueva bitácora". |
| 15 | La cita muestra ES y EN juntas | Solo `quoteEs`; `quoteEn` únicamente si `quoteEs` está vacía. |
| 16 | `scripts/env.sh` y `README.md` siguen hablando de JDK y Gradle | Quitar JDK/Gradle de `env.sh` (solo Node); README: sección Entorno y comandos con `scripts/build-web.sh`, `npm test`, `python3 -m http.server … web/dist`. |

Aceptación de W4.1: todo lo anterior verificado uno por uno en el mensaje del commit; `npm test`
verde; `scripts/build-web.sh` OK; sin ningún id de capa ni color fuera de "Nombres fijos"
(`grep -oE "#[0-9A-Fa-f]{6}" web/src` solo devuelve colores de la tabla y del mapa base).

## ▶ W4.2 — lo que W4.1 reportó como hecho y no está (verificado por `scripts/check-spec.sh`)

El commit `4edd5df W4.1` se reportó como "aplicado" con los 16 puntos. `scripts/check-spec.sh`
(verificador mecánico, escrito por Claude, corre también en CI antes del deploy) encuentra **17
faltantes**. Corré `bash scripts/check-spec.sh` y hacé un solo commit `W4.2 Completar W4.1` hasta
que imprima `CHECK-SPEC OK`. Lo que falta hoy:

- Capas `my-accuracy` (círculo de precisión) y `nav-to-wp` (línea posición → próximo waypoint, `#00E676`).
- Color de posición simulada `#FF8F00`; quedan colores inventados `#2ecc71` y `#4aa3df` en el código o el CSS.
- #3 Simulador real: `requestAnimationFrame`, pausa con `visibilitychange`, velocidades x4/x16/x64.
- #4 GPX con `<copyright>` y atribución.
- #5 `selectedVariant` como estado (Seguir, Exportar, Recorrer y tabla de waypoints la usan).
- #6 `history.replaceState` al seleccionar; leer `?route=` y `?variant=` al abrir.
- #12 **GPS al abrir** con `navigator.permissions.query`: si `granted`, `watchGps` inmediato; si
  `prompt`, el chip de posición dice "Usar GPS" y un toque lanza `watchGps` (el browser pide
  permiso); si `denied`, "GPS denegado" y el menú ofrece las otras fuentes. **Diego confirmó en el
  teléfono que hoy la app no usa el GPS**: es el defecto más grave de W4.1.
- #12b Botón flotante **◉** (`class="hn-fab"`, 56 px, abajo a la derecha, por encima de la hoja):
  si no hay posición, arranca el GPS; si hay, centra el mapa en ella (zoom 6 si está más lejos).
  Es el mismo botón que tenía la app vieja y que Diego usaba.
- #13 Menú de posición con *Usar GPS · Fijar en el mapa · Escribir coordenadas · Apagar*.

**Regla nueva, permanente:** antes de reportar cualquier tarea como hecha, corré
`bash scripts/check-spec.sh` y pegá su salida completa en el mensaje del commit. Un reporte que
dice "hecho" sobre algo que `check-spec` marca como FALTA es un reporte falso y se rehace la tarea.
Cuando una tarea nueva tenga UI, Claude agrega sus marcadores a `check-spec.sh` junto con la tarea.

## ▶ W4.3 — mapa legible: países y rutas sin lío (crítica de Diego, 2026-10-13)

Diego vio la app nueva: "el mapa muestra todas las rutas y es un lío" y "me gusta la división por
países, si no no sé en qué costa estoy". Un solo commit `W4.3 Mapa legible` después de W4.2:

**A. Carta base con países y ciudades** (`tools/build_basemap.py`, `main.ts`, precache)
- Reemplazar `land.geojson` por `countries.geojson` = Natural Earth 110m `admin_0_countries`,
  coordenadas a 2 decimales, solo propiedades `name` y `mapcolor7` (objetivo ≤ 100 KB gzip).
- Capas, de abajo arriba: `country-fill` (relleno por `mapcolor7` con 7 tonos apagados sobre el
  oscuro: `#1c2733 #202c3a #1a2a31 #22293a #1e2f3a #242a33 #1b2d38`), `country-line` (`#3a4a5a`,
  0,6 px), `coast-line` igual que hoy, `country-label` (símbolo con `name`, 11 px, `#6b7f96`, halo
  `#0b1626`, visible desde zoom 2, sin solapes).
- `cities.geojson` = Natural Earth 110m `populated_places` (≈ 240 puntos, `name`, `pop_max`): capas
  `city-dot` (2 px `#9FB0C0`) y `city-label` (10 px) visibles desde zoom 3; desde zoom 5 todas.
- La retícula y sus etiquetas se mantienen. Tema oscuro se mantiene (el tema Día llega con T11.5).

**B. Rutas: nunca las 2 268 a la vez** (`ui/app.ts`)
- Zoom < 3 (mundo): **ninguna ruta**. En su lugar, `basin-label`: las 13 cuencas con su nombre en
  el centro de su caja (`basins.json`), 12 px `#4FC3F7` α0,7; tocar una cuenca = chip de cuenca.
- Zoom ≥ 3: se dibujan solo las rutas de la **cuenca bajo el centro del mapa** (o del filtro
  activo: chip, búsqueda, "cerca de mí"), y **una línea por ruta** (la variante A) en
  `catalog-lines` α0,35, 1 px. Cambiar de cuenca al mover el mapa actualiza el filtro de la capa
  (expresión `in`), con un retardo de 300 ms tras `moveend`.
- Ruta seleccionada: todas sus variantes en `route-lines` α0,6; la elegida en `route-active`.
- Búsqueda con texto: solo las coincidencias, en cualquier zoom.
- Aquí → "Rutas que te pasan cerca": esas rutas se dibujan también en `route-lines` mientras la
  pestaña Aquí está visible.
- Prueba: a zoom mundial no hay líneas y se leen las 13 cuencas; con el centro sobre el Atlántico
  Norte a zoom 4 hay ≤ 133 líneas (una por ruta AN), ninguna de otra cuenca.

Marcadores para `check-spec.sh` (Claude los agrega): `country-fill`, `country-line`,
`country-label`, `city-dot`, `city-label`, `basin-label`, `moveend`, `countries.geojson`,
`cities.geojson`.

## ▶ W4.4 — la lista de rutas tiene que informar como el panel viejo (Diego, 2026-10-13)

Diego: la hoja desde abajo no molesta, pero "el panel de la izquierda era más práctico en la
información que traía". Lo que el panel viejo mostraba y el nuevo perdió:

1. **El título del libro en cada fila.** La fila nueva dice `AN12 · Falmouth → Newport`; la vieja
   decía `AN12 / Europe to North America (southern routes) / Atlántico Norte`. El título dice de
   qué trata la ruta; origen→destino no. Fila nueva, tres líneas:
   `AN12 · Europe to North America (southern routes)` (negrita) ·
   `Falmouth → Newport · 3011–3309 nm · 3 variantes` ·
   insignia de mes a la derecha. Región solo si el filtro es "Todas".
2. **Contador** `133 de 400 rutas · Atlántico Norte` arriba de la lista, como antes.
3. **Lista y ficha a la vez en escritorio.** En ≥ 700 px el panel izquierdo muestra la lista arriba
   y la ficha de la ruta seleccionada abajo (acordeón "Consejos y datos · AN12" como el viejo, abierto
   por defecto, ≤ 50 % del alto del panel con scroll propio). La lista no desaparece al elegir. En
   móvil se mantiene la hoja con `‹ Rutas`.
4. **Variantes como chips** `Todas · A · B · C` encima de la lista cuando hay ruta seleccionada
   (como el panel viejo), además de las filas de variantes dentro de la ficha. Las dos cosas mueven
   `selectedVariant`.
5. **Importar** vuelve a ser visible sin scroll: fila fija bajo la búsqueda, texto
   `+ Importar GPX / KML / CSV`.

Commit `W4.4 Lista informativa y panel de escritorio`, después de W4.3. Marcadores: `hn-row-title-en`,
`hn-count`, `hn-ficha-dock`, `hn-variant-chips`.

## ▶ W5.1 — arranque que nunca parece colgado (urgente, antes de E2)

Síntoma real en el teléfono de Diego (2026-10-13, Pages, commit 280d143): "Cargando carta base…"
indefinido. Causa principal: `boot()` espera índice + cuencas + `routes.geojson` + IndexedDB antes de
sacar la pantalla de carga, sin progreso, sin tiempo máximo y sin error visible; en una red lenta
(medido: 6–50 KB/s hacia GitHub Pages) son 30–60 s de pantalla fija. Un solo commit
`W5.1 Arranque progresivo y diagnóstico en pantalla`:

| # | Qué hacer |
|---|---|
| 1 | **Nada bloquea el mapa.** Orden: (a) mapa base y barra de contexto se montan en cuanto `map` dispara `load`; la pantalla de carga se oculta ahí. (b) GPS/posición arranca en paralelo (W4.1 #12). (c) `index.json` y `basins.json` se cargan juntos y habilitan Aquí/Rutas; mientras tanto la hoja muestra "Cargando catálogo…" en su cuerpo. (d) `routes.geojson` se carga al final y dibuja `catalog-lines` cuando llega; hasta entonces la ficha funciona con el índice y los facts. (e) IndexedDB se abre en paralelo; si no resolvió en 3 s, se usa `localStorage` y se registra en consola. |
| 2 | **Progreso visible** en la pantalla de carga mientras exista: líneas `carta base ✓ · catálogo … · rutas …` con el estado de cada paso, y el SHA del build (`HN_VERSION`) abajo en gris. |
| 3 | **Tiempo máximo**: a los 8 s la pantalla de carga se oculta pase lo que pase; lo que falte sigue cargando por detrás y la hoja lo dice ("Sin catálogo todavía · Reintentar"). |
| 4 | **Errores en pantalla**: `window.addEventListener("error")` y `unhandledrejection` escriben el mensaje (primera línea, 2 líneas máx.) en la pantalla de carga si está visible, o en una banda `hn-error` abajo si no. Sin consola no se puede depurar un teléfono; esto la reemplaza. |
| 5 | **IndexedDB robusto**: `openDb` maneja `onblocked` (rechaza) y tiene timeout de 3 s (rechaza); el fallback a `localStorage` ya existe. |
| 6 | **Service worker**: el handler de `fetch` pasa a *network-first con fallback a caché* para `catalog/*` y `basemap/*` y para la navegación (`./`); *cache-first* solo para `main.js`, `main.css`, `app.css`, `icon.svg` (versionados por el SHA en el nombre del caché). Precache: `PRECACHE_URLS` completo (incluye `catalog/facts/*.jsonl`, listado por `scripts/build-web.sh` en `sw-manifest.json` e inyectado), `HN_CORE` se elimina (hay dos listas y se usa la incompleta). El `install` no debe tragarse el error con `catch(() => undefined)`: si falla una URL, registrar cuál. |
| 7 | **Peso de `routes.geojson`**: coordenadas a 4 decimales y sin propiedades repetidas por variante (`title`, `wpNames` van a `index`/facts); objetivo ≤ 60 KB gzip (hoy 103). Se hace en `tools/build_v2_catalog.py` y sube `CATALOG_VERSION`. |
| 8 | **Prueba obligatoria**: en Chrome de escritorio, DevTools → Network → "Slow 3G", recargar: el mapa aparece en < 3 s, la pantalla de carga nunca dura más de 8 s, el catálogo llega después con su aviso. Y en modo avión tras una carga completa: todo funciona. |
| 9 | **Smoke test en CI con browser real** (`.github/workflows/deploy-pages.yml`, job previo al deploy): `npx playwright install --with-deps chromium` en el runner (ahí sí hay libs), servir `web/dist` con `npx http-server -p 8087 --silent`, y un script `web/smoke.mjs` que abre `http://localhost:8087/`, falla si aparece cualquier `console.error` o `pageerror`, si `#hn-loading` sigue visible a los 15 s, o si no existe `.hn-context` en el DOM. Sin este test verde no se publica. Motivo: W4/W5 se publicaron sin haberse abierto nunca en un browser y el mapa no cargaba (worker de MapLibre ausente, commit 1e… ver abajo). |

**Lección W5 (2026-10-13):** "npm test verde + tsc OK + build OK" **no** es verificación de una app de browser.
El smoke test de CI (#9) **ya existe** (`web/smoke.mjs` + job en `deploy-pages.yml`, escrito por
Claude): corre en cada push a `main`, con browser real, y bloquea el deploy si la app no arranca o
hay errores en consola. Diego **no** es parte del ciclo de verificación. El ciclo es:
Big Pickle implementa → push → CI (tests, presupuesto, smoke) → deploy → Claude revisa el resultado
(`https://api.github.com/repos/diego-pereyra/holisticNavigator/actions/runs?per_page=3` y el sitio).
Si el smoke falla, el log del job dice qué (consola, HTTP, pantalla de carga) y Big Pickle lo
arregla antes de seguir. Captura `smoke.png` como artefacto del run. La causa del cuelgue fue que MapLibre 6 carga su
worker como archivo aparte (`maplibre-gl-worker.mjs`) y esbuild no lo bundlea: Claude lo corrigió en
`main.ts` (`setWorkerUrl`), `scripts/build-web.sh` (copia) y el precache del SW. No volver a tocar eso.


Reglas específicas de este plan:
- **Sin framework ni librerías de UI.** Si creés que lo necesitás, `BLOCKERS.md`.
- **Nombres fijos** del backlog se respetan igual (ids de capas, colores, claves, umbrales).
- **Remapeo de archivos** para el resto del backlog (desde E2): `commonMain/X.kt` → `web/src/ui/x.ts`;
  `shared/.../X.kt` → `web/src/core/x.ts`; `jsMain/Platform.js.kt` → `web/src/platform/*.ts`.
- Las tareas E1 (T1.1–T1.4) quedan absorbidas por W1 y W5; E3 por W4. Después de W5 seguís con
  **T2.1** y el orden del backlog.
- Reportá al cerrar W2 (tests verdes) y al cerrar W4 (checklist §8), con el resumen de cinco líneas.

## Reglas de máquina (siempre)

- Un solo build a la vez. Antes de un build Gradle: `free -m`; con < 2,5 GB disponibles, no se lanza.
- Después de cada build Gradle: `pkill -f KotlinCompileDaemon`.
- Tests solo en Node o Python. No intentes levantar browsers headless.
- Jobs pesados de datos (teselas, batimetría a 10m) van a GitHub Actions, no a la laptop.

## Tu primera sesión, paso a paso

1. Leé `docs/04-backlog-ux.md` completo. Después `docs/03-ux-architecture.md` §3, §5 y §6 ter.
2. Ejecutá **T0.1** (higiene: `__pycache__` fuera de git). Commit: `T0.1 Higiene del repo`.
3. Ejecutá **T0.2** (parser de ventanas de meses en Python, con tests sobre las 92 + 38 frases del
   EPUB). Commit: `T0.2 Parser de ventanas de meses`.
4. Ejecutá **T0.3 → T0.6** (catálogo v3 e índice; la app debe seguir funcionando igual). Un commit
   por tarea.
5. Build de producción y prueba offline (`03-ux-architecture.md §8`). Si pasa, seguí con **E1**.

Orden completo: apartado "Orden sugerido de entrega" al final del backlog. **No saltes tareas ni
cambies el orden.**

## Cómo reportás

Al terminar cada tarea, en el mensaje de commit: qué hiciste, cómo verificaste el criterio de
aceptación, y qué reglas de §6 ter toca si hay UI. Al terminar una épica, un resumen de cinco
líneas para Diego: qué quedó, qué no, qué hay en `BLOCKERS.md`.

---

# Reglas permanentes para el agente implementador (Big Pickle / opencode)

Este repo tiene dos roles. **Arquitectura y usabilidad** las define Claude (Diego valida);
**vos implementás**. Tu fuente de verdad es, en este orden:

1. `docs/04-backlog-ux.md` — qué hacer, en qué archivos, con qué criterio de aceptación.
2. `docs/03-ux-architecture.md` — por qué, pantallas, reglas de usabilidad (§6 ter), nombres.
3. `docs/adr/*.md` — decisiones de stack y datos. No se reabren.
4. `docs/00-mission.md`, `01-target.md`, `02-content.md` — espíritu y política de contenido.

## Reglas no negociables

- **Una tarea del backlog por commit**, en el orden del apartado "Orden sugerido de entrega". No se
  empieza una tarea sin terminar la anterior (aceptación cumplida). Mensaje de commit en español:
  `T3.3 Bloque "Cuándo" con tira de meses`.
- **Nombres fijos**: usá exactamente los ids, claves, colores, estados y composables de la tabla
  "Nombres fijos" del backlog. Si necesitás un nombre que no está, usá el patrón más cercano y
  anotalo en `BLOCKERS.md`.
- **Sin dependencias nuevas** salvo las que el backlog nombra (`pmtiles` en E10). Nada de
  librerías de UI, de estado, de mapas ni de fechas. Sin cambiar versiones en `gradle/libs.versions.toml`.
- **Sin refactors fuera de los archivos listados** en la tarea. Si un cambio te obliga a tocar otro
  archivo, hacé el mínimo y decilo en el commit.
- **Sin cambios de diseño por cuenta propia.** Si algo del backlog no se puede hacer tal cual
  (API inexistente, rendimiento, dato que falta), **no improvises una alternativa**: escribí en
  `BLOCKERS.md` (raíz) una entrada con `Tarea`, `Qué falla` (con el error o la medición), `Qué
  propongo`, y pasá a la siguiente tarea que no dependa de esa. Diego/Claude deciden.
- **Sin tocar la política de contenido**: no agregar prosa del libro a la app; solo hechos, los
  `tips` ya redactados y las citas ya acotadas.
- **Lógica pura en `shared/`** con tests en `shared/src/commonTest`; `composeApp/` solo UI y
  plataforma. Todo parser, cálculo o resolver nuevo lleva test antes del commit.
- **Idioma de la UI**: español rioplatense (voseo). Términos náuticos correctos. Sin siglas internas
  en pantalla. Nada en inglés salvo nombres propios y títulos del libro.
- **Usabilidad**: cada tarea con UI cumple las 12 reglas de `03-ux-architecture.md §6 ter` y lo
  dice en el commit (ej. `Reglas: 2, 6, 10`).
- **No commitear** `tools/__pycache__`, builds, ni los PDF/EPUB. No crear ramas nuevas sin pedirlo.
- **Push a `main` al cerrar cada tarea con UI y al cerrar cada épica** (`git push origin main`): el CI
  verifica en browser real y despliega; Diego no participa. Si el push falla por credenciales,
  anotarlo en `BLOCKERS.md`: Diego configura una sola vez `git config --global credential.helper store`.

## Cómo verificar antes de cada commit

```bash
source scripts/env.sh
scripts/build-web.sh jsBrowserDistribution          # debe terminar sin errores
python3 -m http.server 8087 --directory composeApp/build/dist/js/productionExecutable
./gradlew :shared:jsTest --no-daemon                 # tests de lógica pura
source tools/.venv/bin/activate && python -m pytest tools/tests -q   # desde T0.2
```

Y a mano, en el browser, el checklist de `03-ux-architecture.md §8`: carga en línea, modo avión,
recarga, abrir cualquier ruta; prueba en 390 px y 1366 px.

## Entorno

WSL sin `sudo`. Toolchain en `.tools/` (`source scripts/env.sh`). Gradle sin daemon, memoria baja:
no subir `Xmx`. No hay browser headless disponible: las capturas las toma Diego.

## Qué no hacer nunca

- Reescribir el service worker con otra estrategia que la del backlog (T1.2).
- Volver a `BaseStyle.Demo` o a teselas online como base del mapa.
- Mostrar `needsReview` en rojo o como error.
- Guardar estado nuevo en `localStorage` directo: todo pasa por `KeyValueStore` (T5.1).
- Agregar pantallas, tabs, ajustes o controles que no estén en el backlog.
