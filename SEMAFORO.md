ADELANTE

TAREA ÚNICA: E9.1 — pantalla "Navegando" en la tira de la hoja (peek).

Qué es: con ruta activa (Seguir) y posición, la hoja en estado peek deja de mostrar el asa vacía y
muestra la tira de navegación con números grandes, legible a un metro. Es la pantalla principal
cuando el barco se mueve.

Archivos: web/src/ui/app.ts (nueva función renderNavStrip), web/public/app.css. Nada más.
core/kinematics.ts y core/navigation.ts ya existen y se usan tal cual (activeNav(ui) ya devuelve
fix + kin).

1. Nueva función renderNavStrip(ui, host): host es un div class="hn-navstrip" que se inserta en la
   hoja justo debajo del asa, solo cuando ui.active() != null y ui.position() != null. Tiene un
   effect propio (lee ui.position, ui.active) que hace replaceChildren de host; no reconstruye la hoja.
2. Contenido, dos líneas:
   Línea 1 (40px de alto de fuente, peso 700): `{nombre del próximo waypoint}` a la izquierda y
   `{rumbo}°` a la derecha. Ej.: `Sable            212°`
   Línea 2 (24px): `{distancia} nm · ETA {hh:mm} · SOG {x.x} kn · desvío {d.d} nm {estribor|babor}`.
   Si SOG es null: `SOG —` y `ETA —`. Si xteNm == 0: `en rumbo`.
   Tercera línea pequeña (13px, color secundario): `tramo {n} de {m} · {destino final} a {nm} nm`.
3. Tocar la tira abre la pestaña Aquí (goTo(ui,"aqui")), donde ya está la tarjeta "Ruta en curso".
4. En móvil, con tira visible, el estado peek mide 160px (variable --hn-sheet-h: 160px) en vez
   de 96; el botón ◉ sube con la hoja (ya usa la variable).
5. En escritorio (≥ 700px) la misma tira va fija ARRIBA del panel izquierdo, debajo de las
   pestañas, con las mismas tres líneas.
6. Paso automático de waypoint ya existe en navigate() (elige el tramo más cercano); no tocar.
7. Modo Navegar automático: si SOG ≥ 0,5 kn durante 2 minutos seguidos (ventana de fixes de
   ui.navFixes) y la hoja está en half o full, pasarla a peek UNA vez (no volver a forzar si el
   usuario la sube). Guardar en una variable local `autoPeekDone` que se resetea al cambiar
   ui.active.
8. Prueba: Seguir AN12 con posición manual en 40N 30W → aparece la tira con "Bermuda E" (o el
   waypoint más cercano), rumbo, distancia y "tramo n de m"; sin SOG muestra "—". Mover la posición
   manual: la tira se actualiza sin que la hoja salte.
9. npm test, build-web.sh, commit "E9.1: pantalla Navegando en la tira", push, PARÁ.
