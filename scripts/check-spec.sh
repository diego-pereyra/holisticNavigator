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

echo "# W4.3 mapa legible"
for id in country-fill country-line country-label city-dot city-label basin-label; do need "\"$id\"" "$SRC" "capa $id"; done
need "countries.geojson" "$SRC" "carta base con países"
need "cities.geojson" "$SRC" "ciudades"
need "moveend" "$SRC" "rutas por cuenca visible"

echo "# W4.2 GPS y botón centrar"
need "hn-fab" "$SRC" "#12b botón ◉ centrar / arrancar GPS"

echo "# W4.4 lista informativa"
for m in hn-row-title-en hn-count hn-ficha-dock hn-variant-chips; do need "$m" "$SRC" "W4.4 $m"; done

echo "# W4.5 ficha compacta"
need "route-wp-selected" "$SRC" "W4.5 waypoint seleccionado en la carta"
for m in hn-col-ficha hn-facts hn-acc keydown; do need "$m" "$SRC" "W4.5 $m"; done
need "sticky" "$CSS" "W4.5 cabecera fija"

echo "# W5"
need "maplibre-gl-worker.mjs" "$SRC/main.ts" "worker de MapLibre fijado"
need "hn-loading" "$SRC/main.ts" "pantalla de carga se oculta desde main"

if [ "$fail" -ne 0 ]; then echo; echo "CHECK-SPEC: hay FALTA/SOBRA. No se puede reportar la tarea como hecha."; exit 1; fi
echo; echo "CHECK-SPEC OK"
