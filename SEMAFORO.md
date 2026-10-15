ADELANTE

TAREA ÚNICA: UX-4 — la lista de rutas scrollea dentro de la hoja (solo CSS).


Diego (2026-10-15): en móvil y en escritorio, con la hoja a media altura, la lista no queda dentro
del contenedor. Causa: cadena de contenedores flex sin `min-height: 0` (y sin `min-width: 0`):
`.hn-sheet-body` → `.hn-cols` → `.hn-col-list` → `.hn-rutas` → `.hn-list`. Un hijo flex no se
encoge por debajo de su contenido salvo que se le permita, así que `.hn-rutas` crece al alto de
toda la lista, `.hn-list` nunca scrollea y la hoja la recorta. La fila de chips con scroll
horizontal hace lo mismo a lo ancho.

Archivos: `web/public/app.css` (solo CSS). Commit `UX-4: la lista scrollea dentro de la hoja`.

1. Agregar, fuera de cualquier @media:
   .hn-sheet-body, .hn-cols, .hn-col-list, .hn-rutas { min-height: 0; min-width: 0; }
   .hn-rutas { flex: 1 1 auto; }
   .hn-rutas .hn-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
   .hn-chips { max-width: 100%; }
   .hn-row, .hn-row-main { min-width: 0; }
   .hn-row-title, .hn-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
2. `.hn-sheet-body` pasa a `overflow: hidden` cuando la pestaña es Rutas (clase `hn-body-rutas`
   que ya pone o se pone al renderizar) y sigue `overflow-y: auto` en Aquí y Travesía.
3. Mismo tratamiento para la columna de ficha en escritorio (`.hn-col-ficha { min-height: 0 }`).
4. Prueba: móvil a media altura → la lista scrollea dentro de la hoja y la última fila (Importar)
   se alcanza; escritorio con ventana de 900 px de alto → igual; ningún texto desborda a lo ancho.

5. build-web.sh, commit, push, PARÁ.
