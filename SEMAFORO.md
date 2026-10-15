ADELANTE

TAREA ÚNICA: PS-1 — Planificador de salida.

0. Ajuste previo al simulador (2 líneas): la posición simulada lleva speedMps = 6 kn (3,09 m/s) fijo y un reloj simulado: t = t0 + (nm recorridas / 6 kn) en ms. Así SOG muestra 6 kn y la ETA es realista aunque el recorrido vaya a x64.


Archivos: `web/src/core/catalog.ts` (+test), `web/src/ui/app.ts`, `web/public/app.css`.
Commit `PS-1: planificador de salida`.

1. `core/catalog.ts`: `export function monthScore(e: { bestMonths, stormMonths }, m: number): { score: 0|1|2|3, label }`
   3 = mejor época sin ciclones ("✔ ideal"), 2 = mejor época con ciclones posibles ("✔ con cuidado"),
   1 = fuera de época sin ciclones ("— posible"), 0 = temporada de ciclones fuera de época ("⚠ evitar").
   Tests: los 4 casos.
2. Ficha, bloque "Cuándo": debajo de la tira de meses, una fila de 12 tarjetas chicas (scroll
   horizontal en móvil, 2 filas de 6 en escritorio) con inicial del mes, color por score (verde
   #2E7D32 / verde claro #66BB6A / gris / rojo #C62828) y la etiqueta; la del mes de planificación
   con borde. Tocar una tarjeta cambia el mes de planificación (igual que la tira).
   Cuando exista ADR-009 (E8), la tarjeta sumará viento medio, corriente y riesgo en ruta.
3. Pestaña Rutas: chip "Salgo en {mes}" (usa el mes de planificación; tocar abre el selector de
   mes). Activo: la lista se ordena por score descendente y cada fila muestra la etiqueta del
   score en vez de la insignia simple. El filtro se combina con cuenca, búsqueda y cerca de mí.
4. Aquí: en "Rutas que te pasan cerca", la etiqueta del score del mes al lado de cada ruta.
5. Prueba: AN12 con mes octubre → "⚠ evitar"; chip "Salgo en octubre" en Atlántico Norte → arriba
   aparecen las rutas con "✔ ideal" (p. ej. las de otoño hacia el sur).
6. npm test, build-web.sh, commit, push, PARÁ.
