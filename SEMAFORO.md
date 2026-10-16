ADELANTE

TAREA ÚNICA: E12.3 — Polar del barco: parser del formato tabulado, polar genérica y motor de
consulta. Es la tercera pieza que necesitan los isócronas (máscara ✓, viento ✓, polar → E12.5).

Especificación: docs/adr/008-weather-routing.md §Decisión (componente 2: polar) y §Plan (T12.3).

Archivos: web/src/core/routing/polar.ts (nuevo), web/src/core/routing/polar.test.ts (nuevo).
Lógica pura, sin UI todavía.

1. Parser del formato tabulado estándar (Maxsea/Adrena/qtVlm): filas = TWA (0–180°), columnas
   = TWS en nudos; acepta , ; y tabulador como separadores; detecta si los valores vienen en
   nudos o m/s por magnitud y normaliza a nudos. Tabla → estructura interna con la que se
   consulta por interpolación.
2. Polar genérica de crucero de 40 pies por defecto, tabulada en el código: ceñida útil desde
   ~42° TWA (~5 kn con 12 kn de TWS), reach pico ~8 kn con 15–20 kn de TWS, empopada hasta
   165°. Valores plausibles de un crucero oceánico; no hace falta precisión de regata.
3. Motor de consulta: `boatSpeed(polar, twaDeg, twsKn): number` con interpolación bilineal
   (TWA y TWS), **cono muerto configurable (42° por defecto) → 0 kn**, **ángulo máximo de
   empopada (165° por defecto) → 0 kn**, `factorRealismo` (0,7–1,0, por defecto 1) que
   escala la tabla, y **velocidad a motor** bajo umbral de viento (por defecto: TWS < 6 kn
   → 4 kn a motor).
4. Cero dependencias nuevas: parser e interpolación a mano (los del estilo de clim.ts).
5. Tests (node:test): interpolación bilineal contra valores conocidos; cono muerto y
   empopada devuelven 0; factor de realismo escala; motor bajo umbral; parser con una polar
   real de un 40 pies (tabla ORC reducida como fixture del test, con CSV y TSV, comas y
   m/s).
6. npm test (en web/), bash scripts/build-web.sh, commit "E12.3: polar del barco (parser,
   genérica y motor)", push, PARÁ.

La siguiente será E12.5 (isócronas con Web Worker + "Optimizar con el viento").
