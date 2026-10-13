# ADR-007: Frontend Web ligero (DOM + MapLibre GL JS) en lugar de Compose/Skiko para el target Web

**Estado:** Propuesto — requiere decisión de Diego · **Fecha:** 2026-10-13 · **Fase:** antes de E1

## Contexto

Diego fijó dos objetivos "no menores" (2026-10-13): (1) **no forzar la máquina** donde compila Big
Pickle (WSL, 6,7 GB de RAM totales, sin sudo); (2) **la app debe ser ultraperformante con los mínimos
recursos posibles**, también en tamaño. Además, el proyecto apunta a "casi un plotter": una app que
corre horas en un teléfono, con GPS, de noche, con batería contada.

Medición del build de producción actual (Compose Multiplatform para Web = Kotlin/JS + Skia en wasm):

| Pieza | Bruto | gzip | Qué es |
|---|---|---|---|
| `composeApp.js` | 8,1 MB | 1,9 MB | runtime Kotlin + Compose + MapLibre Compose + app |
| `skiko.wasm` | 8,4 MB | 3,3 MB | motor Skia: pinta **toda** la UI en un canvas |
| `skiko*.mjs` + reexport | 1,1 MB | 0,13 MB | pegamento wasm |
| catálogo v3 (geojson + índice + facts) | 2,9 MB | 0,35 MB | datos |
| **Total primera carga** | **≈ 20 MB** | **≈ 5,7 MB** | |

Costes que no se ven en la tabla: el browser compila 8,4 MB de wasm en cada arranque frío; el texto se
rasteriza en canvas (sin fuentes nativas, sin selección, sin accesibilidad, sin zoom del sistema); la
UI consume GPU de forma continua aunque no cambie nada; el build exige Gradle + daemon de Kotlin +
webpack (pico medido ~5 GB en ADR-004, hoy domado a ~2,2 GB y varios minutos por build); los tests de
`shared` no corren en WSL porque Kotlin/JS los lanza en un browser que no existe.

El propio ADR-001 previó la salida: *"si el spike falla, se conserva `shared/` KMP y el Web usa un
frontend propio"*. El spike no falló técnicamente; falla contra los objetivos de recursos. Y ADR-004
ya decidió que Android e iOS se empaquetan con **Capacitor sobre el bundle Web**: el frontend Web *es*
la app en los tres targets. No hay segunda UI que mantener.

## Decisión (propuesta)

1. **El target Web se reescribe como frontend DOM ligero**: TypeScript estricto, **sin framework**
   (módulos ES nativos, un *store* reactivo propio de ~60 líneas, componentes como funciones que
   devuelven nodos DOM), **MapLibre GL JS** directo (el mismo motor que ya usa MapLibre Compose por
   debajo), CSS propio (sin librerías). Build con **esbuild** (un binario, ~50 ms, < 150 MB de RAM);
   tests con `node:test` (sin browser). Sin webpack, sin Gradle, sin daemon.
2. **La lógica pura se porta a TypeScript** en `web/src/core/` con los mismos tests que exige el
   backlog (navegación, cinemática, parseo/formato de coordenadas, resolver de contexto, sol). Son
   ~700 líneas de Kotlin hoy; se portan en un día. `shared/` (KMP) y `composeApp/` se mueven a
   `legacy/` en el mismo commit y se borran al cerrar E3, cuando la nueva UI cubra todo lo que hacía
   la vieja. No se mantienen dos UIs ni un día más de lo necesario.
3. **Los targets nativos siguen siendo Capacitor** sobre este bundle (ADR-004, P-H). Si algún día un
   target nativo justifica Kotlin, se reabre en un ADR; no antes.
4. **Presupuestos duros** (fallan el build si se superan; `scripts/budget.sh` los mide):

| Métrica | Límite | Hoy (Compose) | Esperado (DOM) |
|---|---|---|---|
| Transferencia primera carga (gzip, sin teselas opcionales) | **≤ 1,2 MB** | 5,7 MB | ≈ 0,75 MB (MapLibre 0,29 + app 0,05 + catálogo 0,35 + basemap 0,06) |
| JS a parsear (bruto) | ≤ 1,5 MB | 9,2 MB + 8,4 MB wasm | ≈ 1,2 MB |
| Arranque frío → mapa con posición (móvil medio, 4G) | ≤ 1,5 s | > 5 s | < 1 s |
| Memoria en uso (móvil, pestaña) | ≤ 120 MB | 250–400 MB | 60–90 MB |
| Build de producción | ≤ 5 s y ≤ 300 MB RAM | minutos, ~2,2 GB | < 1 s, < 150 MB |
| Tests | corren en Node, < 3 s | no corren en WSL | sí |
| Precache offline total (sin zonas) | ≤ 6 MB bruto | ≈ 20 MB | ≈ 4 MB |

## Por qué esta forma y no otra

