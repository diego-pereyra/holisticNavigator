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

# Pilot charts (E8.1): climatología mensual, si el pipeline ya la generó.
CSRC="$ROOT/data/clim"
CDST="$ROOT/web/public/clim"
if [ -f "$CSRC/clim.json" ]; then
  mkdir -p "$CDST"
  cp "$CSRC"/*.bin "$CSRC/clim.json" "$CDST/"
  echo "clima → $CDST ($(ls "$CDST"/*.bin 2>/dev/null | wc -l) meses)"
fi

# Máscara de tierra (E12.1): rejilla de bits de 0,1° para el motor de enrutado,
# junto al resto de la carta base (por eso la precachea el service worker).
LSRC="$ROOT/data/land/land.bits"
LDST="$ROOT/web/public/basemap"
if [ -f "$LSRC" ]; then
  mkdir -p "$LDST"
  cp "$LSRC" "$LDST/land.bits"
  echo "máscara de tierra → $LDST/land.bits ($(( $(wc -c < "$LDST/land.bits") / 1024 )) KB)"
fi