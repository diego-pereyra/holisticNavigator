# Cola de trabajo — especificaciones vigentes

**Fecha:** 2026-10-13. El orden lo fija `SEMAFORO.md`. Cada tarea se cierra cuando funciona en el browser según su criterio de aceptación; el CI corre el smoke test y Claude revisa el diff.

## W4.2 — lo que W4.1 reportó como hecho y no está 

El commit `4edd5df W4.1` se reportó como "aplicado" con los 16 puntos. Revisando el código, Claude encontró que falta
lo siguiente. Un solo commit `W4.2 Completar W4.1`:

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


## W4.3 — mapa legible: países y rutas sin lío (crítica de Diego, 2026-10-13)

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

`country-label`, `city-dot`, `city-label`, `basin-label`, `moveend`, `countries.geojson`,
`cities.geojson`.

## W4.4 — la lista de rutas tiene que informar como el panel viejo (Diego, 2026-10-13)

Diego: la hoja desde abajo no molesta, pero "el panel de la izquierda era más práctico en la
información que traía". Lo que el panel viejo mostraba y el nuevo perdió:

1. **El título del libro en cada fila.** La fila nueva dice `AN12 · Falmouth → Newport`; la vieja
   decía `AN12 / Europe to North America (southern routes) / Atlántico Norte`. El título dice de
   qué trata la ruta; origen→destino no. Fila nueva, tres líneas:
   `AN12 · Europe to North America (southern routes)` (negrita) ·
   `Falmouth → Newport · 3011–3309 nm · 3 variantes` ·
   insignia de mes a la derecha. Región solo si el filtro es "Todas".
2. **Contador** `133 de 400 rutas · Atlántico Norte` arriba de la lista, como antes.
3. **Lista y ficha a la vez en escritorio, en dos columnas.** Diego: "en la compu es aberrante lo
   que tenés que scrollear". En ≥ 1100 px: columna 1 = lista (320 px: tabs, búsqueda, chips,
   contador, lista con scroll propio); columna 2 = ficha (440 px, `class="hn-col-ficha"`, solo
   cuando hay ruta seleccionada, con scroll propio); el mapa ocupa el resto. Entre 700 y 1100 px:
   una columna de 400 px con lista arriba y ficha abajo al 50 % cada una, scroll propio en cada
   mitad. La lista nunca desaparece al elegir. En móvil se mantiene la hoja con `‹ Rutas`.
   *Criterio:* es el patrón establecido de las apps de mapas (Google Maps en escritorio: lista a la
   izquierda, detalle al lado, mapa siempre visible; en móvil, hoja inferior que se despliega) y el
   de savvy navvy (panel de información de ruta lateral en tablet/escritorio, hoja en teléfono).
   No inventar otro.
4. **Variantes como chips** `Todas · A · B · C` encima de la lista cuando hay ruta seleccionada
   (como el panel viejo), además de las filas de variantes dentro de la ficha. Las dos cosas mueven
   `selectedVariant`.
5. **Importar** vuelve a ser visible sin scroll: fila fija bajo la búsqueda, texto
   `+ Importar GPX / KML / CSV`.

`hn-count`, `hn-ficha-dock`, `hn-variant-chips`.

## W4.5 — ficha sin scroll aberrante (Diego, 2026-10-13)

La ficha apila 9 bloques en una columna; en escritorio hay que pasar por consejos, cita, variantes
y referencias para llegar a los waypoints. Commit `W4.5 Ficha compacta`, después de W4.4:

1. **Cabecera y acciones fijas** (`position: sticky; top: 0`) dentro de la columna de ficha: código,
   título, origen → destino, botones Seguir / Exportar GPX / Recorrer / Enlace. Siempre a la vista.
2. **Datos en rejilla** (`class="hn-facts"`, 2 columnas en escritorio, 1 en móvil), justo debajo:
   Cuenca · Millas (mín–máx) · Variantes · Mejor época (texto) · Ciclones (texto) · Veredicto del mes.
   La tira de meses va encima de la rejilla. Esto reemplaza las líneas sueltas de hoy.
