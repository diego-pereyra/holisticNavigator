ADELANTE

TAREA ÚNICA: SIM — "Recorrer la ruta": simulador real (faltaba desde W4.1 #3).

Archivos: web/src/ui/app.ts, web/public/app.css. core/navigation.ts ya tiene trackLengthNm y
pointAlongTrack: usarlos.

1. Botón "Recorrer" de la ficha: abre bajo las acciones una fila `hn-sim` con: ▶/⏸ · velocidad
   (chip que rota x4 → x16 → x64, defecto x4) · ↺ Reiniciar · `123 / 3 309 nm` · ✕ Terminar.
2. Al iniciar: ui.gpsStop?.(); la posición pasa a source "simulated" (color ámbar #FF8F00, chip
   "simulada"); la variante elegida se vuelve ruta activa (como Seguir), así la tira Navegando,
   las alarmas y la bitácora funcionan igual que con GPS real.
3. Avance con requestAnimationFrame: nm += (total/90 s) × factor × dt; a velocidad x4 una ruta
   entera dura 90/4 ≈ 22 s; al llegar al final se detiene (no da la vuelta). Pausa automática en
   `visibilitychange` → hidden, reanuda al volver. Cada paso llama a la misma ruta de entrada
   que un fix de GPS (pushFix + posición), con `speedMps` derivado del avance para que SOG/ETA
   muestren números.
4. ✕ Terminar: detiene, limpia la posición simulada, restaura la fuente anterior (si era GPS,
   reanuda el watch) y deja de seguir la ruta.
5. Prueba: AN12 → Recorrer → la tira muestra waypoint, rumbo, SOG ≈ decenas de kn a x16 y ETA;
   grabar bitácora durante el recorrido y Copiar parte → números coherentes; ✕ vuelve al GPS.
6. npm test, build-web.sh, commit "SIM: Recorrer la ruta con simulador", push, PARÁ.
   En BLOCKERS.md marcá el pendiente de E9.4 como resuelto por esta tarea.
