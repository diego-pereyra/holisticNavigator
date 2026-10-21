# ADR-010: Sesión y sincronización — login solo si hay sync real

**Estado:** Propuesto (Diego decide) · **Fecha:** 2026-10-20 · **Revisa:** ADR-002 (sin backend)
**Contexto:** Diego reabre el tema ("tenemos que empezar a pensar en un login"). El análisis
del 16/10 en docs/04 §"Sesión y multiusuario" sigue vigente: la pregunta no es el mecanismo,
es el PARA QUÉ.

## Los tres casos reales que piden identidad

| Caso | Qué necesita | ¿Login? |
|---|---|---|
| **Trasladar** (celu ↔ tablet — Diego usa ambos) | Pasar rutas propias, ajustes, bitácoras de un dispositivo al otro | **NO**: alcanza un archivo de respaldo |
| **Respaldo** (barco perdido, teléfono al agua) | Copia de lo propio fuera del dispositivo | **NO**: mismo archivo |
| **Sincronizar** (capturás una ruta en la tablet, la navegas en el celu, sin cables) | Infraestructura + identidad | **SÍ** — recién acá existe el login |

La decisión de arquitectura: **no construimos login para resolver traslado y respaldo.**
Esos dos se resuelven HOY, sin infraestructura y sin que nada salga del barco.

## Fase 1 — Respaldo (sin login, sin backend): E16.0a

"Respaldo y traslado" en Ajustes → Datos sin conexión:
- **Exportar todo**: un archivo `hn-respaldo-YYYYMMDD.json` con rutas propias (con sus
  waypoints y ⚓ obligatorios), ajustes (unidades, visibilidad, alarmas), travesías
  archivadas y bitácora vigente. Los paquetes de pronóstico y cartas NO van: son
  regenerables (se re-descargan).
- **Importar**: fusiona en el dispositivo destino (las rutas propias con el mismo nombre
  preguntan, como la importación de GPX de PN-1).
- El formato de este archivo es **el payload futuro de la sincronización**: la Fase 2
  transporta exactamente esto.

## Fase 2 — Sincronización (login opt-in, si el traslado manual molesta)

| Opción | Veredicto |
|---|---|
| **Backend liviano propio** (Cloudflare Workers + D1; magic link por email) | **Recomendada**: control total del dato, costo ~0, sin dependencia de terceros; el email de magic link no obliga a cuenta Google/Apple. Revisa ADR-002 — nueva ADR-011 cuando se decida |
| **BaaS ajeno** (Supabase/Firebase; Google/Apple sign-in) | Más rápido de armar, pero las rutas y bitácoras del barco viven en infraestructura de terceros — privacidad a valorar |
| Login de GitHub | **Descartado** (audiencia navegante, no devs — 16/10) |
| Passkeys solos | Identidad de dispositivo; no sincronizan nada |

Reglas duras de Fase 2:
1. **El login es opt-in**: la app sigue 100% funcional sin cuenta (local-first, como hoy).
2. **Sync de lo liviano**: rutas propias, ajustes, bitácoras. Paquetes de pronóstico y
   cartas se re-descargan, no se sincronizan.
3. **Conflicto por fecha**, no por merge complejo: gana la versión con `fetchedAt` más
   nuevo; el respaldo manual queda como red de seguridad siempre.
4. **Borrar cuenta = borrar el servidor**, el dispositivo queda intacto.

## Consecuencias

- Positivas: el respaldo sirve HOY (caso real de Diego) y define el contrato de sync para
  mañana; cero infra, cero privacidad en juego.
- Negativas: la Fase 2 toca ADR-002 (habrá backend, liviano y propio) — decisión
  explícita de Diego, no se arrastra sola.
- Costo de no decidir: traslado manual por archivo, que con dos dispositivos ya puede
  cansar — el uso real de la Fase 1 dirá cuánta prisa tiene la Fase 2.
