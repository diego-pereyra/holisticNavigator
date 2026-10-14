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
