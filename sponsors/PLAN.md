# PLAN - Programa Sponsors holisticNavigator

**Fecha de arranque:** 2026-10-30
**Estado:** EN MARCHA — **Ko-fi VIVA con payout conectado y feed iniciado** (primer post publicado 2026-10-30); falta la prueba de $1 y el botón en la app.
**Filosofía:** App gratis y abierta. La plata entra por reconocimiento, no por muro.
**Meta de hoy (2026-10-30):** 1 canal confirmado + botón "Apoyar" en la app por hacer. Nada más.

## Geografía objetivo
- **Centro (70%):** Uruguay - Yacht Club Uruguayo (YCU, Montevideo), YCPU, Colonia del Sacramento, Piriápolis, La Paloma/José Ignacio, charters y escuelas de vela de la costa uruguaya.
- **Secundario (30%):** Cruzadores del Plata desde el lado argentino - San Isidro, Olivos, Club Náutico San Esteban, YCA. La travesía inversa (Argentina→Uruguay / Montevideo→Buenos Aires y viceversa) es caso de uso directo del planner (ventana de clima + mes + optimización). NO es el centro de campaña.

## Canales (orden de gusto)
1. **Ko-fi** (preferido) - **VIVA + feed iniciado**: https://ko-fi.com/holisticnavigator (2026-10-30). Página pública, payout conectado (PayPal/Stripe) y **1 post en el feed** (introducción, 2026-10-30). Fuente del post: `KOFI/FUENTE-POST.md`. Falta solo la prueba de cobro de $1 (ver ENLACES.md).
2. **Mercado Pago** (corriente en Uruguay) - cobro local en $UYU/USD. Funcional en UY. PENDIENTE de creación.
3. **GitHub Sponsors** (UY soportado desde expansión 2022) - payout por banco local vía Stripe Connect. PENDIENTE de creación.

## Enlace canónico
`https://ko-fi.com/holisticnavigator` es el **único** enlace de "Apoyar" (app, portada, bio IG, pitch, README). Decisión y reglas en `ENLACES.md`.

## Funnel
### AHORA (inmediato)
- [x] Crear estructura `sponsors/` y dossier base
- [x] **Ko-fi creado y público** — https://ko-fi.com/holisticnavigator (2026-10-30) ✅
- [x] **Ko-fi con métodos de pago conectados** (2026-10-30) → canal CONFIRMADO de punta a punta, salvo prueba real ✅
- [x] **Feed de Ko-fi iniciado: primer post publicado** (2026-10-30) — introducción con la app, 5 bullets de qué podés hacer, polares 27–45 pies como novedad; imagen destacada `KOFI/post-introduccion-1200x600.png` (beat de demo-07). Fuente guardada en `KOFI/FUENTE-POST.md` ✅
- [ ] **Buzón "next" — Ko-fi:** cada versión nueva que entre a producción → **1 post en el feed con la sección "Novedad" cambiada** (protocolo copiar-editar en `KOFI/FUENTE-POST.md`; sin automatización posible: Ko-fi no tiene API pública de feed)
- [ ] Diego: prueba de cobro de $1 (autotipado) — **único pendiente del canal** (checklist 1 en ENLACES.md)
- [ ] Diego: completar perfil Ko-fi (nombre, descripción, avatar/portada)
- [x] Preparar primer paquete IG (demo-07 optimizar) — paquete listo en `IG/posteos/2026-10-30-optimizar/`
- [x] PITCH.md listo para enviar (con línea de apoyo Ko-fi al pie de cada pitch)
- [x] Spec del botón "Apoyar el proyecto" lista para cola → `SPEC-apoyar.md`

**Meta de hoy:** contar **1 canal confirmado (Ko-fi)** + **botón en la app por hacer**. Esa es la vara: no abrir Mercado Pago ni GitHub Sponsors hasta que el botón esté en producción.

### SIGUIENTE (esta semana)
- [ ] **Botón "Apoyar el proyecto" en la app** apuntando a `https://ko-fi.com/holisticnavigator` — tarea para la cola (spec en `SPEC-apoyar.md`; implementa Big Pickle vía semáforo). Discreto en Ajustes, sin pop-up, nunca en pantalla de navegación. **Es el próximo hito, ya con el canal confirmado detrás.**
- [ ] **Publicar el reel del paquete 2026-10-30-optimizar** en IG (Diego, desde el celular) y pegar vistas/likes en `ESTADO.md`
- [ ] Diego: crear Mercado Pago UY (checklist 2 en ENLACES.md) — después del botón

### LUEGO (próximas 2-4 semanas)
- [ ] Enviar primeros pitches personalizados a 2-3 clubes uruguayos (YCU prioritario)
- [ ] Crear GitHub Sponsors (checklist 3 en ENLACES.md)
- [ ] Implementar contador no invasivo (Cloudflare Worker gratis) - spec en METRICAS.md
- [ ] Segundo posteo IG (candidato: demo-06 ruta propia + click derecho en mapa)

### CUANDO (cuando haya tracción)
- [ ] Si el perfil sostiene **2+ posteos/semana** (y recién ahí), evaluar auto-posteo por Meta Graph API — documentado en `IG/PLAN.md`, sin implementar. Posting **manual** hasta fase 2: no se pasan credenciales de IG al agente/repo (decisión de Diego, 2026-10-30)
- [ ] Ampliar a contactos argentinos del Plata si hay respuesta orgánica desde UY
- [ ] Considerar README con slots de sponsors cuando haya al menos 1 sponsor confirmado

## Bitácora de decisiones
| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-30 | Ko-fi es el canal #1 y `ko-fi.com/holisticnavigator` es el enlace canónico de "Apoyar" | Un solo enlace, sin muro, sin desparramar URLs; Diego lo prefiere |
| 2026-10-30 | Ko-fi pasa de VIVA a **CONFIRMADA**: Diego conectó los métodos de pago en la página | El bloqueo "Stripe no opera en UY" no se materializó; el canal quedó operativo. Falta solo la prueba de $1 |
| 2026-10-30 | No se abren Mercado Pago ni GitHub Sponsors hasta que el botón "Apoyar" esté en producción | Un canal confirmado + el botón en la app vale más que tres canales sin punto de entrada |
| 2026-10-30 | **Feed de Ko-fi arranca con el post de introducción** y la fuente queda en `KOFI/FUENTE-POST.md` | Copiar-editar en vez de escribir de cero: la próxima actualización cuesta ~2 min de Diego |
| 2026-10-30 | El post de Ko-fi se actualiza **a mano** (1 post por versión, cambia solo "Novedad") | Ko-fi no tiene API pública documentada para el feed; automatizarlo no es viable hoy |

## Decisión final
Mantener app 100% gratis y local-first. Monetización por reconocimiento únicamente. Sin muro, sin ads, sin tracking invasivo.
