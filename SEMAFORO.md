ADELANTE

TAREA ÚNICA: E9.4 — parte diario de la travesía y notas.

Archivos: web/src/core/voyage.ts (+test), web/src/ui/app.ts, web/src/core/gpx.ts (+test), web/public/app.css.

1. core/voyage.ts:
   export interface Note { t: number; lat: number; lon: number; text: string }
   VoyageLog gana `notes: Note[]` (compatibilidad: si falta, []).
   export function dailyReport(log, nowMs, remainingNm?: number): {
     nm24h, avgKn24h, avgCogDeg24h, totalNm, hours, daysToGo? (remainingNm / (nm24h o avg total) )
   }  — nm24h sobre los puntos de las últimas 24 h; avgCog con media vectorial. Tests: track
   sintético de 48 h a 6 kn rumbo 090 → nm24h 144 ±1, avgKn 6,0, cog 90.
2. core/gpx.ts: voyageToGpx incluye las notas como <wpt lat lon><time>…</time><name>Nota</name>
   <desc>{text}</desc></wpt> antes del <trk>. Test.
3. Pestaña Travesía:
   - Tarjeta "Parte diario" arriba: `Últimas 24 h: 144 nm · 6,0 kn · rumbo medio 090°` ·
     `Total: 812 nm en 5 d 14 h` · si hay ruta activa: `Faltan 1 230 nm · ~8,5 días a este ritmo`.
     Botón "Copiar parte" → texto plano en el portapapeles con fecha, posición, esas tres líneas y
     la última nota; confirmación "Copiado".
   - Botón "+ Nota": campo de una línea + "Guardar"; guarda con hora y posición actual (o última).
   - Línea de tiempo debajo: cada nota con `dd/mm hh:mm · lat lon · texto`; borrar con "×" y
     deshacer 8 s (banda hn-undo reutilizable: "Nota borrada · Deshacer").
   - "Nueva travesía" archiva (ya existe) con sus notas; las archivadas se listan con nombre,
     fechas, millas y botón Exportar GPX.
4. Prueba: grabar con posición simulada (Recorrer) 2 minutos, agregar dos notas, Copiar parte →
   pegado legible; exportar GPX → abre en OpenCPN con el track y dos waypoints de nota.
5. npm test, build-web.sh, commit "E9.4: parte diario y notas", push, PARÁ.
