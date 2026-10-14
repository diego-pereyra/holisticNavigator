ADELANTE

TAREA ÚNICA: UX-3 — el zoom nunca se corta.


Diego (2026-10-14): "tengo que poder hacer zoom hasta ver que me voy a dar contra una boya".
Hoy `maxZoom: 12` en main.ts.

Archivos: `web/src/main.ts`, `web/src/ui/app.ts`, `web/public/app.css`. Commit `UX-3: zoom libre hasta 18`.

1. `maxZoom: 18` en el mapa. Las fuentes conservan su `maxzoom` (6 mundo, 10 zonas): MapLibre
   sobreamplía las teselas; no hay que tocar las fuentes.
2. Nota discreta abajo a la izquierda, clase `hn-scale-note`, visible cuando el zoom supera el
   detalle disponible en ese punto: `Sin detalle a esta escala · descargá la zona` (si no hay zona
   descargada que cubra el centro) o `Detalle hasta zoom 10 · usá tu carta para el puerto` (si la
   hay). Desaparece al alejar.
3. Marcador de posición, ruta activa, waypoints y círculo de precisión se dibujan igual a cualquier
   zoom (ya es así; verificar que el círculo de precisión no desaparezca por `minzoom`).
4. Prueba: zoom 17 sobre Montevideo → el mapa sigue respondiendo, se ve la posición y la nota.

5. npm test, build-web.sh, commit, push, PARÁ.
