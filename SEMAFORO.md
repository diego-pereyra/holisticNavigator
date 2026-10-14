ADELANTE

TAREA ÚNICA: E9.3 — vigilancia de fondeo, hombre al agua (MOB) y pantalla encendida.

0. Primero, re-lanzar el job de teselas para completar las balizas de rio-de-la-plata: agregá
   "version": 2 al objeto raíz de tools/tiles/zones.json, commit "tiles: re-run", push. Seguí con
   lo de abajo sin esperar.

Archivos: web/src/core/alarms.ts (+test), web/src/ui/app.ts, web/public/app.css,
web/src/platform/wakelock.ts (nuevo). Nada más.

1. core/alarms.ts: agregar
   export interface AnchorWatch { lat: number; lon: number; radiusM: number }   // defecto 50 m
   export function anchorAlarm(pos: {lat,lon}, w: AnchorWatch): boolean  → distancia > radiusM
   export interface Mob { lat: number; lon: number; t: number }
   export function mobFix(pos, mob): { bearingDeg, distanceNm, elapsedS }  (haversine + rumbo).
   Tests: 4 casos (dentro/fuera del radio; rumbo de vuelta y tiempo).
2. platform/wakelock.ts: export async function keepAwake(on: boolean): usa navigator.wakeLock
   .request("screen") y lo libera; re-pide en visibilitychange → visible si on. Sin API → no-op.
3. Fondeo: en Aquí → tarjeta "Fondeo": botón "Activar vigilancia" (toma la posición actual y el
   radio del campo "Radio (m)", defecto 50, persistido en hn.settings.anchor). Activada: la
   tarjeta muestra "Fondeado a {d} m del punto · radio {r} m" actualizado por un effect propio;
   en el mapa, círculo del radio (fuente anchor, capa anchor-ring línea #FFD54F 1,5 px) y punto
   del ancla. Si anchorAlarm → misma banda roja y sonido que las alarmas de E9.2 (kind "anchor",
   texto "⚓ Garreando: {d} m del fondeo · [Silenciar]"), misma regla de silencio. "Desactivar"
   borra todo. Estado persistido (sobrevive recarga).
4. MOB: botón flotante rojo "MOB" (class hn-mob, 56×56, abajo a la izquierda, por encima de la
   hoja, siempre visible cuando hay posición). Pulsación larga de 600 ms con anillo de progreso
   (CSS) para activar: guarda Mob con la posición y hora, crea el waypoint "MOB hh:mm" en el mapa
   (capa mob, símbolo "✖" #FF1744 16 px con halo), y la tira de navegación pasa a modo MOB:
   línea 1 "MOB" y rumbo de vuelta en 40 px; línea 2 "{distancia} nm · {mm:ss} desde la caída";
   alarma sonora continua (beep(2) cada 5 s) hasta "Silenciar"; botón "Terminar MOB" en la
   tira. Mientras MOB está activo, las alarmas de ruta se suspenden. Persistido.
5. keepAwake(true) mientras haya ruta activa, fondeo activo o MOB; false si no queda ninguno.
6. Ayuda de primer uso: agregar una cuarta línea "Mantené apretado MOB si alguien cae al agua".
7. Prueba (posición manual): activar fondeo, mover la posición 80 m → suena y banda; MOB con
   pulsación larga → tira en modo MOB con rumbo de vuelta y cronómetro; "Terminar MOB" vuelve a
   la navegación normal. En Android Chrome la pantalla no se apaga con ruta activa.
8. npm test, build-web.sh, commit "E9.3: fondeo, MOB y pantalla encendida", push, PARÁ.
