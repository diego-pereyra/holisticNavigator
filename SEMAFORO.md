ADELANTE

TAREA ÚNICA: W5.1 — arranque progresivo: el mapa aparece ya, el catálogo llega después.


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

Aclaraciones para no dudar:
- El worker de MapLibre ya está resuelto; no lo toques.
- HN_CACHE: usar "hn-app-" + sha para main.js/css/worker, y un caché aparte "hn-data-v" + CATALOG_VERSION para catalog/* y basemap/*, que NO se borra al cambiar el sha.
- El punto 9 (smoke test en CI) ya existe; no lo rehagas.
- Al terminar: npm test, build-web.sh, commit "W5.1: arranque progresivo y diagnóstico en pantalla", push, PARÁ.
