#!/bin/bash
# Genera un directorio listo para publicar (Cloudflare Pages / GitHub Pages manual).
# Uso: scripts/package-web.sh            -> build de producción + staging
#      HN_SKIP_BUILD=1 scripts/package-web.sh  -> sólo re-empaqueta el build actual
set -uo pipefail
source "$(dirname "$0")/env.sh"

SRC="$HN_ROOT/web/dist"
OUT="$HN_ROOT/build/publish"

if [ "${HN_SKIP_BUILD:-0}" != "1" ]; then
  "$HN_ROOT/scripts/build-web.sh" || exit 1
fi

if [ ! -d "$SRC" ]; then
  echo "No existe $SRC (corré sin HN_SKIP_BUILD=1)"; exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"
cp -r "$SRC/." "$OUT/"
find "$OUT" -name '*.map' -delete
touch "$OUT/.nojekyll"
cat > "$OUT/_headers" <<'EOF'
/*.js
  Cache-Control: public, max-age=31536000, immutable
/catalog/*
  Cache-Control: public, max-age=300
EOF

echo "Listo para publicar: $OUT"
du -sh "$OUT"
