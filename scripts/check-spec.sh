#!/bin/bash
# Verificación mecánica de la especificación (Nombres fijos + W4.1). Falla si falta algo.
# Uso: scripts/check-spec.sh   → lista FALTA/SOBRA y sale con 1 si hay alguno.
cd "$(dirname "$0")/.."
fail=0
need() {  # need <texto fijo> <ruta> <descripción>
  if grep -rqF -- "$1" $2 2>/dev/null; then echo "  ok     $3"; else echo "  FALTA  $3  [$1 en $2]"; fail=1; fi
}
forbid() {  # forbid <texto fijo> <ruta> <descripción>
  if grep -rqF -- "$1" $2 2>/dev/null; then echo "  SOBRA  $3  [$1 en $2]"; fail=1; else echo "  ok     $3"; fi
}
SRC="web/src"; CSS="web/public/app.css"

echo "# Capas del mapa (Nombres fijos)"
for id in catalog-lines route-lines route-active route-wps voyage-line imported-lines my-accuracy my-halo my-dot nav-to-wp; do
  need "\"$id\"" "$SRC" "capa $id"
done
forbid "catalog-points" "$SRC" "sin capa catalog-points"

echo "# Colores (Nombres fijos)"
for c in "#4FC3F7" "#FFCC80" "#00E676" "#FFD54F" "#2979FF" "#B388FF" "#FF8F00"; do need "$c" "$SRC" "color $c"; done
for c in "#2ecc71" "#f0c419" "#4aa3df" "#9b59b6" "#2a3b4d"; do forbid "$c" "$SRC $CSS" "sin color inventado $c"; done

echo "# W4.1"
need "selectedVariant" "$SRC" "#5 variante elegida como estado"
need "history.replaceState" "$SRC" "#6 replaceState al seleccionar"
need 'get("route")' "$SRC" "#6 lee ?route= al abrir"
need 'get("variant")' "$SRC" "#6 lee ?variant= al abrir"
need "requestAnimationFrame" "$SRC" "#3 simulador con rAF"
need "visibilitychange" "$SRC" "#3 simulador se pausa en segundo plano"
need "x16" "$SRC" "#3 velocidades x4/x16/x64"
need "<copyright" "$SRC" "#4 GPX con atribución"
need "estribor" "$SRC" "#8 desvío a estribor/babor"
need "babor" "$SRC" "#8 desvío a estribor/babor"
need "Tramo" "$SRC" "#8 tramo n de m"
need "Trazado orientativo" "$SRC" "#7 copy de needsReview"
need "permissions.query" "$SRC" "#12 GPS al abrir si hay permiso"
need "Fijar en el mapa" "$SRC" "#13 menú de posición: fijar en el mapa"
need "Escribir coordenadas" "$SRC" "#13 menú de posición: escribir"
need "Usar GPS" "$SRC" "#13 menú de posición: usar GPS"
need "hn-error" "$SRC" "#14 errores inline"
forbid "alert(" "$SRC" "#14 sin alert()"
need "min-height: 44px" "$CSS" "#9 objetivos táctiles"
need "@media (min-width: 700px)" "$CSS" "#10 layout escritorio"
need "height: 96px" "$CSS" "#11 peek 96 px"
need "height: 50vh" "$CSS" "#11 half 50vh"
need "height: 92vh" "$CSS" "#11 full 92vh"
forbid "gradle" "scripts/env.sh README.md" "#16 sin Gradle en env/README"

echo "# W5"
need "maplibre-gl-worker.mjs" "$SRC/main.ts" "worker de MapLibre fijado"
need "hn-loading" "$SRC/main.ts" "pantalla de carga se oculta desde main"

if [ "$fail" -ne 0 ]; then echo; echo "CHECK-SPEC: hay FALTA/SOBRA. No se puede reportar la tarea como hecha."; exit 1; fi
echo; echo "CHECK-SPEC OK"
