#!/bin/bash
# Presupuesto de primera carga (gzip)
set -euo pipefail
HN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$HN_ROOT/web/dist"
if [ ! -d "$DIST" ]; then
  echo "No existe $DIST" >&2
  exit 1
fi
TOTAL=$(python3 -c "
import os,gzip
total=0
for root,dirs,files in os.walk('$DIST'):
  for fn in files:
    try:
      p=os.path.join(root,fn)
      with open(p,'rb') as fh: total += len(gzip.compress(fh.read()))
    except: pass
print(total)
")
MAX=1200000
echo "gzip total: $TOTAL bytes (límite $MAX)"
if [ "$TOTAL" -gt "$MAX" ]; then
  echo "ERROR: supera presupuesto" >&2
  exit 1
fi
