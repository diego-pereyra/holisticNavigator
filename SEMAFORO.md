ADELANTE

TAREA ÚNICA: UX-N.7 — Re-UAT y re-score: el 9/10 medido y firmado.
(docs/07-rediseño-usabilidad.md §5 — el contrato completo de la meta.)

Archivos: docs/07-rediseño-usabilidad.md (Claude actualiza scores), web/uat/uat.mjs (solo si
hay que ajustar selectores rotos por los cambios de la serie), web/src/ui/app.ts (solo
arreglos chicos que el re-UAT descubra).

1. **Re-UAT completo:** el workflow corre sobre el push de esta tarea; revisar
   uat-results/*.json (autoservible): J1 clima acá ≤ 3 toques, J2 seguir ≤ 3, J3 optimizar
   ≤ 4, MOB = 1 pulsación larga, cero beeps en planificación, cero "no se encontró" en ambos
   viewports.
2. **Rubrica:** Claude re-scorea Nielsen 10 (H3/H7 ×2) e ISO 9241-110 con la evidencia del
   UAT y las capturas; el resultado queda en docs/07 §5 con la fecha. Meta: promedio ≥ 9 y
   ningún criterio < 8.
3. **Arreglos de cola:** cualquier hallazgo chico del re-UAT se arregla acá mismo (texto,
   offset, selector); los grandes van a la cola con Diego.
4. **Veredicto de Diego:** en el celu (vertical) y la tablet (apaisada): recorrer los 7
   journeys a mano sin abrir la ayuda. "Intuitivo" se mide así.
5. npm test (en web/), bash scripts/build-web.sh, commit "UX-N.7: re-UAT y re-score",
   push. Al terminar escribí "Status:done" al final de este archivo.

Status: ready
