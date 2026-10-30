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

## Tabla de métricas mensuales
Rellenar mes a mes con datos reales.

| Mes | Visitas aprox (contador) | IG seguidores | IG alcance/impresiones | Pitches enviados | Respuestas | Sponsors confirmados | Notas |
|---|---|---|---|---|---|---|---|
| 2026-10 | ____ | ____ | ____ | ____ | ____ | ____ | Boot inicial |
| 2026-11 | ____ | ____ | ____ | ____ | ____ | ____ | |
| 2026-12 | ____ | ____ | ____ | ____ | ____ | ____ | |
| 2027-01 | ____ | ____ | ____ | ____ | ____ | ____ | |

## Seguimiento IG
Ver `sponsors/IG/PLAN.md` y `sponsors/IG/posteos/*/ESTADO.md`. Actualizar desde lo que Diego pegue del celular.