- **Sin framework** porque la UI es pequeña (una barra, una hoja con tres tabs, una ficha, una tira)
  y porque cada framework suma parse, memoria y un bundler. Un store de señales de 60 líneas cubre la
  reactividad que hace falta. Si en E11 (editor de rutas) hiciera falta más, Preact (4 KB) entra
  sin reescribir nada: es una decisión reversible y barata.
- **MapLibre GL JS directo** porque es exactamente lo que ya corre; se elimina el intermediario Compose
  y se gana control fino: fuentes GeoJSON que se actualizan con `setData` (sin reconstruir capas),
  expresiones de filtro para el catálogo (sin reconstruir 2 268 features al cambiar un chip),
  `requestAnimationFrame` para el simulador, y `maplibre-gl-csp` si hiciera falta CSP estricta.
- **esbuild** porque es un único binario sin dependencias, determinista, y su consumo es
  despreciable: resuelve el objetivo "no forzar la máquina" de raíz.
- **TypeScript estricto** (no JS suelto) porque los tests y los tipos son la red de seguridad que
  pierde Big Pickle al dejar Kotlin.

## Consecuencias

- **Positivas:** app ~8× más liviana y de arranque instantáneo; texto nativo (selección, zoom del
  sistema, accesibilidad, fuentes del dispositivo); menos batería (la UI no repinta si no cambia);
  ciclo de desarrollo de segundos; tests en Node; un solo lenguaje en el frontend (TS) y otro en el
  pipeline de datos (Python). Capacitor y PWA no cambian.
- **Negativas:** se descarta la inversión en Compose/Kotlin del prototipo (unas 1 500 líneas de UI);
  una ventana de 1–2 épicas en la que la app nueva alcanza a la vieja; Big Pickle cambia de lenguaje
  (TS). Se pierde la opción "UI nativa Compose en Android" sin reabrir un ADR.
- **Riesgo controlado:** el catálogo v3, el pipeline Python, los ADR de datos (005, 006) y todo el
  backlog funcional siguen válidos. Solo cambia la columna "archivos" de las tareas de UI.

## Plan de ejecución (sustituye a T1.1 BaseMap.kt y reordena E1/E3)

| Paso | Qué | Aceptación |
|---|---|---|
| W1 | `web/` con `package.json` (solo `esbuild`, `typescript`, `maplibre-gl`; versiones fijadas), `tsconfig` estricto, `scripts/build-web.sh` nuevo (esbuild → `web/dist/`), `index.html`, manifest, SW de T1.2 adaptado. `npm ci` desde `.tools/node`. | `scripts/build-web.sh` < 5 s; `web/dist` sirve una página con el mapa base de ADR-005 (`build_basemap.py` ya hecho) |
| W2 | Port de `core/`: `navigation.ts`, `kinematics.ts`, `coords.ts`, `windows` no hace falta (meses ya en catálogo), `context.ts`, `sun.ts`, `gpx.ts`, `voyage.ts`; tests `node:test` por archivo | `npm test` verde, < 3 s; mismos casos del backlog |
| W3 | Store reactivo (`core/store.ts`) con las tres entradas (posición, mes, ruta activa) y `KeyValueStore` sobre IndexedDB (T5.1) | tests del store; recarga conserva estado |
| W4 | UI mínima equivalente a la app vieja: barra de contexto, hoja/panel, tab Rutas con lista y búsqueda, ficha v3 según §5 (E3 completo), importar/exportar GPX, Recorrer, GPS/manual | checklist §8 de la arquitectura; `legacy/` se borra en este commit |
| W5 | `scripts/budget.sh` (mide gzip de `web/dist`, falla si > presupuesto) y CI de Pages apuntando a `web/dist` | CI verde; Pages sirve la app nueva |

Después de W5, el backlog sigue desde E2 con los nombres de archivo remapeados: `commonMain/X.kt` →
`web/src/ui/x.ts`, `shared/.../X.kt` → `web/src/core/x.ts`, `jsMain/Platform.js.kt` →
`web/src/platform/*.ts`. La tabla "Nombres fijos" del backlog no cambia (ids de capas, colores,
claves, umbrales).

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Quedarse en Compose/Skiko y optimizar | El piso es 8,4 MB de wasm + 8 MB de JS: no hay optimización que baje de ~5 MB gz ni que quite la compilación de wasm en cada arranque, ni el build pesado |
| Compose HTML (DOM, sin Skiko) | Sigue siendo Kotlin/JS + webpack + Gradle (build pesado); proyecto en mantenimiento; MapLibre Compose no aplica, habría que escribir *externals* |
| Kotlin/JS sin Compose (solo `shared` + DOM a mano) | Mantiene Gradle y el runtime Kotlin/JS (~1 MB gz) por 700 líneas de lógica que se portan en un día |
| Framework JS (React/Vue/Svelte) | UI demasiado pequeña para justificar el coste de parse, memoria y toolchain; Preact queda como escape reversible |
| Flutter Web | Mismo problema que Skiko (canvas + wasm), más pesado |
