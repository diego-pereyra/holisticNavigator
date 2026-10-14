ADELANTE

TAREA ÚNICA: E9.2 — alarmas de desvío y de llegada.

Archivos: web/src/core/alarms.ts (nuevo, con test), web/src/ui/app.ts, web/public/app.css,
web/src/platform/sound.ts (nuevo). Nada más.

1. core/alarms.ts (lógica pura, testeada):
   export interface AlarmSettings { xteMaxNm: number; arrivalNm: number }   // defecto 2 y 1
   export type AlarmKind = "xte" | "arrival";
   export interface AlarmState { active: AlarmKind | null; silencedFor: AlarmKind | null }
   export function evalAlarms(fix: NavFix, s: AlarmSettings, prev: AlarmState): AlarmState
   Reglas: |xteNm| > xteMaxNm → "xte"; distanceNm < arrivalNm → "arrival" (tiene prioridad).
   Si la condición desaparece, active = null y silencedFor = null (vuelve a poder sonar).
   Si active == silencedFor, no suena (sigue activa pero silenciada).
   Tests: 6 casos (cruza umbral, vuelve, silenciada no se repite, se repite tras resolverse, llegada
   gana a desvío, sin fix → null).
2. platform/sound.ts: export function beep(times: number): tono 880 Hz de 150 ms con
   AudioContext (crearlo en el primer gesto del usuario; si no hay, silencio) + navigator.vibrate?.(200).
3. Ajustes: en la pestaña Aquí, sección "Alarmas" (tarjeta): dos campos numéricos "Desvío máximo
   (nm)" y "Radio de llegada (nm)", con los defectos; se guardan en hn.settings.alarms.
4. En app.ts, un effect que lee ui.position y ui.active, llama activeNav(ui) y evalAlarms; cuando
   active cambia de null a un valor y no está silenciada: beep(3) cada 10 s mientras siga activa,
   y banda roja fija arriba de la hoja class="hn-alarm" con el texto
   `⚠ Desvío de {d.d} nm · [Silenciar]` o `⚑ Llegando a {waypoint} · [Silenciar]`.
   Silenciar: silencedFor = active; la banda queda en gris con el texto, sin sonido.
5. Las alarmas solo corren con ruta activa. Al Dejar de seguir, se limpian.
6. Prueba: Seguir AN12 con posición manual a 3 nm del trazado → suena y aparece la banda; Silenciar
   → deja de sonar; mover la posición al trazado → banda desaparece; volver a desviarse → vuelve a
   sonar. Posición a 0,5 nm de un waypoint → "Llegando a …".
7. npm test, build-web.sh, commit "E9.2: alarmas de desvío y llegada", push, PARÁ.
