# ENLACES - Cuentas y checklist de setup

**Responsable de creación:** Diego (sus datos/AFIP). El gestor solo prepara guías/checklist.
**Última actualización:** 2026-10-30

## Enlace canónico de "Apoyar" (decisión cerrada)

> **`https://ko-fi.com/holisticnavigator` es el ÚNICO enlace de "Apoyar el proyecto".**

Un solo enlace para no desparramar URLs. Se usa tal cual, sin variantes ni parámetros, en:

| Dónde | Cómo |
|---|---|
| App → Ajustes → "Apoyar el proyecto" | Botón que abre `https://ko-fi.com/holisticnavigator` en pestaña nueva (`rel="noopener"`) |
| Portada de la app (si se agrega) | Mismo enlace, texto discreto, nunca pop-up |
| Bio de Instagram | Mismo enlace (ver `IG/PLAN.md`) |
| Mails de pitch (`PITCH.md`) | Mismo enlace, solo si preguntan cómo apoyar |
| README (cuando toque) | Mismo enlace |

Reglas del enlace canónico:
- **No** se publican alias/CBU, links de pago sueltos ni otras URLs de donación.
- Si algún canal alternativo (Mercado Pago, GitHub Sponsors) se activa, **no** reemplaza este enlace: queda como opción secundaria **dentro** de la página de Ko-fi o documentado acá, nunca compitiendo en la app/IG.
- Ko-fi es el preferido por Diego: recolecta aportes voluntarios sin muro y sin cuenta obligatoria para el usuario.

## Orden de creación (por preferencia)
1. **Ko-fi** (preferido) — HECHO
2. **Mercado Pago** (UY, corriente)
3. **GitHub Sponsors** (UY soportado)

## Estado de canales (semáforo)

| Canal | Estado | Enlace | Fecha |
|---|---|---|---|
| Ko-fi | **VIVA + feed iniciado (1 post)** — página pública, payout conectado (PayPal/Stripe), primer post del feed publicado 2026-10-30; falta prueba de $1 real | https://ko-fi.com/holisticnavigator | 2026-10-30 |
| Mercado Pago UY | PENDIENTE (Diego crea) | — | — |
| GitHub Sponsors | PENDIENTE (Diego crea) | — | — |

> **Ko-fi VIVA + feed iniciado = página pública, payout conectado y feed con 1 post.** Diego conectó los métodos de pago (2026-10-30; reportado como PayPal/Stripe) y publicó el **primer post del feed** ese mismo día (introducción; fuente en `KOFI/FUENTE-POST.md`). La URL es pública y los aportes pueden entrar. Lo único que falta para cerrar el círculo: **un aporte de prueba de $1** (autotipado) y verlo acreditarse.
>
> Historia del estado: VIVA (2026-10-30, cuenta pública) → CONFIRMADA (2026-10-30, métodos de pago conectados) → **VIVA + feed iniciado (1 post)** (2026-10-30). El bloqueo teórico previo ("Stripe no opera en UY / PayPal UY con límites") **no se materializó**: Diego reporta conexión exitosa. Queda a confirmar por la prueba real qué método quedó activo y en qué moneda.

## Checklist por canal

### 1) Ko-fi — VIVA + feed iniciado (2026-10-30)
- [x] Crear cuenta en https://ko-fi.com/ (con mail de Diego)
- [x] URL pública: **https://ko-fi.com/holisticnavigator**
- [x] **Métodos de pago conectados** en la página de Ko-fi (2026-10-30, reporte de Diego: PayPal/Stripe conectados). Registrado sin captura; a validar por la prueba de $1.
- [x] Pegar enlace real: `KO_FI_URL: https://ko-fi.com/holisticnavigator`
- [x] **Feed iniciado: 1 post publicado** (2026-10-30) — introducción con imagen destacada `KOFI/post-introduccion-1200x600.png`. Fuente en `KOFI/FUENTE-POST.md` (copiar-editar para el próximo).
- [ ] **Buzón next:** cada versión nueva con feature visible → 1 post en el feed con la sección "Novedad" cambiada (protocolo en `KOFI/FUENTE-POST.md`)
- [ ] **ÚNICO PENDIENTE — prueba de cobro real ($1):** Diego hace un aporte de prueba en `ko-fi.com/holisticnavigator` (autotipado a su misma cuenta) y verifica que (a) entra en Ko-fi, (b) figura el método/moneda usado, (c) llega al payout. Anotar acá fecha + resultado. **Con esto el canal queda cerrado.**
- [ ] Configurar perfil: nombre "holisticNavigator", descripción breve ("app gratis y abierta de navegación marítima para el Río de la Plata y la costa uruguaya"), avatar/portada
- [ ] Verificar desde el celular de Diego que la página carga bien (el chequeo automático 2026-10-30 dio HTTP 403 de Cloudflare — bloquea curl, no prueba nada)
- Estado payout: `CONFIRMADO por métodos conectados — PRUEBA $1 PENDIENTE` — Fecha verificación: 2026-10-30
- **Nota de una línea:** el **canal** Ko-fi queda cerrado en cuanto entre y se acredite el aporte de prueba de $1; el **feed** sí se mantiene (1 post por versión, ver `KOFI/FUENTE-POST.md`).

> Notas que ya no aplican (histórico): el miedo a que "Stripe no opera en UY" bloqueara el canal **no se dio** — Diego conectó los métodos de pago y Ko-fi quedó operativo. Si más adelante un retiro grande falla, la salida sigue siendo priorizar Mercado Pago + GitHub Sponsors para el cobro real.

### 2) Mercado Pago (SEGUNDO)
- [ ] Crear/usar cuenta Mercado Pago Uruguay (https://www.mercadopago.com.uy/)
- [ ] Verificar que permite cobros. Funcional para cobros locales en $UYU.
- [ ] Considerar link de cobro / botón "Donar" o simplemente compartir alias/CBU? Preferir **link de pago** si disponible.
- [ ] Pegar enlace real aquí: `MP_LINK: ___________________________`
- [ ] Estado: `PENDIENTE | LISTO | BLOQUEADO` - Fecha: ____/____/____

### 3) GitHub Sponsors (TERCERO)
- [ ] Verificar elegibilidad: https://github.com/sponsors
- [ ] Uruguay **soportado** desde expansión 2022. Payout por banco local vía Stripe Connect.
- [ ] Si el repo cumple requisitos, habilitar GitHub Sponsors para el perfil/organización
- [ ] Completar información fiscal/bancaria según pide GitHub
- [ ] Pegar enlace real aquí: `GITHUB_SPONSORS_URL: ___________________________`
- [ ] Estado: `PENDIENTE | LISTO | BLOQUEADO` - Fecha: ____/____/____

## Notas
- No guardar credenciales en este repo. Solo enlaces públicos.
- Si Ko-fi queda bloqueado por payout UY, priorizar Mercado Pago + GitHub Sponsors y documentar alternativa.
- Cualquier cambio de estado debe reflejarse en `sponsors/PLAN.md`.
