ADELANTE

TAREA ÚNICA: E12.13 — Duración estimada de la ruta en la ficha: cuánto demora con el clima
del mes (o el pronóstico descargado) y la polar. (Pedido de Diego: "agregar cuánto tiempo
demora una ruta en esas condiciones para esas polares" — y le gustó la demostración de que
el viento se evalúa a la hora de llegada del barco.)

LA PIEZA YA EXISTE: `traverseRoute(coords, startMs, wind, polar)` en
web/src/core/routing/isochrones.ts:664 calcula ETA, viento máximo y millas de un trazado con
el mismo viento y polar del optimizador (es la base de la comparación "vs original"). No se
reinventa nada: se expone.

Archivos: web/src/core/routing/isochrones.ts (solo si hace falta un envoltorio),
web/src/ui/app.ts (bloque de la ficha), web/src/core/format.ts (duración, +test),
web/public/app.css (solo si hace falta).

1. **Helper estimado (puro, testeable):** `estimateRouteDuration({ coords, clim, pkg,
   polar, startMs })` → { etaMs, nm, windMaxKn, windSource: "clima" | "pronostico" } —
   elige el campo: si hay paquete propio de la ruta que cubra el trazado (UX-N.5b),
   `forecastWindField(pkg, clim)`; si no, `climateWindField(clim)` del mes de planificación.
   Con traverseRoute debajo, sin tocar el motor.
2. **En la ficha, junto a "Viento medio en ruta":** la línea "Duración estimada":
   "≈ 21 días · 5,4 kn medios · viento máx 28 kn — clima de octubre (polar 40 pies)".
   Con paquete propio: "≈ 18 días · con el pronóstico descargado (hace 4 h)". Formato de
   duración en format.ts ("≈ 21 días", medias jornadas como "≈ 20,5 días"), unidades por
   hn.settings.unidades, y la edad visible del paquete (regla 7 de §6 ter).
3. **Honestidad del rótulo:** dice SIEMPRE con qué viento se calculó (mes de climatología o
   pronóstico) y qué polar usa ("polar 40 pies" hasta que exista la propia importable).
   Es un estimado de planificación: no compite con el "Optimizar" — es su antesala.
4. **Caché:** por (código, variante, mes) mientras la ficha esté abierta; el cálculo es
   barato (traverseRoute sobre el trazado ya corre en cada optimización).
5. Tests (node:test): el helper con clim sola → windSource "clima"; con paquete cubriendo
   → "pronostico" y ETA distinto; formato de duración (21 días, 20,5 días); el viento máx
   coincide con el máximo de los tramos.
6. Prueba de Diego: AN12 en octubre → "≈ 21 días · 5,4 kn medios" (los números del
   arquitecto ya verificaron Canarias→Barbados: 2 761 nm, 21,2-21,5 días, 5,4 kn);
   con el pronóstico de la ruta descargado → el número baja a lo real y la edad se ve.
7. npm test (en web/), bash scripts/build-web.sh, commit "E12.13: duración estimada en la
   ficha", push. Al terminar escribí "Status: DONE" como última línea.

Status: DONE
