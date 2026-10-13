#!/bin/bash
# Build del frontend Web ligero (ADR-007): esbuild → web/dist/. Sin Gradle ni daemon.
# Uso: scripts/build-web.sh
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$HN_ROOT"

python3 tools/build_basemap.py
bash "$HN_ROOT/scripts/sync-catalog.sh"

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

cp -R web/public/. web/dist/
sed "s/__HN_BUILD__/$SHA/g" web/public/service-worker.js > web/dist/service-worker.js

echo "web/dist listo ($(du -sh web/dist | cut -f1), sw=hn-$SHA)"
