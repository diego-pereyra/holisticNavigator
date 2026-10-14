ADELANTE

TAREA ÚNICA: W4.5 — ficha compacta: cabecera fija, rejilla de datos, acordeones, teclado.


La ficha apila 9 bloques en una columna; en escritorio hay que pasar por consejos, cita, variantes
y referencias para llegar a los waypoints. Commit `W4.5 Ficha compacta`, después de W4.4:

1. **Cabecera y acciones fijas** (`position: sticky; top: 0`) dentro de la columna de ficha: código,
   título, origen → destino, botones Seguir / Exportar GPX / Recorrer / Enlace. Siempre a la vista.
2. **Datos en rejilla** (`class="hn-facts"`, 2 columnas en escritorio, 1 en móvil), justo debajo:
   Cuenca · Millas (mín–máx) · Variantes · Mejor época (texto) · Ciclones (texto) · Veredicto del mes.
   La tira de meses va encima de la rejilla. Esto reemplaza las líneas sueltas de hoy.
3. **Acordeones** (`class="hn-acc"`, cabecera de 44 px con título y cuenta, chevron, estado
   recordado en `hn.settings`): `Consejo` (tip + "Cómo encarar" de la cuenca) · `Variantes (3)` ·
   `Waypoints (12)` · `Referencias` (cartas, guías, planificador en una línea cada una) ·
   `Del libro` (cita + atribución). Estado por defecto: en escritorio abiertos Consejo y
   Waypoints, cerrados los demás; en móvil todos abiertos como hoy (a Diego le funciona).
3 bis. **Waypoint seleccionado = waypoint resaltado en la carta** (patrón savvy navvy): tocar una
   fila de la tabla de waypoints centra la carta en ese punto, lo agranda (`route-wp-selected`,
   8 px `#FFCC80` con halo) y muestra bajo la fila su posición y la distancia al siguiente waypoint.
   Tocar un waypoint en la carta selecciona su fila y la trae a la vista.
4. **Teclado en escritorio** (regla 12 de §6 ter): `Esc` cierra la ficha, `/` enfoca la búsqueda,
   `↑/↓` mueven la selección en la lista y `Enter` abre la ficha. Marcador: `keydown`.
5. Prueba: en 1366 × 768 con AN12 abierta, sin scrollear se ven cabecera, acciones, tira de meses,
   rejilla de datos, el consejo y el inicio de la tabla de waypoints.

Aclaraciones:
- Archivos: web/src/ui/app.ts, web/public/app.css. Nada más.
- El estado de cada acordeón se guarda en hn.settings como { acc: { consejo: true, variantes: false, ... } }.
- Al terminar: npm test, build-web.sh, commit "W4.5: ficha compacta", push, PARÁ.
