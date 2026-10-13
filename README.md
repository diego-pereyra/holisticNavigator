# Holistic Navigator

Aplicación PWA offline para planificación y navegación de travesías oceánicas según *World Cruising Routes* (Jimmy & Doina Cornell, 8ª edición). Es "casi un plotter": muestra la carta base empaquetada (costa, batimetría y retícula), permite posicionarse, filtrar rutas, ver ficha con ventana de meses y ciclones, seguir un tramo, importar GPX/KML/CSV y registrar una bitácora GPS.

## Estado

**Prototipo Web publicado** (GitHub Pages, PWA): catálogo de 400 rutas / 2 268 variantes de la 8.ª
edición con waypoints GPS, ficha con consejo + cita + temporada, navegación al próximo waypoint,
simulador, bitácora en memoria, importación GPX/KML/CSV.

**Próximo ciclo:** ejecutar [`docs/04-backlog-ux.md`](docs/04-backlog-ux.md) en el orden E0 → E7.

```bash
npm ci --prefix web
scripts/build-web.sh
python3 -m http.server 8087 --directory web/dist
```

Producción: `scripts/build-web.sh` → `web/dist/`.

## Estructura

```
docs/            misión, target, política de contenido, ADRs
data/catalog/v1/ dataset derivado del libro (routes, waypoints, text, tips)
tools/           pipeline PDF → catalog (python)
web/             frontend DOM ligero (TS estricto + esbuild + MapLibre GL JS)
```

Las posiciones lat/lon **no están en el texto** del libro (están dibujadas en los mapas): el
catálogo de texto aporta códigos, temporadas y distancias, no waypoints georreferenciados.

Límites conocidos del parseo: 85 rutas sin sección localizada (encabezados destrozados por el OCR
o presentes solo en el mini-índice del capítulo) y ~21 secciones marcadas `needsReview` por tamaño
anómalo. El número de página impresa del PDF no mapea 1:1 al libro, así que no sirve como ancla.

## Entorno

```bash
source scripts/env.sh
```

- **Node 22** — `.tools/node/bin/node`
- **Python** — `tools/.venv`

```bash
npm test --prefix web        # 41 tests (node --test)
python3 -m pytest tools/tests -q  # 19 tests
python3 -m http.server 8087 --directory web/dist
```

## Proyecto hermano

**[`../wheatherDashBoard`](../wheatherDashBoard)** — *Panamarina Watch*, referente de diseño del
dashboard local. No es una dependencia: la app instalada solo consume fuentes externas.

## Fuente de conocimiento

El corpus de referencia es el libro *World Cruising Routes (Jimmy & Doina Cornell, 8ª ed.)*,
contenido solo en `docs/02-content.md` con las líneas rojas de `docs/02-content-policy.md`. No se
añade prosa adicional en la app.
