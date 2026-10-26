# Demo — agentes (modelo Big Pickle)

La demo se produce con **tres agentes que usan a Big Pickle como modelo**: cada uno
recibe una tarea de este archivo (o del prompt que le pase Diego), la ejecuta
commiteando, y reporta. Los tres agentes son `web/demo/*.mjs` y el workflow
`.github/workflows/demo.yml`; el estado lo maneja el mismo semáforo del repo.

## Agente 1 — Casos de uso (`web/demo/01-casos.mjs`)

Lee el producto actual (docs + código), genera `web/demo/casos.json`: 8 casos de uso
para celular (390×844), ~2,5 minutos totales, cada uno con título, narración en
español rioplatense y las acciones reales sobre la app. Estructura de caso:

```json
{ "id": "pilot-chart", "titulo": "Pilot chart: 30 años de clima",
  "narracion": "Texto que se dice mientras se ve…",
  "acciones": [{"t": "click-sel", "sel": ".hn-tab:has-text('Rutas')"}],
  "dur_ms": 22000 }
```

Acciones disponibles: `click-sel` (selector de Playwright), `click-texto` (texto en
pantalla), `hold` (pulsación larga, coordenadas relativas), `pan`, `wheel`,
`slider` (deslizador de hora), `wait`.

## Agente 2 — Levantar la versión y grabar (`web/demo/02-grabar.mjs` + `demo.yml`)

La app "de internet" ya existe: GitHub Pages publica en cada push. Para grabar NO se
usa Pages (no sería determinista: un deploy en vuelo arruinaría la toma). El job:
arma el mismo build, lo sirve con el servidor Range que imita a Pages, y graba con
el Chromium que instala CI (en WSL no hay browser real). Publica el video +
narración en la release `demo-latest` y como artefacto del run.

## Agente 3 — Narrador (dentro de `02-grabar.mjs`)

Mientras graba, emite con las marcas de tiempo reales de la grabación:
`demo-narracion.md` (minuto a minuto qué se muestra) y `demo.srt` (subtítulos
listos para el editor). La voz la pone Diego; los textos ya están escritos en los
casos.

## Cómo se dispara

Repo → Actions → pestaña **demo** → **Run workflow** (o push sobre `web/demo/**`).
En ~6 minutos queda el video con su narración en la release `demo-latest`.
