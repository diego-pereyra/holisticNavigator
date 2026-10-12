# Holistic Navigator

App multiplataforma (Web → Android → iOS) para **planificar travesías oceánicas**: rutas de Cornell,
vientos y corrientes estacionales (pilot charts) y el tiempo y avisos de tu posición — todo local
en el dispositivo, usable sin conexión.

| Documento | Qué resuelve |
|---|---|
| [`docs/00-mission.md`](docs/00-mission.md) | Misión, problemas, principios, no-objetivos |
| [`docs/01-target.md`](docs/01-target.md) | Personas, jobs to be done, orden de plataformas |
| [`docs/02-content.md`](docs/02-content.md) | Política de contenido derivado del libro (derechos) |
| [`docs/adr/001-stack.md`](docs/adr/001-stack.md) | KMP + Compose Multiplatform · por qué no Wasm |
| [`docs/adr/002-no-backend.md`](docs/adr/002-no-backend.md) | Sin backend · matriz CORS de las fuentes |
| [`docs/adr/003-nhc-relay.md`](docs/adr/003-nhc-relay.md) | Relay estático NHC para Web |
| [`docs/adr/004-web-first-prototype.md`](docs/adr/004-web-first-prototype.md) | Prototipo Web-first · Android nativo diferido · NMEA fuera del prototipo |

## Estado

**P0 cerrado** — esqueleto + spike Web verificado en browser (mapa MapLibre renderizando).

```bash
./scripts/build-web.sh jsBrowserDevelopmentExecutableDistribution
python3 -m http.server 8087 --directory composeApp/build/dist/js/developmentExecutable
```

Producción (minificado, ~6,6 MB de JS + 8,6 MB de `skiko.wasm`):
`./scripts/build-web.sh jsBrowserDistribution` → `composeApp/build/dist/js/productionExecutable/`.

## Estructura

```
docs/            misión, target, política de contenido, ADRs
data/catalog/v1/ dataset derivado del libro (routes, waypoints, text, tips)
tools/           pipeline PDF → catalog (python)
composeApp/      UI Compose Multiplatform
shared/          dominio, db, importadores, posición, clima, capas
relay/           GitHub Actions: NHC → GitHub Pages (estático)
```

## Catálogo (P1)

```bash
source tools/.venv/bin/activate
python tools/extract_catalog.py          # → routes.jsonl (350 rutas) + text/pages.jsonl (interno)
python tools/extract_facts.py            # → route_facts.jsonl (265 secciones; 244 plausibles)
```

Las posiciones lat/lon **no están en el texto** del libro (están dibujadas en los mapas): el
catálogo de texto aporta códigos, temporadas y distancias, no waypoints georreferenciados.

Límites conocidos del parseo: 85 rutas sin sección localizada (encabezados destrozados por el OCR
o presentes solo en el mini-índice del capítulo) y ~21 secciones marcadas `needsReview` por tamaño
anómalo. El número de página impresa del PDF no mapea 1:1 al libro, así que no sirve como ancla.

## Entorno (instalado en `.tools/`, sin sudo)

- **JDK 21** — `.tools/jdk/bin/java`
- **Node 22** — `.tools/node/bin/node`
- **Python** — `tools/.venv` con `pypdf`, `pdfplumber`
- **Gradle** — vía wrapper (`./gradlew`)

```bash
export JAVA_HOME=$PWD/.tools/jdk
export PATH=$PWD/.tools/node/bin:$PWD/.tools/jdk/bin:$PATH
```

## Proyecto hermano

**[`../wheatherDashBoard`](../wheatherDashBoard)** — *Panamarina Watch*, referente de diseño del
dashboard local. No es una dependencia: la app instalada solo consume fuentes externas.

## Fuente de conocimiento

*World Cruising Routes*, Jimmy Cornell, 2ª ed. (Adlard Coles Nautical, 1995). © Jimmy Cornell —
ver [`docs/02-content.md`](docs/02-content.md) para qué entra al producto y qué no.
