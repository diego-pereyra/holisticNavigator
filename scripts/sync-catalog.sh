#!/usr/bin/env bash
set -euo pipefail
mkdir -p web/public/clim
for f in data/clim/*.bin data/clim/clim.json; do
  if [ -f "$f" ]; then
    cp "$f" web/public/clim/
  fi
done
