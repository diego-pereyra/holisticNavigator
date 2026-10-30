# PLAN - Programa Sponsors holisticNavigator

**Fecha de arranque:** $(date +%Y-%m-%d)
**Estado:** EN MARCHA (boot inicial)
**Filosofía:** App gratis y abierta. La plata entra por reconocimiento, no por muro.

## Geografía objetivo
- **Centro (70%):** Uruguay - Yacht Club Uruguayo (YCU, Montevideo), YCPU, Colonia del Sacramento, Piriápolis, La Paloma/José Ignacio, charters y escuelas de vela de la costa uruguaya.
- **Secundario (30%):** Cruzadores del Plata desde el lado argentino - San Isidro, Olivos, Club Náutico San Esteban, YCA. La travesía inversa (Argentina→Uruguay / Montevideo→Buenos Aires y viceversa) es caso de uso directo del planner (ventana de clima + mes + optimización). NO es el centro de campaña.

## Canales (orden de gusto)
1. **Ko-fi** (preferido) - recolecta donativos/reconocimiento. Requiere verificar payout desde Uruguay (ver ENLACES.md).
2. **Mercado Pago** (corriente en Uruguay) - cobro local en $UYU/USD. Funcional en UY.
3. **GitHub Sponsors** (UY soportado desde expansión 2022) - payout por banco local vía Stripe Connect.

## Funnel
### AHORA (inmediato)
- [x] Crear estructura `sponsors/` y dossier base
- [ ] Diego crea cuentas en orden: Ko-fi → Mercado Pago → GitHub Sponsors (seguir checklist ENLACES.md)
- [ ] Preparar primer paquete IG (demo-07 optimizar) - EN CURSO/HECHO hoy
- [ ] Tener PITCH.md listo para enviar a primeros contactos

### LUEGO (próximas 2-4 semanas)
- [ ] Enviar primeros pitches personalizados a 2-3 clubes uruguayos (YCU prioritario)
- [ ] Publicar primer reel IG desde paquete preparado
- [ ] Agregar sección "Apoyar el proyecto" en app (tarea para Big Pickle vía semáforo) - discreta en Ajustes, sin pop-up
- [ ] Implementar contador no invasivo (Cloudflare Worker gratis) - spec en METRICAS.md

### CUANDO (cuando haya tracción)
- [ ] Si perfil IG >500 seguidores y tiempo de Diego lo justifica, investigar auto-posteo Meta Graph API (cuenta business + app review) - solo documentar, sin implementar
- [ ] Ampliar a contactos argentinos del Plata si hay respuesta orgánica desde UY
- [ ] Considerar README con slots de sponsors cuando haya al menos 1 sponsor confirmado

## Decisión final
Mantener app 100% gratis y local-first. Monetización por reconocimiento únicamente. Sin muro, sin ads, sin tracking invasivo.
