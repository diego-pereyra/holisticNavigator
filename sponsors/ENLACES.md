# ENLACES - Cuentas y checklist de setup

**Responsable de creación:** Diego (sus datos/AFIP). El gestor solo prepara guías/checklist.
**Última actualización:** 2026-10-30 (GitHub Sponsors aprobado → 2 de 3 canales vivos)

## Enlaces de "Apoyar" (decisión vigente)

> **Dos enlaces, roles distintos, los dos visibles. No hay enlace canónico único.**

| Enlace | Rol | URL |
|---|---|---|
| Ko-fi | Aporte puntual (tarjeta / pago único) + vitrina del proyecto (feed) | `https://ko-fi.com/holisticnavigator` |
| GitHub Sponsors | Recurrente (mensual) + corporativo / B2B | `https://github.com/sponsors/diego-pereyra` |

Por qué dos y no uno: el que quiere tirar $5 una vez no quiere suscribirse, y el que
quiere sostener el proyecto mes a mes no quiere acordarse de volver a donar. Ko-fi cubre
el primero y además es la vitrina (feed con 1 post por versión); Sponsors cubre el segundo
y es el único que sirve para un club/empresa que necesita una factura recurrente y nombre
de sponsor.

Reglas:
- **No** se publican alias/CBU, links de pago sueltos ni otras URLs de donación.
- **Mercado Pago UY**, cuando exista, entra **tercero** (cobro local en $UYU), documentado acá
  y ofrecido dentro de la página de Ko-fi — no compite en la app ni en IG hasta que haya
  una razón concreta (p. ej. un club uruguayo que pida transferencia local).
- Ko-fi sigue siendo el preferido de Diego: aporte sin muro y sin cuenta obligatoria para el usuario.
- GitHub Sponsors no cobra comisión de plataforma; el payout va por Stripe Connect a banco local UY.

## Orden de creación (por preferencia)
1. **Ko-fi** (preferido) — HECHO
2. **Mercado Pago** (UY, corriente) — PENDIENTE
3. **GitHub Sponsors** — HECHO

## Estado de canales (semáforo)

**2 de 3 vivos. Queda Mercado Pago UY (el local).**

| Canal | Estado | Enlace | Fecha |
|---|---|---|---|
| Ko-fi | **VIVA** (payout conectado, feed con 1 post; falta prueba de $1 real) | https://ko-fi.com/holisticnavigator | 2026-10-30 |
| GitHub Sponsors | **VIVA — perfil aprobado** (payout Stripe Connect a banco local UY, sin comisión de GitHub); en el repo por `.github/FUNDING.yml` (commit 77287d9) | https://github.com/sponsors/diego-pereyra | 2026-10-30 |
| Mercado Pago UY | **PENDIENTE (Diego crea)** — único canal que falta | — | — |

> **GitHub Sponsors: para Diego el enlace público es `github.com/sponsors/diego-pereyra`.**
> Ese es el que se pega en la app, en el pitch y en el perfil; no hay URL de organización aparte.
>
> Historia del estado: PENDIENTE (2026-10-30) → **VIVA** (2026-10-30, perfil de sponsored developer
> aprobado). El botón "Sponsor this project" ya aparece en la sidebar del repo vía `FUNDING.yml`.

## Checklist por canal

### 1) Ko-fi — VIVA (2026-10-30)
- [x] Crear cuenta en https://ko-fi.com/ (con mail de Diego)
- [x] URL pública: **https://ko-fi.com/holisticnavigator**
- [x] **Métodos de pago conectados** en la página de Ko-fi (2026-10-30, reporte de Diego: PayPal/Stripe conectados). Registrado sin captura; a validar por la prueba de $1.
- [x] **Feed iniciado: 1 post publicado** (2026-10-30) — introducción con imagen destacada `KOFI/post-introduccion-1200x600.png`. Fuente en `KOFI/FUENTE-POST.md` (copiar-editar para el próximo).
- [ ] **Buzón next:** cada versión nueva con feature visible → 1 post en el feed con la sección "Novedad" cambiada (protocolo en `KOFI/FUENTE-POST.md`)
- [ ] **ÚNICO PENDIENTE — prueba de cobro real ($1):** Diego hace un aporte de prueba en `ko-fi.com/holisticnavigator` (autotipado a su misma cuenta) y verifica que (a) entra en Ko-fi, (b) figura el método/moneda usado, (c) llega al payout. Anotar acá fecha + resultado. **Con esto el canal queda cerrado.**
- [ ] Configurar perfil: nombre "holisticNavigator", descripción breve ("app gratis y abierta de navegación marítima para el Río de la Plata y la costa uruguaya"), avatar/portada
- [ ] Verificar desde el celular de Diego que la página carga bien (el chequeo automático 2026-10-30 dio HTTP 403 de Cloudflare — bloquea curl, no prueba nada)
- Estado payout: `CONFIRMADO por métodos conectados — PRUEBA $1 PENDIENTE` — Fecha verificación: 2026-10-30
- **Nota de una línea:** el **canal** Ko-fi queda cerrado en cuanto entre y se acredite el aporte de prueba de $1; el **feed** sí se mantiene (1 post por versión, ver `KOFI/FUENTE-POST.md`).

### 2) Mercado Pago (ÚNICO PENDIENTE)
- [ ] Crear/usar cuenta Mercado Pago Uruguay (https://www.mercadopago.com.uy/)
- [ ] Verificar que permite cobros. Funcional para cobros locales en $UYU.
- [ ] Preferir **link de pago** (no alias/CBU) y pegarlo acá.
- [ ] Pegar enlace real aquí: `MP_LINK: ___________________________`
- [ ] Estado: `PENDIENTE | LISTO | BLOQUEADO` - Fecha: ____/____/____
- **Nota:** es el canal "local" — el que le sirve a un socio uruguayo que no tiene tarjeta internacional ni quiere hacerse cuenta en Ko-fi/GitHub.

### 3) GitHub Sponsors — VIVA (2026-10-30)
- [x] Elegibilidad aprobada: **perfil de sponsored developer aprobado**
- [x] Página viva: **https://github.com/sponsors/diego-pereyra**
- [x] Payout: **Stripe Connect a banco local (UY)**, sin comisión de GitHub
- [x] `.github/FUNDING.yml` en el repo (commit 77287d9): `github: diego-pereyra` + `ko-fi: holisticnavigator` → botón "Sponsor this project" en la sidebar
- [x] Pegar enlace real aquí: `GITHUB_SPONSORS_URL: https://github.com/sponsors/diego-pereyra`
- [ ] **Meta del perfil** (5 min): bio de 1 línea, foto/avatar, sitio `https://diego-pereyra.github.io/holisticNavigator/`, descripción de "why sponsor"
- [ ] **Tiers recurrentes 3 / 5 / 10 USD/mes** con descripción cada uno — **hacer si Diego no lo hizo ya al aprobar el perfil**
- [ ] Probar con un sponsor de prueba (o el propio Diego) que el cobro y la confirmación funcionan
- [ ] Estado: **VIVA** — Fecha: 2026-10-30

> Nota para Diego: los tiers son lo que separa "una página viva" de "un canal que cobra".
> Sin tiers, el sponsor cae en el monto libre y no hay recurrencia. Nombrarlos simple:
> 3 = "un café por mes", 5 = "un café y medio", 10 = "sostener el proyecto".

## Notas
- No guardar credenciales en este repo. Solo enlaces públicos.
- Si Ko-fi queda bloqueado por payout UY, el respaldo ya está vivo: GitHub Sponsors.
- Cualquier cambio de estado debe reflejarse en `sponsors/PLAN.md`.
