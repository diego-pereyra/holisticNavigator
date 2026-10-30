# METRICAS - Contador no invasivo y seguimiento

## Contador no invasivo (propuesta)
**Objetivo:** Medir uso real sin tracking invasivo, sin cookies de terceros, sin fingerprinting agresivo.

**Propuesta técnica (para Big Pickle vía semáforo):**
- **Frontend:** Pixel/chip mínimo en la app (solo si usuario no está en modo estricto). Contador de "visitas únicas aproximadas" por día/semana/mes.
- **Backend:** Cloudflare Worker gratis (sin base de datos pesada). Usar KV o simplemente contador por clave con rate-limit.
- **Privacidad:** No guardar IP completa, no user-agent detallado, no IDs persistentes cross-site. Agregar hash diario con salt rotativo o simplemente contar pageviews agregados.
- **Ubicación:** Discreto, sin UI visible. Solo para métricas internas del proyecto.
- **Estado:** ESPECIFICAR - listo para pasar a cola de semáforo cuando corresponda.

**Checklist implementación:**
- [ ] Spec detallada para tarea semáforo (endpoint, payload mínimo, privacidad)
- [ ] Worker en Cloudflare (gratis) - Diego/arquitecto configuran cuenta si necesario
- [ ] Integración discreta en web/src (solo Big Pickle)
- [ ] Documentar en este archivo números mensuales

## Seguimiento GitHub Sponsors
Fuente única: **dashboard de Sponsors** → https://github.com/sponsors/diego-pereyra/dashboard
(sponsorships activos, altas/bajas del mes, ingreso recurrente y de una vez). Se pega acá una vez
por mes; no hace falta ninguna herramienta nueva.

| Mes | Sponsorships activos | Nuevos | Bajas | MRR (USD) | Puntual (USD) | Notas |
|---|---|---|---|---|---|---|
| 2026-10 | ____ | ____ | ____ | ____ | ____ | Perfil **aprobado 2026-10-30** (payout Stripe Connect a banco UY, sin comisión de GitHub). Sin tiers 3/5/10 confirmados: si no están, la recurrencia no arranca |
| 2026-11 | ____ | ____ | ____ | ____ | ____ | |
| 2026-12 | ____ | ____ | ____ | ____ | ____ | |

**Lectura obligatoria de esta tabla:** lo que importa es **NUEVOS por mes**, no el total. Total
plano con nuevos en 0 = el canal está vivo pero nadie llega; ahí el problema es el embudo
(pitch/IG/app), no el canal. Total plano con nuevos > 0 y bajas iguales = retención, no captación.

## Tabla de métricas mensuales
Rellenar mes a mes con datos reales.

| Mes | Visitas aprox (contador) | IG seguidores | IG alcance/impresiones | Pitches enviados | Respuestas | Sponsors (activos / nuevos) | Notas |
|---|---|---|---|---|---|---|---|
| 2026-10 | ____ | ____ | ____ | ____ | ____ | 0 / 0 | Boot inicial. **2 de 3 canales vivos**: Ko-fi VIVA 2026-10-30 (payout conectado, feed con 1 post, falta prueba de $1) y **GitHub Sponsors VIVA 2026-10-30** (perfil aprobado, falta meta + tiers). Mercado Pago UY pendiente |
| 2026-11 | ____ | ____ | ____ | ____ | ____ | ____ | |
| 2026-12 | ____ | ____ | ____ | ____ | ____ | ____ | |
| 2027-01 | ____ | ____ | ____ | ____ | ____ | ____ | |

## Seguimiento IG
Ver `sponsors/IG/PLAN.md` y `sponsors/IG/posteos/*/ESTADO.md`. Actualizar desde lo que Diego pegue del celular.

## Nota de fuente (una línea)
Todo lo de Sponsors sale del dashboard de GitHub; todo lo de Ko-fi, del panel de Ko-fi; lo de IG,
de lo que Diego pega del celular. Cero integraciones nuevas para medir esto.

## Seguimiento feed Ko-fi
Ko-fi muestra vistas y likes por post en el panel. Pegar acá lo que vea Diego (no hay que registrarse en nada nuevo).

| Fecha | Post | Vistas | Likes | Comentarios | Notas |
|---|---|---|---|---|---|
| 2026-10-30 | Introducción (polares 27–45 pies) | ____ | ____ | ____ | Primer post del feed; fuente en `KOFI/FUENTE-POST.md` |
