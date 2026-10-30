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
| Ko-fi | **VIVA** (cuenta creada y pública) | https://ko-fi.com/holisticnavigator | 2026-10-30 |
| Mercado Pago UY | PENDIENTE (Diego crea) | — | — |
| GitHub Sponsors | PENDIENTE (Diego crea) | — | — |

> Ko-fi VIVA = la URL pública existe y se puede compartir. **Payout desde Uruguay todavía SIN verificar** (ver checklist 1). Hasta verificarlo, los aportes pueden entrar pero no confirmamos que se puedan retirar.

## Checklist por canal

### 1) Ko-fi — VIVA (2026-10-30)
- [x] Crear cuenta en https://ko-fi.com/ (con mail de Diego)
- [x] URL pública: **https://ko-fi.com/holisticnavigator**
- [ ] Configurar perfil: nombre "holisticNavigator", descripción breve ("app gratis y abierta de navegación marítima para el Río de la Plata y la costa uruguaya"), avatar/portada
- [ ] **VERIFICAR PAYOUT DESDE URUGUAY** - CRÍTICO, sigue abierto
  - Ko-fi permite recibir donativos; el retiro puede ir por PayPal o Stripe según configuración
  - **Stripe NO opera en Uruguay** → si pide Stripe Connect, NO es viable directamente
  - **PayPal Uruguay** tiene limitaciones para recibir cobros/ingresos comerciales en algunos casos
  - **ACCIÓN:** entrar a "Withdraw funds" / payout con la cuenta UY y anotar qué opciones aparecen realmente. Anotar fecha + captura + fuente.
- [x] Pegar enlace real: `KO_FI_URL: https://ko-fi.com/holisticnavigator`
- [ ] Verificar en navegador que la página carga (chequeo automático 2026-10-30 dio HTTP 403 de Cloudflare — bloquea curl, no prueba nada; mirar desde el celular de Diego)
- Estado payout: `VERIFICANDO` — Fecha verificación: ____/____/____
- Si payout queda bloqueado: mantener Ko-fi como vidriera y priorizar Mercado Pago + GitHub Sponsors para el cobro real (documentar acá).

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
