#!/bin/bash
# Build liviano para WSL: compila y empaqueta el target Web sin daemon residual.
# Uso:  scripts/build-web.sh [tarea-gradle]
set -uo pipefail
source "$(dirname "$0")/env.sh"

TASK="${1:-jsBrowserDevelopmentExecutableDistribution}"

cd "$HN_ROOT"
"$(dirname "$0")/sync-catalog.sh"
gradle ":composeApp:$TASK" --no-daemon
STATUS=$?

pkill -f "KotlinCompileDaemon" 2>/dev/null
echo "memoria tras build:"
free -m | head -2
exit $STATUS
