#!/bin/bash
# Copia el catálogo (manifest + payloads por capítulo + geometría) a los recursos del target Web.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/data/catalog/v3"
DST="$ROOT/web/public/catalog"

mkdir -p "$DST/facts"
rm -f "$DST/routes.jsonl" "$DST/route_facts.jsonl"
cp "$SRC/index.json" "$SRC/routes.geojson" "$SRC/basins.json" "$DST/"
cp "$SRC"/facts/*.jsonl "$DST/facts/"
echo "catálogo → $DST ($(wc -c < "$DST/index.json") B index, $(du -sh "$DST/facts" | cut -f1) facts, $(wc -c < "$DST/routes.geojson") B geojson)"