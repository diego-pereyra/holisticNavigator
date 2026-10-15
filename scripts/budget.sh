#!/bin/bash
# Presupuesto de primera carga (gzip): solo lo que hace falta para el primer
# dibujo. La carta base pesada (batimetría, países, ciudades) y las fichas por
# zona (facts) se piden después; se informan aparte como "diferido" (P-1).
set -euo pipefail
HN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$HN_ROOT/web/dist"
if [ ! -d "$DIST" ]; then
  echo "No existe $DIST" >&2
  exit 1
fi
LIMIT=1200000
python3 - "$DIST" "$LIMIT" <<'PY'
import gzip, os, sys

dist, limit = sys.argv[1], int(sys.argv[2])

def gz(rel):
    try:
        with open(os.path.join(dist, rel), "rb") as f:
            return len(gzip.compress(f.read()))
    except OSError:
        return 0

# Primera carga: shell, worker del mapa, catálogo de índice/cuencas/rutas y
# retícula. Todo lo demás llega después del primer dibujo.
FIRST = [
    "index.html", "main.js", "main.css", "app.css", "icon.svg",
    "manifest.webmanifest", "maplibre-gl-worker.mjs",
    "catalog/index.json", "catalog/basins.json", "catalog/routes.geojson",
    "basemap/graticule.geojson",
]
DEFERRED_FILES = {
    "batimetría": "basemap/bathy.geojson",
    "países": "basemap/countries.geojson",
    "ciudades": "basemap/cities.geojson",
}

first = sum(gz(rel) for rel in FIRST)
deferred = {name: gz(rel) for name, rel in DEFERRED_FILES.items()}
deferred["fichas"] = 0
precache = 0

for root, _dirs, files in os.walk(dist):
    for fn in files:
        rel = os.path.relpath(os.path.join(root, fn), dist).replace(os.sep, "/")
        if rel.split("/", 1)[0] == "tiles":
            continue
        if rel.startswith("catalog/facts/"):
            deferred["fichas"] += gz(rel)
        if rel not in FIRST:
            if rel in ("service-worker.js", "sw-manifest.json") or rel.endswith((".map", ".LICENSE.txt")):
                continue
            precache += gz(rel)

deferred_total = sum(deferred.values())
precache += first

def kb(n):
    return f"{n / 1024:.0f} KB"

print(f"primera carga: {kb(first)} gzip (límite {kb(limit)})")
print("diferido: " + " · ".join(f"{name} {kb(v)}" for name, v in deferred.items()) + f"  = {kb(deferred_total)}")
print(f"precache total: {kb(precache)} gzip")

if first > limit:
    print(f"PRIMERA CARGA EXCEDIDA: {kb(first)} > {kb(limit)}", file=sys.stderr)
    sys.exit(1)
PY