3. **Acordeones** (`class="hn-acc"`, cabecera de 44 px con título y cuenta, chevron, estado
   recordado en `hn.settings`): `Consejo` (tip + "Cómo encarar" de la cuenca) · `Variantes (3)` ·
   `Waypoints (12)` · `Referencias` (cartas, guías, planificador en una línea cada una) ·
   `Del libro` (cita + atribución). Estado por defecto: en escritorio abiertos Consejo y
   Waypoints, cerrados los demás; en móvil todos abiertos como hoy (a Diego le funciona).
3 bis. **Waypoint seleccionado = waypoint resaltado en la carta** (patrón savvy navvy): tocar una
   fila de la tabla de waypoints centra la carta en ese punto, lo agranda (`route-wp-selected`,
   8 px `#FFCC80` con halo) y muestra bajo la fila su posición y la distancia al siguiente waypoint.
   Tocar un waypoint en la carta selecciona su fila y la trae a la vista.
4. **Teclado en escritorio** (regla 12 de §6 ter): `Esc` cierra la ficha, `/` enfoca la búsqueda,
   `↑/↓` mueven la selección en la lista y `Enter` abre la ficha. Marcador: `keydown`.
5. Prueba: en 1366 × 768 con AN12 abierta, sin scrollear se ven cabecera, acciones, tira de meses,
   rejilla de datos, el consejo y el inicio de la tabla de waypoints.


## W5.1 — arranque que nunca parece colgado (urgente, antes de E2)

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

## W4.7 — la hoja no se reconstruye sola (salto de scroll en móvil)

