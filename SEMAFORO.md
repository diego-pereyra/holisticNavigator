ADELANTE

TAREA ÚNICA: E12.11 — Viradas clasificadas y aviso del horizonte: virada de ceñida,
trasluchada de empopada, cero ruido, y el usuario siempre sabe con qué viento se calculó
cada tramo. (Pregunta de Diego, 2026-10-19: "al clima de hoy veo bordos donde no hay
ceñida; al futuro sí le veo sentido" + "tené en cuenta los pocos días de pronóstico:
después va por las pilot charts y está bien, pero avisale al usuario que tiene X días de
pronóstico, el resto se está manejando por las pilot — porque sino le va a hacer ruido".)

Diagnóstico (no buscar más):
- web/src/core/routing/isochrones.ts:653 — la virada se detecta SOLO por flip de signo del
  ángulo relativo (Math.sign(twa) !== Math.sign(relative(p.heading, wp.dir))). El signo es
  ambiguo en los DOS ejes: amura (TWA 0) y POPA (TWA ±180). En empopada, una oscilación de
  2° del rumbo cruza el eje y cuenta como virada espuria.
- La polar no navega a 180° (cono muerto de popa desde 165°): en empopada el motor
  traslucha en zigzag — viradas REALES pero de empopada.
- web/src/core/routes-own.ts:178 — toda virada se bautiza "Bordo n": terminología de ceñida
  para trasluchadas y para ruido. El resumen "tramo de ceñida" también las cuenta.

Archivos: web/src/core/routing/isochrones.ts (+test), web/src/core/routes-own.ts (+test),
web/src/ui/app.ts (solo el texto del resumen).

1. **Virada real = flip de signo + cambio de rumbo significativo:** |Δheading| ≥ 20°
   (nuevo campo de IsoConfig, `turnTackDeg`, default 20). El ruido de ±2° sobre el eje de
   popa deja de contar. (El umbral de waypoint de E12.10, wpTurnDeg, no se toca.)
2. **Clasificar por TWA en el momento de la virada:** |TWA| < 70° → **"Virada n"** (ceñida);
   |TWA| > 120° → **"Trasluchada n"** (empopada). Nombres náuticos correctos; "Bordo" era la
   pierna, no la maniobra — desaparece como nombre de waypoint.
3. **Coste de maniobra diferenciado (realismo):** virada cuesta `tackPenaltyMin` como hoy;
   trasluchada cuesta la mitad (`gybePenaltyMin`, default = tackPenaltyMin/2 por modo:
   Confort 10, Crucero 5, Regata 1,5). En empopada el motor elige trasluchar cuando
   conviene, no cuando el ruido lo empuja.
4. **Aviso del horizonte en el resultado:** el panel de optimización dice con qué viento
   se calculó cada parte. Función pura `horizonNotice(pkg, etaMs): string`:
   - Con paquete de pronóstico y ETA dentro del horizonte → sin aviso.
   - Con paquete y ETA que lo supera → "Pronóstico real: N días (hasta {fecha}) · el resto
     del trazado se calcula con pilot charts (clima medio)." — N y la fecha salen de
     `forecastHorizon(pkg)` (windfield.ts:110); `beyondForecast(pkg, t)` ya existe.
   - "Ruta del mes" (climateOnly) → "Trazado con pilot charts del mes (clima medio, sin
     pronóstico real)." siempre.
   El aviso va junto a la comparación "vs original", visible sin scrollear. Opcional si es
   barato: los waypoints con ETA más allá del horizonte llevan la marca "clima medio" en
   la tabla de la ficha.
5. **El resumen dice la verdad:** "tramo de ceñida: n viradas" cuenta SOLO las de ceñida;
   las trasluchadas van aparte ("empopada: m trasluchadas") cuando hay.
6. **Tests:** (a) ruta en empopada con viento exacto de popa → zigzag con trasluchadas
   nombradas, CERO "Virada", cero viradas espurias de ±2°; (b) ruta contra el viento →
   "Virada n" en ceñida; (c) reach (TWA ~90) → cero viradas y cero trasluchadas;
   (d) el conteo del resumen separa ceñida de empopada; (e) routing.e2e.test.ts sigue
   verde (actualizar asserts de nombres si tocan); (f) horizonNotice: 7 días de paquete +
   ETA de 12 días → el aviso con "7 días" y la fecha; dentro del horizonte → sin aviso;
   climateOnly → el aviso de pilot charts.
7. Prueba de Diego: la ruta del clima de hoy con viento de popa → "Trasluchada 1, 2…"
   donde antes veía "Bordo" incomprensibles; la del clima futuro con ceñida → "Virada 1, 2…";
   y una travesía larga (p. ej. Canarias→Barbados con paquete de 7 días) → el panel avisa
   dónde termina el pronóstico real y arranca la pilot.
8. npm test (en web/), bash scripts/build-web.sh, commit "E12.11: viradas clasificadas y
   aviso del horizonte", push. Al terminar escribí "Status: DONE" como última línea de
   este archivo.

Status: ready
