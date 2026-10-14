ADELANTE

TAREA ÚNICA: W4.9 — aviso de versión nueva.


Diego (2026-10-14) vio en escritorio la pestaña Rutas a pantalla completa: era CSS viejo servido por
el service worker anterior; la página abierta no se entera de que hubo un deploy y sigue con el
shell cacheado hasta una recarga manual. Falta T1.3.

Archivos: `web/src/main.ts`, `web/public/app.css`. Commit `W4.9: aviso de versión nueva`.

1. En el registro del SW: `reg.addEventListener("updatefound", …)`; cuando el nuevo worker pasa a
   `state === "installed"` y `navigator.serviceWorker.controller` existe, mostrar una banda inferior
   `class="hn-update"`: `Hay una versión nueva · [Actualizar]`.
2. "Actualizar": `reg.waiting?.postMessage("skip")` (el SW ya hace `skipWaiting` en `install`; si
   no hay `waiting`, saltar este paso) y, en `navigator.serviceWorker.addEventListener(
   "controllerchange", () => location.reload())`, recargar una sola vez (guardar un flag para no
   recargar en bucle).
3. Además, al volver la pestaña a primer plano (`visibilitychange` → visible) llamar
   `reg.update()` para detectar deploys sin esperar la navegación.
4. Prueba: con la app abierta, desplegar un build nuevo → en menos de un minuto aparece la banda;
   "Actualizar" recarga con el CSS y JS nuevos; no vuelve a aparecer.

Al terminar: npm test, build-web.sh, commit "W4.9: aviso de versión nueva", push, PARÁ.
