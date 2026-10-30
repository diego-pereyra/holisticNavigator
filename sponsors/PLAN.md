# PLAN - Programa Sponsors holisticNavigator

**Fecha de arranque:** 2026-10-30
**Estado:** EN MARCHA — primer canal real arriba (Ko-fi VIVA)
**Filosofía:** App gratis y abierta. La plata entra por reconocimiento, no por muro.

## Geografía objetivo
- **Centro (70%):** Uruguay - Yacht Club Uruguayo (YCU, Montevideo), YCPU, Colonia del Sacramento, Piriápolis, La Paloma/José Ignacio, charters y escuelas de vela de la costa uruguaya.
- **Secundario (30%):** Cruzadores del Plata desde el lado argentino - San Isidro, Olivos, Club Náutico San Esteban, YCA. La travesía inversa (Argentina→Uruguay / Montevideo→Buenos Aires y viceversa) es caso de uso directo del planner (ventana de clima + mes + optimización). NO es el centro de campaña.

## Canales (orden de gusto)
1. **Ko-fi** (preferido) - **VIVA**: https://ko-fi.com/holisticnavigator (2026-10-30). Falta verificar payout desde Uruguay (ver ENLACES.md).
2. **Mercado Pago** (corriente en Uruguay) - cobro local en $UYU/USD. Funcional en UY. PENDIENTE de creación.
3. **GitHub Sponsors** (UY soportado desde expansión 2022) - payout por banco local vía Stripe Connect. PENDIENTE de creación.

## Enlace canónico
`https://ko-fi.com/holisticnavigator` es el **único** enlace de "Apoyar" (app, portada, bio IG, pitch, README). Decisión y reglas en `ENLACES.md`.

## Funnel
### AHORA (inmediato)
- [x] Crear estructura `sponsors/` y dossier base
- [x] **Ko-fi creado y público** — https://ko-fi.com/holisticnavigator (2026-10-30) ✅
- [ ] Diego: completar perfil Ko-fi (nombre, descripción, avatar/portada) + verificar payout UY
- [x] Preparar primer paquete IG (demo-07 optimizar) — paquete listo en `IG/posteos/2026-10-30-optimizar/`
- [x] PITCH.md listo para enviar (actualizar con enlace canónico cuando se envíe)
- [x] Spec del botón "Apoyar el proyecto" lista para cola → `SPEC-apoyar.md`

### SIGUIENTE (esta semana)
- [ ] **Botón "Apoyar el proyecto" en la app** apuntando a `https://ko-fi.com/holisticnavigator` — tarea para la cola (spec en `SPEC-apoyar.md`; implementa Big Pickle vía semáforo). Discreto en Ajustes, sin pop-up, nunca en pantalla de navegación.
- [ ] **Publicar el reel del paquete 2026-10-30-optimizar** en IG (Diego, desde el celular) y pegar vistas/likes en `ESTADO.md`
- [ ] Diego: crear Mercado Pago UY (checklist 2 en ENLACES.md)

### LUEGO (próximas 2-4 semanas)
- [ ] Enviar primeros pitches personalizados a 2-3 clubes uruguayos (YCU prioritario)
- [ ] Crear GitHub Sponsors (checklist 3 en ENLACES.md)
- [ ] Implementar contador no invasivo (Cloudflare Worker gratis) - spec en METRICAS.md
- [ ] Segundo posteo IG (candidato: demo-06 ruta propia + click derecho en mapa)

### CUANDO (cuando haya tracción)
- [ ] Si perfil IG >500 seguidores y tiempo de Diego lo justifica, investigar auto-posteo Meta Graph API (cuenta business + app review) - solo documentar, sin implementar
- [ ] Ampliar a contactos argentinos del Plata si hay respuesta orgánica desde UY
- [ ] Considerar README con slots de sponsors cuando haya al menos 1 sponsor confirmado

## Bitácora de decisiones
| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-30 | Ko-fi es el canal #1 y `ko-fi.com/holisticnavigator` es el enlace canónico de "Apoyar" | Un solo enlace, sin muro, sin desparramar URLs; Diego lo prefiere |
| 2026-10-30 | Payout Ko-fi queda "VERIFICANDO" aunque el canal esté VIVA | Stripe no opera en UY y PayPal UY tiene límites: no prometemos cobro hasta probarlo |

## Decisión final
Mantener app 100% gratis y local-first. Monetización por reconocimiento únicamente. Sin muro, sin ads, sin tracking invasivo.
