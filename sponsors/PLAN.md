# PLAN - Programa Sponsors holisticNavigator

**Fecha de arranque:** 2026-10-30
**Estado:** EN MARCHA — **2 de 3 canales vivos**: Ko-fi (payout conectado, feed con 1 post) y **GitHub Sponsors (perfil aprobado 2026-10-30)**. Falta el botón en la app, la prueba de $1 de Ko-fi y Mercado Pago UY (el local).
**Filosofía:** App gratis y abierta. La plata entra por reconocimiento, no por muro.
**Meta de la semana:** el botón "Apoyar" en la app con los **dos** enlaces vivos + tiers de Sponsors configurados. Nada más.

## Geografía objetivo
- **Centro (70%):** Uruguay - Yacht Club Uruguayo (YCU, Montevideo), YCPU, Colonia del Sacramento, Piriápolis, La Paloma/José Ignacio, charters y escuelas de vela de la costa uruguaya.
- **Secundario (30%):** Cruzadores del Plata desde el lado argentino - San Isidro, Olivos, Club Náutico San Esteban, YCA. La travesía inversa (Argentina→Uruguay / Montevideo→Buenos Aires y viceversa) es caso de uso directo del planner (ventana de clima + mes + optimización). NO es el centro de campaña.

## Canales (orden de gusto)
1. **Ko-fi** (preferido) - **VIVA + feed iniciado**: https://ko-fi.com/holisticnavigator (2026-10-30). Página pública, payout conectado (PayPal/Stripe) y **1 post en el feed** (introducción, 2026-10-30). Fuente del post: `KOFI/FUENTE-POST.md`. Falta solo la prueba de cobro de $1 (ver ENLACES.md).
2. **Mercado Pago** (corriente en Uruguay) - cobro local en $UYU/USD. Funcional en UY. PENDIENTE de creación.
3. **GitHub Sponsors** - **VIVA**: https://github.com/sponsors/diego-pereyra (perfil de sponsored developer aprobado 2026-10-30). Payout por Stripe Connect a banco local UY, **sin comisión de GitHub**. Ya está en `.github/FUNDING.yml` (commit 77287d9). Pendiente de config: meta + tiers 3/5/10 (ver ENLACES.md).

## "Apoyar" con dos enlaces visibles (cambia la decisión de enlace canónico único)
Queda **sin efecto** la decisión del 2026-10-30 de un solo enlace canónico. Ahora "Apoyar"
muestra **los dos**, con la división de roles en una línea:

> **Ko-fi = aporte puntual (tarjeta / pago único) + vitrina del proyecto (feed).**
> **GitHub Sponsors = recurrente mensual + corporativo (club/empresa que necesita factura y nombre de sponsor).**

| Enlace | Rol | Dónde |
|---|---|---|
| `https://ko-fi.com/holisticnavigator` | puntual + vitrina | app (fila 1), bio IG, pie de pitch, README |
| `https://github.com/sponsors/diego-pereyra` | recurrente + corporativo | app (fila 2), pie de pitch, README, botón del repo (`FUNDING.yml`) |

Un solo enlace perdía a uno de los dos públicos: el que tira $5 una vez no se suscribe, y el
club que quiere sostener el proyecto no dona suelto. Dos filas cuestan lo mismo que una y
cubren los dos casos. Reglas completas en `ENLACES.md`.

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
- [x] PITCH.md listo para enviar (pie con **los dos** enlaces: Ko-fi puntual · Sponsors recurrente)
- [x] **GitHub Sponsors aprobado** — https://github.com/sponsors/diego-pereyra (2026-10-30) ✅ y `FUNDING.yml` en el repo (77287d9) ✅
- [x] Spec de la sección "Apoyar el proyecto" **rev. 2 con dos filas** lista para cola → `SPEC-apoyar.md`

**Cierre del AHORA:** los **2 canales internacionales** están vivos. La vara ahora es el **botón en la app con las dos filas**, no abrir canales: Mercado Pago UY queda y espera.

### SIGUIENTE (esta semana)
- [ ] **Botón "Apoyar el proyecto" en la app** con **dos filas** — "Aporte puntual (Ko-fi)" y "Sostener todos los meses (Sponsors)" — tarea para la cola (spec actualizada en `SPEC-apoyar.md`; implementa Big Pickle vía semáforo). Discreto en Ajustes, sin pop-up, nunca en pantalla de navegación. **Es el próximo hito, con los dos canales vivos detrás.**
- [ ] Diego: **meta + tiers 3/5/10 de GitHub Sponsors** (si no quedaron al aprobar el perfil) — 5 min, checklist 3 en ENLACES.md
- [ ] **Publicar el reel del paquete 2026-10-30-optimizar** en IG (Diego, desde el celular) y pegar vistas/likes en `ESTADO.md`
- [ ] Diego: crear Mercado Pago UY (checklist 2 en ENLACES.md) — después del botón; es el canal local

### LUEGO (próximas 2-4 semanas)
- [ ] Enviar primeros pitches personalizados a 2-3 clubes uruguayos (YCU prioritario)
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
| 2026-10-30 | **GitHub Sponsors aprobado → VIVA**; se suma `github: diego-pereyra` al `FUNDING.yml` (commit 77287d9) | El canal internacional recurrente salió antes de lo previsto; payout a banco UY sin comisión de GitHub |
| 2026-10-30 | **Se abandona el "enlace canónico único"**: "Apoyar" muestra Ko-fi + Sponsors con roles separados | Ko-fi = puntual/vitrina, Sponsors = recurrente/corporativo; dos públicos, dos filas, mismo costo de UI |
| 2026-10-30 | Mercado Pago UY pasa a ser el **único canal pendiente** y sigue esperando al botón | No tiene sentido abrir el canal local sin el punto de entrada en la app |

## Decisión final
Mantener app 100% gratis y local-first. Monetización por reconocimiento únicamente. Sin muro, sin ads, sin tracking invasivo.