Causa (verificada en `web/src/ui/app.ts`): `renderSheet` corre dentro de un `effect` que borra y
reconstruye todo el cuerpo de la hoja. Dentro, `renderRutas` / `renderAqui` leen señales como
`ui.position`, `ui.month`, `ui.imported`, `ui.query`: el efecto se suscribe a todas. Cada fix del
GPS (cada pocos segundos) reconstruye la hoja entera → el scroll vuelve arriba ("salta / se
refresca"). El mismo mecanismo destruye el campo de búsqueda en cada tecla (pierde el foco).

Archivos: `web/src/core/store.ts`, `web/src/ui/app.ts`. Un commit `W4.7: la hoja no se reconstruye con cada fix`.

1. `store.ts`: agregar `export function untracked<T>(fn: () => T): T` que ejecuta `fn` sin
   registrar dependencias (guardar y restaurar el "efecto actual" alrededor de la llamada). Test.
2. `renderSheet`: el `effect` exterior lee **solo** `ui.sheet()`, `ui.tab()` y `ui.selected()`.
   Todo lo demás (`renderAqui`, `renderRutas`, `renderTravesia`, `renderFicha`) se llama dentro de
   `untracked(() => …)`.
3. Dentro de cada pestaña, lo que depende de otras señales se actualiza con **efectos locales que
   reemplazan solo su nodo**:
   - `renderAqui`: la tarjeta "Ruta en curso" (rumbo, distancia, ETA) y la frase "Estás en…" se
     redibujan en un `effect` propio que hace `replaceChildren` de esa tarjeta, no del cuerpo.
   - `renderRutas`: la lista se redibuja solo al cambiar `query`, `region` o `nearMe` (ya pasa por
     `refresh()`); `position` se lee con `untracked` salvo cuando `nearMe` está activo, y en ese
     caso el efecto local guarda `body.scrollTop` antes y lo restaura después.
   - `renderTravesia`: los contadores (puntos, millas) en un efecto local sobre su tarjeta.
4. El campo de búsqueda no se destruye nunca: se crea una vez por montaje de la pestaña; `ui.query`
   se actualiza con `input` sin disparar reconstrucción (ya no la dispara tras el paso 2).
5. Prueba manual: pestaña Rutas, scrollear hasta la mitad, esperar 30 s con el GPS activo → el
   scroll no se mueve; escribir en la búsqueda → el teclado no se cierra, el foco se mantiene.

## W4.8 — en móvil, la lista de rutas ocupa la hoja, no la cabecera

Diego (2026-10-14): con la hoja a media altura se ve una sola ruta. La cabecera de la pestaña
Rutas (título "Rutas", búsqueda, chips, "Solo cerca de mí", contador, importar) se come el alto.

Archivos: `web/src/ui/app.ts`, `web/public/app.css`. Commit `W4.8: lista de rutas con cabecera compacta`.

1. Quitar el `h2` "Rutas" (ya lo dice la pestaña).
2. Una sola fila de 44 px: campo de búsqueda (ocupa el ancho) con placeholder
   `Buscar · 133 de 400` (el contador va en el placeholder cuando el campo está vacío; cuando se
   escribe, el contador pasa a una línea de 16 px debajo de los chips).
3. Chips en una sola fila horizontal con scroll (`overflow-x: auto`, sin salto de línea), 36 px de
   alto: `Todas · Cerca de mí · Atlántico Norte · …`. "Cerca de mí" es un chip más, no un toggle.
4. "Importar GPX / KML / CSV" deja de estar arriba: es la **última fila de la lista**, con el
   mismo alto que una fila de ruta y un icono `+`.
5. La lista (`.hn-list`) es el único elemento con scroll y tiene `flex: 1; min-height: 0` dentro
   de un cuerpo `display: flex; flex-direction: column`. Cabecera total ≤ 100 px.
6. Prueba: teléfono de 844 px de alto, hoja a media altura → se ven al menos 4 filas de ruta y la
   lista scrollea sola; en escritorio no cambia nada.

## W4.9 — aviso de versión nueva (la página vieja no se entera del deploy)

Diego (2026-10-14) vio en escritorio la pestaña Rutas a pantalla completa: era CSS viejo servido por
el service worker anterior; la página abierta no se entera de que hubo un deploy y sigue con el
shell cacheado hasta una recarga manual. Falta T1.3.

Archivos: `web/src/main.ts`, `web/public/app.css`. Commit `W4.9: aviso de versión nueva`.

1. En el registro del SW: `reg.addEventListener("updatefound", …)`; cuando el nuevo worker pasa a
   `state === "installed"` y `navigator.serviceWorker.controller` existe, mostrar una banda inferior
   `class="hn-update"`: `Hay una versión nueva · [Actualizar]`.
2. "Actualizar": `reg.waiting?.postMessage("skip")` (el SW ya hace `skipWaiting` en `install`; si
   no hay `waiting`, saltar este paso) y, en `navigator.serviceWorker.addEventListener(
   "controllerchange", () => location.reload())`, recargar una sola vez (guardar un flag para no
   recargar en bucle).
3. Además, al volver la pestaña a primer plano (`visibilitychange` → visible) llamar
   `reg.update()` para detectar deploys sin esperar la navegación.
4. Prueba: con la app abierta, desplegar un build nuevo → en menos de un minuto aparece la banda;
   "Actualizar" recarga con el CSS y JS nuevos; no vuelve a aparecer.

## UX-2 — la posición manual no la pisa el GPS

Diego (2026-10-14): fijás la posición a mano y enseguida vuelve a GPS. Causa: el watch del GPS sigue
corriendo y cada fix pisa `ui.position`.

Archivos: `web/src/ui/app.ts`, `web/src/platform/position.ts`. Commit `UX-2: la posición manual manda hasta que elijas GPS`.

1. `watchGps` devuelve la función de parada; guardarla en `ui.gpsStop`. "Fijar en el mapa" y
   "Escribir coordenadas" llaman `ui.gpsStop?.()`, ponen `gpsStatus = "off"` y `position.source = "manual"`.
2. Mientras `position.source === "manual"`, ningún fix de GPS se aplica (guardia en el callback).
3. Al abrir la app: si hay posición manual persistida, se restaura y **no** se arranca el GPS
   aunque el permiso esté concedido; el chip dice "manual" y el menú ofrece "Usar GPS".
4. "Usar GPS" vuelve a arrancar el watch y el primer fix reemplaza la manual.
5. Prueba: escribir 15N 60W con GPS activo → la posición queda en 15N 60W y el chip dice "manual";
   recargar → sigue manual; "Usar GPS" → vuelve a la real.

## UX-3 — el zoom nunca se corta (principio de plotter)

Diego (2026-10-14): "tengo que poder hacer zoom hasta ver que me voy a dar contra una boya".
Hoy `maxZoom: 12` en main.ts.

Archivos: `web/src/main.ts`, `web/src/ui/app.ts`, `web/public/app.css`. Commit `UX-3: zoom libre hasta 18`.

1. `maxZoom: 18` en el mapa. Las fuentes conservan su `maxzoom` (6 mundo, 10 zonas): MapLibre
   sobreamplía las teselas; no hay que tocar las fuentes.
2. Nota discreta abajo a la izquierda, clase `hn-scale-note`, visible cuando el zoom supera el
   detalle disponible en ese punto: `Sin detalle a esta escala · descargá la zona` (si no hay zona
   descargada que cubra el centro) o `Detalle hasta zoom 10 · usá tu carta para el puerto` (si la
   hay). Desaparece al alejar.
3. Marcador de posición, ruta activa, waypoints y círculo de precisión se dibujan igual a cualquier
   zoom (ya es así; verificar que el círculo de precisión no desaparezca por `minzoom`).
4. Prueba: zoom 17 sobre Montevideo → el mapa sigue respondiendo, se ve la posición y la nota.

## E10.3 — balizas, boyas y luces sin red (por zona)

Las teselas de Protomaps no incluyen `seamark:*`. Por cada zona de `zones.json`, el job de teselas
descarga de Overpass (`https://overpass-api.de/api/interpreter`) los nodos con `seamark:type` en
`buoy_lateral, buoy_cardinal, buoy_safe_water, buoy_special, buoy_isolated_danger, beacon_lateral,
beacon_cardinal, beacon_special, light_major, light_minor, lighthouse, harbour, mooring` dentro del
bbox, y publica `zones/<id>-seamarks.geojson` (propiedades: `type`, `name`, `colour`, `shape`,
`light` = carácter si existe). Tamaño típico: 100–500 KB. La app lo descarga junto con la zona y lo
dibuja desde zoom 11 con `SymbolLayer`: texto del símbolo por tipo (● lateral con color
rojo/verde, ◆ cardinal amarillo/negro, ✦ luz, ⚓ puerto/amarre), nombre desde zoom 13, y el
carácter de la luz al tocar. Con red, además, capa raster OpenSeaMap `seamarks` (apagada por
defecto, interruptor "Balizas OSM online"). Commit `E10.3: balizas sin red por zona`.

## T11.5 — temas Día / Noche / Rojo, configurables y automáticos

Diego (2026-10-14): "los colores de noche me cierran, de día no tanto, y quiero poder configurarlo".

Archivos: `web/public/app.css`, `web/src/ui/theme.ts` (nuevo), `web/src/main.ts`, `web/src/ui/app.ts`.
Commit `T11.5: temas Día, Noche y Rojo`.

1. **Tokens CSS** en `:root` para todo color de la UI (panel, texto, secundario, línea, acento,
   error, insignias). Tres bloques `html[data-theme="night"]` (los valores actuales),
   `html[data-theme="day"]` y `html[data-theme="red"]`:

| Token | Noche (actual) | Día | Rojo |
|---|---|---|---|
| `--hn-bg` (panel) | #0b1626 | #ffffff | #000000 |
| `--hn-panel` | #12233a | #f4f7fa | #0a0000 |
| `--hn-text` | #e8eef4 | #0f1a26 | #ff3b30 |
| `--hn-text-2` | #9FB0C0 | #5b6b7a | #b71c1c |
| `--hn-line` | #2a3b4a | #d8dee5 | #4a0000 |
| `--hn-accent` | #4FC3F7 | #0b5aa8 | #ff5252 |
| `--hn-error` | #FF1744 | #d50000 | #ff1744 |
| `--hn-ok` | #2E7D32 | #2e7d32 | #ff8a80 |
| `--hn-warn` | #C62828 | #c62828 | #ff5252 |

2. **Mapa**: `theme.ts` exporta `mapPalette(theme)` con los colores de cada capa, y `applyTheme(map, theme)`
   que hace `setPaintProperty` sobre las capas existentes (no recrea el estilo):

| Capa | Noche | Día | Rojo |
|---|---|---|---|
| background | #15263f | #dbeaf6 | #000000 |
| bathy 200/1000/2000/3000/4000/5000 | #13223a #0f1d33 #0c182b #0a1425 #081120 #060d1a | #c3dbee #b4d0e7 #a6c6e0 #98bcd9 #8bb3d3 #7faacd | #0a0000 #080000 #060000 #050000 #040000 #030000 |
| country-fill (7 tonos) | actuales | #ece9e0 #e6e3d8 #efe9dc #e9e5da #e4e2d6 #ede7de #e8e4d9 | #1a0000 ×7 |
| country-line / coast-line | #3a4a5a | #b9b4a6 / #6f8aa0 | #5a0000 |
| graticule-line / label | #17202b / #44546a | #c5d5e3 / #7a8a98 | #2a0000 / #8b0000 |
| country-label / city-label / detail-place | #6b7f96 / #9FB0C0 | #3c4a58 / #4a5a6a | #c62828 |
| detail-water / detail-earth | #0b1626 / #1c2733 | #cfe3f3 / #ece9e0 | #000000 / #1a0000 |
| catalog-lines / route-lines / route-active | #4FC3F7 | #1565c0 | #ff5252 |
| route-wps | #FFCC80 | #ef6c00 | #ff8a80 |
| nav-to-wp | #00E676 | #00897b | #ff6e40 |
| voyage-line | #FFD54F | #f9a825 | #ff9e80 |
| my-dot GPS / manual / simulada | #2979FF / #B388FF / #FF8F00 | #1e88e5 / #7e57c2 / #fb8c00 | #ff1744 / #ff5252 / #ff8a80 |
| basin-label | #4FC3F7 | #0b5aa8 | #ff5252 |
| seamarks | sus colores | sus colores | sin cambio (son señales) |
| halo de todos los textos | #0b1626 | #ffffff | #000000 |

3. **Selector**: en la barra de contexto, un botón de un toque (icono ☀ / ☾ / ●) que rota
   Día → Noche → Rojo → Auto. En Aquí → Ajustes, la misma elección como cuatro chips, y un
   interruptor "De noche usar Rojo" (solo afecta a Auto). Persistido en `hn.settings.theme`
   (`"day" | "night" | "red" | "auto"`) y `hn.settings.redAtNight`.
4. **Auto**: con `sunTimes` (ya existe) sobre la posición actual (sin posición: 40 N, 0 E) y la
   hora: entre salida y puesta del sol → Día; si no → Noche, o Rojo si `redAtNight`. Se reevalúa
   cada 5 min y al cambiar la posición. Por defecto: `auto`, `redAtNight = false`.
5. `<meta name="theme-color">` y el `background` de `html` siguen al tema (barra del sistema).
6. Prueba: los tres temas sin ningún color fuera de la tabla en la UI (inspección); en Día, texto
   principal con contraste ≥ 7:1 sobre el panel; en Rojo no hay ningún píxel blanco ni azul; Auto
   cambia a Noche al anochecer con una posición simulada.

## Orden vigente (Diego, 2026-10-15, tras docs/06-posicionamiento.md)

SIM (en curso) → PS-1 Planificador de salida → PN-1 Puente con Navionics → E8 pilot charts →
E11.4 rutas propias → E13 paquetes de pronóstico → E12 enrutado → E7 avisos NHC → E10.4 zonas.

## PS-1 — Planificador de salida

Archivos: `web/src/core/catalog.ts` (+test), `web/src/ui/app.ts`, `web/public/app.css`.
Commit `PS-1: planificador de salida`.

1. `core/catalog.ts`: `export function monthScore(e: { bestMonths, stormMonths }, m: number): { score: 0|1|2|3, label }`
   3 = mejor época sin ciclones ("✔ ideal"), 2 = mejor época con ciclones posibles ("✔ con cuidado"),
   1 = fuera de época sin ciclones ("— posible"), 0 = temporada de ciclones fuera de época ("⚠ evitar").
   Tests: los 4 casos.
2. Ficha, bloque "Cuándo": debajo de la tira de meses, una fila de 12 tarjetas chicas (scroll
   horizontal en móvil, 2 filas de 6 en escritorio) con inicial del mes, color por score (verde
   #2E7D32 / verde claro #66BB6A / gris / rojo #C62828) y la etiqueta; la del mes de planificación
   con borde. Tocar una tarjeta cambia el mes de planificación (igual que la tira).
   Cuando exista ADR-009 (E8), la tarjeta sumará viento medio, corriente y riesgo en ruta.
3. Pestaña Rutas: chip "Salgo en {mes}" (usa el mes de planificación; tocar abre el selector de
   mes). Activo: la lista se ordena por score descendente y cada fila muestra la etiqueta del
   score en vez de la insignia simple. El filtro se combina con cuenca, búsqueda y cerca de mí.
4. Aquí: en "Rutas que te pasan cerca", la etiqueta del score del mes al lado de cada ruta.
5. Prueba: AN12 con mes octubre → "⚠ evitar"; chip "Salgo en octubre" en Atlántico Norte → arriba
   aparecen las rutas con "✔ ideal" (p. ej. las de otoño hacia el sur).
6. npm test, build-web.sh, commit, push, PARÁ.

## PN-1 — Puente con Navionics (y cualquier plotter)

Archivos: `web/src/core/gpx.ts` (+test), `web/src/platform/download.ts`, `web/src/ui/app.ts`.
Commit `PN-1: exportar a Navionics y detección de duplicados al importar`.

1. Exportación: el botón "Exportar GPX" pasa a "Enviar a plotter". Genera el GPX de la variante
   elegida (ya existe: `<rte>` con nombres, `<copyright>`) con nombre de archivo
   `AN12A-Falmouth-Newport.gpx` y nombre de ruta dentro del GPX `AN12A Falmouth-Newport`
   (sin caracteres fuera de ASCII en el nombre de archivo). Si `navigator.canShare?.({ files })`
   existe, usa la hoja de compartir del sistema (`navigator.share({ files: [File], title })`):
   en Android/iOS aparece Navionics como destino. Si no, descarga como hoy.
2. Lo mismo para rutas propias/importadas y para la bitácora ("Enviar track").
3. Importación: al importar un GPX con el mismo nombre o con ≥ 90 % de puntos coincidentes
   (± 0,05 nm) con una ruta ya importada, preguntar "Ya tenés esta ruta. ¿Reemplazar?" (banda
   inferior con Reemplazar / Guardar como nueva), sin modal. Test del detector de duplicados.
4. Ayuda: línea "Enviá cualquier ruta a Navionics con el botón Enviar a plotter".
5. Prueba: en Android, Enviar a plotter → hoja de compartir → Navionics abre la ruta con sus
   waypoints nombrados; en escritorio descarga el archivo.
6. npm test, build-web.sh, commit, push, PARÁ.

## UX-4 — la lista de rutas se sale del contenedor con la hoja a media altura

Diego (2026-10-15): en móvil y en escritorio, con la hoja a media altura, la lista no queda dentro
del contenedor. Causa: cadena de contenedores flex sin `min-height: 0` (y sin `min-width: 0`):
`.hn-sheet-body` → `.hn-cols` → `.hn-col-list` → `.hn-rutas` → `.hn-list`. Un hijo flex no se
encoge por debajo de su contenido salvo que se le permita, así que `.hn-rutas` crece al alto de
toda la lista, `.hn-list` nunca scrollea y la hoja la recorta. La fila de chips con scroll
horizontal hace lo mismo a lo ancho.

Archivos: `web/public/app.css` (solo CSS). Commit `UX-4: la lista scrollea dentro de la hoja`.

1. Agregar, fuera de cualquier @media:
   .hn-sheet-body, .hn-cols, .hn-col-list, .hn-rutas { min-height: 0; min-width: 0; }
   .hn-rutas { flex: 1 1 auto; }
   .hn-rutas .hn-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
   .hn-chips { max-width: 100%; }
   .hn-row, .hn-row-main { min-width: 0; }
   .hn-row-title, .hn-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
2. `.hn-sheet-body` pasa a `overflow: hidden` cuando la pestaña es Rutas (clase `hn-body-rutas`
   que ya pone o se pone al renderizar) y sigue `overflow-y: auto` en Aquí y Travesía.
3. Mismo tratamiento para la columna de ficha en escritorio (`.hn-col-ficha { min-height: 0 }`).
4. Prueba: móvil a media altura → la lista scrollea dentro de la hoja y la última fila (Importar)
   se alcanza; escritorio con ventana de 900 px de alto → igual; ningún texto desborda a lo ancho.

## E13.6 — Punta de flecha en viento y corrientes (Diego, 2026-10-16) · SIGUIENTE en la cola

Diego: "las corrientes y el viento tienen que tener una punta de flecha que marque el
sentido; el vector tiene dirección pero no sentido". El círculo del extremo (`wx-arrows-dot`)
se lee como manecilla de reloj; las corrientes son rayitas sin sentido visible.

Archivos: `web/src/ui/weather.ts`, `web/src/ui/weather.test.ts`.

1. Punta triangular en cada flecha de viento: polígono de 3 vértices en el extremo del
   segmento (ápice en la punta, alas ≈ 35 % del largo hacia atrás, perpendiculares al
   vector). Capa nueva `wx-arrows-head` (fill) con la misma rampa de color por `ws` y
   opacidad ∝ `st`; `wx-arrows-dot` se elimina (la punta lo reemplaza).
2. Punta igual en las corrientes: capa nueva `wx-current-head` (fill, `#2e9bff`, opacidad
   0,95) en el extremo de cada segmento de corriente.
3. Ambos modos: las puntas se llenan junto con los trazos en `updateWeather`,
   `updateForecastWeather` y el helper de climatología (pilot chart y Pronóstico).
4. Las capas nuevas entran en `WX_LAYER_IDS` y `WX_LAYER_TO_IDS` (`wind` / `current`) y van
   debajo de rutas, posición y MOB (mismo apilado que las otras `wx`).
5. Tests: el triángulo sale del vector (u,v) con ápice en el extremo y alas atrás
   perpendiculares; en Pronóstico con `st: 100`.
6. Prueba en browser: alisios del Caribe con punta que marca el sentido; Corriente del Golfo
   azul con punta; nada de manecillas.
7. npm test (en `web/`), `bash scripts/build-web.sh`, commit "E13.6: puntas de flecha en
   viento y corrientes", push, PARÁ.

## E13.7 — Ajuste de puntas: olas con punta y corrientes más chicas (Diego, 2026-10-16) · SIGUIENTE tras E12.3

Diego probó E13.6 en el celu: "a las olas les falta una puntita de flecha, y a las
corrientes la punta es muy grande; pero estamos bien".

Archivos: `web/src/ui/weather.ts`, `web/src/ui/weather.test.ts`.

1. Puntas en las olas del Pronóstico: capa nueva `wx-waves-head` con triángulo en el extremo
   de cada flecha de ola (`waveArrows`), color por la misma rampa de altura (`WX_WAVE_COLOR`
   sobre `h`). Las olas de climatología (más allá del horizonte) son cajas sin dirección: no
   llevan punta — no hay dirección guardada para marcar el sentido.
2. Puntas de corrientes más chicas: las alas del triángulo de `wx-current-head` pasan de
   ~35 % del largo del segmento a ~20 % (con tope absoluto en grados si hace falta): tiene
   que verse como una punta, no como un cometa.
3. Mismo patrón que E13.6: `headFeature` compartido, parametrizado por proporción; tests de
   las tres puntas (viento, corriente, olas).
4. npm test (en `web/`), `bash scripts/build-web.sh`, commit "E13.7: puntas en olas y puntas
   de corriente más chicas", push, PARÁ.

Después de E13.7 sigue E11.5 (Copiar ruta) y luego E12.5 (specs abajo).

## E11.5 — Copiar ruta + catálogo solo lectura (Diego, 2026-10-16)

Regla de Diego: botón "Copiar ruta" separado del optimizador; editable (agregar, quitar,
mover waypoints y eliminar la ruta) en TODAS menos las del catálogo, que son solo lectura.

Archivos: web/src/ui/app.ts, web/src/core/routes-own.ts (+test), web/public/app.css.

1. Botón "Copiar ruta" en la ficha de cualquier ruta (catálogo, propia, importada): crea una
   copia editable en Mis rutas — `<código> (copia)` para el catálogo, `<nombre> (copia)` para
   propias — y queda seleccionada, lista para Seguir, Exportar o editar.
2. Solo lectura reforzada: en rutas del catálogo el editor no abre; la ficha muestra
   "Ruta del libro · solo lectura — Copiala para editarla" con el botón al lado.
3. Editor (existe de E11.4): verificar que agregar/quitar/mover waypoints y eliminar la ruta
   funcionan en propias, importadas y copias, con recálculo de nm al editar.
4. Tests: copiar una del catálogo produce una propia idéntica (mismos waypoints) marcada
   como propia; copiar una propia produce dos rutas independientes (editar una no toca la
   otra).
5. npm test (en web/), bash scripts/build-web.sh, commit "E11.5: copiar ruta + catálogo solo
   lectura", push, PARÁ.

## E12.5 — Isócronas + "Optimizar con el viento" (Diego, 2026-10-16, revisada)

Reglas de Diego (2026-10-16): el botón optimizar NO es el que copia la ruta; tiene que poder
optimizar CUALQUIER ruta; editar (agregar, quitar, mover WP, eliminar) vale para todas menos
las del catálogo. **Optimizar = calcular y mostrar; guardar es acción aparte.**

Especificación: docs/adr/008-weather-routing.md §Decisión (componentes 3–6) y §Plan
(T12.5+T12.6 juntas).

Archivos: web/src/core/routing/isochrones.ts (nuevo), web/src/core/routing/isochrones.test.ts
(nuevo), web/src/core/routing/windfield.ts (nuevo), web/src/core/routing/isochrones.worker.ts
(nuevo), web/src/ui/app.ts, scripts/build-web.sh (bundle del worker), web/public/app.css.

1. **Optimizar = vista:** el botón "Optimizar con el viento" (o "Ruta del mes" sin paquete de
   pronóstico) funciona sobre CUALQUIER ruta seleccionada y muestra isócronas, trazado
   optimizado, comparación, ceñidas con bordos y ETA. No guarda nada por sí solo.
   - Ruta propia/importada/copia: botón "Aplicar optimización" reemplaza sus waypoints por el
     trazado óptimo (es tuya; recálculo de nm; deshacer con la banda de 8 s si existe).
   - Ruta del catálogo: sin "Aplicar"; el botón "Copiar ruta" (E11.5) ofrece copiar el trazado
     ORIGINAL o el OPTIMIZADO como ruta propia nueva.
2. **Motor de isócronas (puro, en core/routing/isochrones.ts):** `routeOptimal(opts)` —
   frontera por pasos Δt (1 h a menos de 2° de costa según la máscara, 3 h en océano), abanico
   ±110° respecto del rumbo directo con 48 rumbos, velocidad = polar(TWA, TWS) (E12.3), poda
   por sectores (un sobreviviente por sector angular desde el origen), coste de virada
   (5 min por bordo) y límite de bordos; restricciones: máscara de tierra E12.1 con margen
   (dilatación 1 celda), TWS máx 40 kn, hielo (ice ≥ 15) excluido. Termina al alcanzar el
   destino; reconstrucción hacia atrás desde la llegada.
3. **Campo de viento (windfield.ts):** interfaz `wind(lat, lon, t) → {dir, speed}` con dos
   implementaciones: pronóstico del paquete E13.1 (interpolación bilineal en espacio, lineal
   en tiempo) dentro del horizonte, empalme con climatología del mes más allá ("clima medio");
   y climatología sola para "Ruta del mes".
4. **Web Worker:** isochrones.worker.ts corre routeOptimal con progreso por frontera y
   cancelación; el core queda puro para node:test. build-web.sh lo compila como bundle aparte
   (`isochrones.worker.js`, mismo patrón que main.js; al precache del SW).
5. **Resultado del cálculo:** polilínea óptima simplificada (tol 0,1°, tope ~40 waypoints;
   el primero y el último conservan los nombres del original), con ETA por waypoint, viento
   previsto por tramo y tramos de ceñida marcados con número de bordos. El trazado optimizado
   se dibuja como propuesta (línea punteada) hasta que se aplica o se copia.
6. **Capa `wx-isochrones`** (id de "Nombres fijos"): una línea por paso, `#80CBC4` α0,45,
   1 px, debajo de rutas y posición.
7. **Comparación siempre visible durante la vista:** "vs original: −12 h · +310 nm · viento
   máx 28 kn vs 34 kn" — el trazado original recorrido con el mismo viento y polar.
8. **Tests (node:test) del core:** viento uniforme de cola → una pata ~empopada; proa pura →
   ceñida en zigzag dentro del cono muerto con bordos ≥ 1; calma → motor, línea recta; tierra
   en el medio → rodeo con margen; Canarias → Barbados con viento sintético en < 5 s.
9. npm test (en web/), bash scripts/build-web.sh, commit "E12.5: isócronas + Optimizar con el
   viento (vista; aplicar solo en propias)", push, PARÁ.

Prueba de Diego en el celu: AN12 con pronóstico descargado → Optimizar → isócronas y
comparación sobre el mapa, el original intacto; Copiar ruta → elegir trazado optimizado →
queda en Mis rutas, editable, seguible y exportable.
