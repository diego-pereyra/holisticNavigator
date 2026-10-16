#!/bin/bash
# Build del frontend Web ligero (ADR-007): esbuild → web/dist/. Sin Gradle ni daemon.
# Uso: scripts/build-web.sh
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$HN_ROOT"

python3 tools/build_basemap.py
bash "$HN_ROOT/scripts/sync-catalog.sh"

# Máscara de tierra (E12.1): el motor de enrutado la necesita. El manifiesto de
# precache la incluye como el resto de web/public/basemap/ (el service worker
# la guarda en su caché de datos); no cuenta en la primera carga (budget.sh).
if [ ! -f "$HN_ROOT/web/public/basemap/land.bits" ]; then
  echo "falta basemap/land.bits: generá data/land/land.bits con 'python3 tools/build_landmask.py'." >&2
  exit 1
fi

SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
ESBUILD="$HN_ROOT/web/node_modules/.bin/esbuild"
if [ ! -x "$ESBUILD" ]; then
  echo "falta esbuild: corré 'npm ci' en web/ (usá .tools/node)." >&2
  exit 1
fi

rm -rf web/dist
mkdir -p web/dist

"$ESBUILD" web/src/main.ts --bundle --minify --format=esm --target=es2020 \
  --outfile=web/dist/main.js

# Worker de enrutado (E12.5): bundle aparte, mismo patrón que main.js; entra al
# precache del service worker como cualquier otro archivo de la dist.
"$ESBUILD" web/src/core/routing/isochrones.worker.ts --bundle --minify --format=esm --target=es2020 \
  --outfile=web/dist/isochrones.worker.js

cp -R web/public/. web/dist/
# Worker de MapLibre (archivo aparte, ver main.ts)
cp web/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs web/dist/
if grep -q "maplibre-gl-shared.mjs" web/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs; then
  cp web/node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs web/dist/
fi

# Manifiesto de precache + inyección de marcadores en el service worker (#6).
python3 - "$SHA" <<'PY'
import json, os, re, sys

root = os.environ["HN_ROOT"]
dist = os.path.join(root, "web", "dist")
sha = sys.argv[1]

# 1) sw-manifest.json: todos los archivos de la dist, salvo mapas de depuración,
#    licencias, el service worker / manifiesto y `tiles/` (E10.1b). Las teselas
#    PMTiles son ~45 MB y se piden por rangos a medida que se navega: no van al
#    precache (el SW además las saltea explícitamente, ver service-worker.js).
skip_names = {"service-worker.js", "sw-manifest.json"}
skip_suffix = (".map", ".LICENSE.txt")
urls = ["./"]
for dirpath, _dirs, files in os.walk(dist):
    for name in sorted(files):
        if name in skip_names or name.endswith(skip_suffix):
            continue
        rel = os.path.relpath(os.path.join(dirpath, name), dist).replace(os.sep, "/")
        if rel.split("/", 1)[0] == "tiles":
            continue
        urls.append("./" + rel)
urls = sorted(set(urls))

with open(os.path.join(dist, "sw-manifest.json"), "w", encoding="utf-8") as f:
    json.dump(urls, f, ensure_ascii=False, indent=0)

# 2) CATALOG_VERSION desde el índice del catálogo servido.
catalog_version = "0"
try:
    with open(os.path.join(dist, "catalog", "index.json"), encoding="utf-8") as f:
        catalog_version = str(json.load(f).get("catalogVersion", "0"))
except OSError:
    pass

# 3) service worker: reemplazar marcadores.
with open(os.path.join(root, "web", "public", "service-worker.js"), encoding="utf-8") as f:
    sw = f.read()
sw = sw.replace("__HN_BUILD__", sha)
sw = sw.replace("__HN_CATALOG__", catalog_version)
sw = sw.replace("__HN_PRECACHE__", json.dumps(urls, ensure_ascii=False))
with open(os.path.join(dist, "service-worker.js"), "w", encoding="utf-8") as f:
    f.write(sw)

# 4) index.html: SHA del build en la pantalla de carga (#2).
idx_path = os.path.join(dist, "index.html")
with open(idx_path, encoding="utf-8") as f:
    html = f.read()
with open(idx_path, "w", encoding="utf-8") as f:
    f.write(html.replace("__HN_BUILD__", sha))

print(f"sw-manifest: {len(urls)} URLs · CATALOG_VERSION={catalog_version}")
PY

echo "web/dist listo ($(du -sh web/dist | cut -f1), sw=hn-app-$SHA)"
