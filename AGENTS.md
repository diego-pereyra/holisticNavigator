# Instrucciones para el agente implementador (Big Pickle / opencode)

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
