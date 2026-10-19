# Big Pickle: instrucciones vigentes

Trabajás en la misma carpeta que Claude (arquitecto). Vos implementás; Claude especifica y revisa.

## Qué hacer ahora (y siempre)

1. Leé `SEMAFORO.md`. Si dice `ESPERAR`, terminá y commiteá lo que tengas a medias y **parate**.
2. Si dice `ADELANTE`: `git status`. Si hay cambios sin commitear que no son tuyos, esperá.
3. `SEMAFORO.md` tiene **una sola tarea**, escrita paso a paso. Hacé exactamente eso.
4. Corré `npm test` (en `web/`) y `bash scripts/build-web.sh`.
5. Un commit con el nombre que dice la tarea. `git push origin main`.
6. **Cerrá la tarea con `Status:done`.** Commiteá y pusheá; después agregá `Status:done` como
   última línea de `SEMAFORO.md` (puede ir dentro del mismo commit). El hook del arquitecto
   (`scripts/architect-hook.sh`) detecta el done, registra el cierre y carga automáticamente
   la siguiente tarea de `queue/` — leé el archivo actualizado y volvé al paso 3. Con
   `Status:done` escrito, la tarea ya no está en ejecución y el arquitecto puede revisarla.
   Si el semáforo dice `ESPERAR`, ahi sí: **PARÁ** y reportá en 3 líneas qué hiciste.

Si algo no se puede hacer como está escrito: anotalo en `BLOCKERS.md` (tarea, qué falla, qué
proponés), saltá a la siguiente tarea de la cola. No inventes alternativas.

## Reglas

- Un solo stack: TypeScript estricto + esbuild + MapLibre GL JS, sin framework, sin dependencias
  nuevas. Lógica pura en `web/src/core/` con tests `node:test`.
- Nombres fijos (ids de capas, colores, claves, umbrales): tabla "Nombres fijos" de
  `docs/04-backlog-ux.md`. No inventar otros.
- UI en español rioplatense, términos náuticos correctos, sin siglas internas.
- Reglas de usabilidad: `docs/03-ux-architecture.md` §6 ter (12 reglas). Presupuestos: §6 quater.
- No tocar `AGENTS.md` ni `docs/`: son de Claude. `SEMAFORO.md` solo para escribir
  `Status:done` al terminar (y eso es todo) — nunca edites la tarea vigente.
  `queue/` la administra el hook del arquitecto: no la toques.
- No commitear `__pycache__`, builds, PDF/EPUB. No crear ramas.
- Un solo build a la vez; nada de browsers headless en WSL: el browser real corre en CI (smoke test).

## Dónde está cada cosa

| Archivo | Qué es |
|---|---|
| `SEMAFORO.md` | Estado y cola. Lo único que decide qué hacés ahora. |
| `docs/05-cola-de-trabajo.md` | Especificación detallada de las tareas W4.2 … W5.1 |
| `docs/04-backlog-ux.md` | Backlog completo (E0–E12), nombres fijos, orden general |
| `docs/03-ux-architecture.md` | Por qué: pantallas, ficha, reglas de usabilidad, presupuestos |
| `docs/adr/*.md` | Decisiones cerradas (stack, datos, mapa base, relay, enrutado) |
| `BLOCKERS.md` | Lo que no pudiste hacer como estaba escrito |

## Entorno

`source scripts/env.sh` (Node en `.tools/node`). `scripts/build-web.sh` (< 1 s). `npm test` en `web/`.
Servir local: `python3 -m http.server 8087 --directory web/dist`.
