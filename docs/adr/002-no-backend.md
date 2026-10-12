# ADR-002: Sin backend — todo local, fuentes externas directas

**Estado:** Aceptado · **Fecha:** 2026-10-07 · **Fase:** P0

## Contexto

El plan inicial contemplaba un backend propio (Ktor + Postgres) para sesión y sync, y consumir el
clima a través del `server.py` de Panamarina Watch. Se corrigió: **la app instalada no tiene acceso
a `server.py`**, solo a fuentes externas, y **no hay backend propio**.

## Decisión

Arquitectura **100% cliente**. Sin servidor nuestro en ninguna parte del camino.

1. **Sesión y datos son locales.** SQLDelight en el dispositivo. La sesión es local (dispositivo),
   no hay cuentas en la nube.
2. **Sync = intercambio de archivos.** El usuario mueve rutas con **GPX / KML / CSV** exportados e
   importados. Extensión futura: nube del usuario (WebDAV / iCloud / Drive), nunca la nuestra.
3. **El clima va directo de la app a las APIs públicas**, con cache TTL local.
4. **`server.py` (Panamarina Watch) es un proyecto hermano**, referente de diseño. No es
   dependencia, no se empaqueta, no se invoca.

## Matriz de fuentes (CORS medido en vivo)

| Fuente | CORS | Uso | Web | Nativo |
|---|---|---|---|---|
| `marine-api.open-meteo.com` | ✅ `*` | oleaje, viento, **corrientes** (`ocean_current_velocity/direction`) | ✅ | ✅ |
| `api.open-meteo.com` | ✅ `*` | pronóstico, sin API key | ✅ | ✅ |
| `api.met.no` | ✅ `*` | pronóstico alternativo | ✅ | ✅ |
| `api.weather.gov` | ✅ `*` | avisos NWS (EE.UU. y territorios) | ✅ | ✅ |
| `nhc.noaa.gov` (`CurrentStorms.json`, `index-{at,ep,cp}.xml`) | ❌ **sin `Access-Control-Allow-Origin`** | tormentas activas, avisos tropicales | ❌ | ✅ |
| `*.github.io`, `raw.githubusercontent.com` | ✅ `*` | hosting estático | ✅ | ✅ |

Verificación: `curl -H "Origin: https://example.com" -D -` sobre cada endpoint (P0, 2026-10-07).

## Consecuencias

- **Positivas:** cero infraestructura, cero coste operativo, cero dependencia de un servidor nuestro;
  la app es usable offline por diseño; la sesión no implica cuentas.
- **Negativas:**
  - el browser **no puede** leer `nhc.noaa.gov` → resuelto en ADR-003 (relay estático);
  - no hay sync automático entre dispositivos → resuelto por export/import GPX;
  - el rate limiting y los cambios de API los absorbe cada cliente (mitigado con cache TTL único
    por fuente y `If-Modified-Since` cuando exista).
- **Límite de arquitectura:** si algún día se necesita sync en tiempo real o cuentas, eso es un
  ADR nuevo y una decisión explícita — no debe introducirse por la puerta trasera de un proxy de clima.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Backend Ktor + Postgres (sync y sesión) | Contradice "no hay backend"; agrega operación y coste |
| Proxy de clima propio | Redundante: la mayoría de fuentes ya envían CORS `*` |
| Relojar `server.py` como API del app | La app instalada no puede alcanzar el `server.py` del usuario |

## Ver también

- ADR-003: relay estático NHC para Web.
- `docs/02-content.md: política de contenido derivado del libro.
