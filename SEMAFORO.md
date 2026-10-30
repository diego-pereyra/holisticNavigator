ADELANTE

TAREA ÚNICA: BT1.1 — Apoyar el proyecto en Ajustes: una tarjeta con dos canales
(Ko-fi puntual + GitHub Sponsors recurrente).
Spec completa: `sponsors/SPEC-apoyar.md` rev. 2 (LEERLA ANTES DE EMPEZAR: es la
fuente de verdad de textos, orden de filas, clases CSS y criterios).

Resumen ejecutivo (la spec manda si hay duda):
1. `web/src/core/enlaces.ts` (nuevo): `ENLACE_KOFI` y `ENLACE_SPONSORS`, con
   test `enlaces.test.ts` (guardia anti-duplicación: cada URL ocurre una sola
   vez en web/src/ y figura en sponsors/ENLACES.md).
2. Ajustes (`renderAjustes` en `web/src/ui/app.ts`): tarjeta "Apoyar el
   proyecto" DESPUÉS de la tarjeta Tema y ANTES de "Datos sin conexión":
   línea intro + dos `<a class="hn-apoyar-link">` (Ko-fi primero): "Aporte
   puntual (Ko-fi) ›" / "Sostener todos los meses (Sponsors) ›", cada una con
   su nota chica, `target="_blank" rel="noopener noreferrer"`.
3. CSS en `web/public/app.css` junto a `.hn-datos-link`: `.hn-apoyar-link` +
   `.hn-apoyar-nota`, solo tokens `--hn-*` existentes, sin colores nuevos.
4. Test de estructura en `web/src/ui/app.structure.test.ts`: constantes en
   renderAjustes, cero en pantallas de navegación, dos `noopener`, sin
   window.open/alert/confirm, orden Ko-fi antes que Sponsors.
5. Todo discreto: sin pop-up, sin banner, sin aviso de arranque, nada en la
   pantalla de navegación. Offline-safe (los links simplemente no abren).

Fuera de alcance: Mercado Pago en la UI (tercera fila, spec aparte, cuando el
canal exista), contador de visitas, portada, íconos/badges nuevos.

npm test (en web/), bash scripts/build-web.sh, commit "apoyar-dos-canales:
botón Apoyar con Ko-fi + GitHub Sponsors", push.

Status:done
