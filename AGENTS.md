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
- **No commitear** `tools/__pycache__`, builds, ni los PDF/EPUB. No hacer push de ramas nuevas sin pedirlo.

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
