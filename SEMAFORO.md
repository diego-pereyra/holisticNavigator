ADELANTE

TAREA ÚNICA: W4.8 — en móvil, la lista de rutas ocupa la hoja.


Diego (2026-10-14): con la hoja a media altura se ve una sola ruta. La cabecera de la pestaña
Rutas (título "Rutas", búsqueda, chips, "Solo cerca de mí", contador, importar) se come el alto.

Archivos: `web/src/ui/app.ts`, `web/public/app.css`. Commit `W4.8: lista de rutas con cabecera compacta`.

1. Quitar el `h2` "Rutas" (ya lo dice la pestaña).
2. Una sola fila de 44 px: campo de búsqueda (ocupa el ancho) con placeholder
   `Buscar · 133 de 400` (el contador va en el placeholder cuando el campo está vacío; cuando se
   escribe, el contador pasa a una línea de 16 px debajo de los chips).
3. Chips en una sola fila horizontal con scroll (`overflow-x: auto`, sin salto de línea), 36 px de
   alto: `Todas · Cerca de mí · Atlántico Norte · …`. "Cerca de mí" es un chip más, no un toggle.
4. "Importar GPX / KML / CSV" deja de estar arriba: es la **última fila de la lista**, con el
   mismo alto que una fila de ruta y un icono `+`.
5. La lista (`.hn-list`) es el único elemento con scroll y tiene `flex: 1; min-height: 0` dentro
   de un cuerpo `display: flex; flex-direction: column`. Cabecera total ≤ 100 px.
6. Prueba: teléfono de 844 px de alto, hoja a media altura → se ven al menos 4 filas de ruta y la
   lista scrollea sola; en escritorio no cambia nada.

Al terminar: npm test, build-web.sh, commit "W4.8: lista de rutas con cabecera compacta", push, PARÁ.
