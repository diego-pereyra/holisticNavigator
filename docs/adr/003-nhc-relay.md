# ADR-003: Relay estático de NHC para el target Web

**Estado:** Aceptado · **Fecha:** 2026-10-07 · **Fase:** P0 (implementación en P3)

## Contexto

`nhc.noaa.gov` es la única fuente de tormentas tropicales activas y avisos por cuenca
(`CurrentStorms.json` + `index-at.xml` / `index-ep.xml` / `index-cp.xml`), pero **no envía cabeceras
CORS**. El browser del target Web no puede leerla. Android e iOS sí pueden (cliente nativo sin CORS).

## Decisión

Publicar un **relay 100% estático**: un cron en GitHub Actions consulta NHC cada ~10 minutos y
publica `nhc.json` + los avisos convertidos a JSON en **GitHub Pages**. La app Web lo lee como un
archivo estático.

```
GitHub Actions (cron 10 min)
   └─► nhc.noaa.gov (server-side, sin CORS)
         └─► dist/nhc.json, dist/advisories.json, dist/last-update.txt
               └─► GitHub Pages (*.github.io → access-control-allow-origin: * ✅)
                     └─► App Web (target JS)
App Android / iOS ─────────────────► nhc.noaa.gov directo (sin CORS) ✅
```

No es un backend: **archivos planos, sin autenticación, sin base de datos, sin lógica de negocio.**
El único "código" del relay es el job que convierte el feed al formato del app.

## Por qué GitHub Pages

- Sin coste y sin operación.
- Verificado: `*.github.io` devuelve `access-control-allow-origin: *`.
- El fallback del job es publicar el último snapshot válido, así que un fallo de NHC no vacía el feed.

## Esquema del artefacto

```jsonc
// dist/nhc.json
{
  "schema": 1,
  "source": "noaa-nhc",
  "fetchedAt": "2026-10-07T19:50:00Z",
  "storms": [ { "basin": "AT", "name": "...", "classification": "...",
                "intensity": 45, "lat": 0.0, "lon": 0.0, "advisoryUrl": "..." } ],
  "advisories": [ { "basin": "AT", "title": "...", "link": "...", "date": "..." } ]
}
```

`schema` versionado: si cambia, el cliente degrada al último formato que entienda y no rompe.

## Consecuencias

- **Positivas:** los tres targets ven los mismos datos; el cliente Web conserva la latencia de un
  archivo estático; cero dependencia de un servidor nuestro.
- **Negativas:**
  - hay ~10 min de rezago (irrelevante para avisos tropicales, cuyo ciclo es de 6 h);
  - el job depende de GitHub Actions (si falla, el app sirve el último snapshot — degradación
    aceptable, no corte);
  - hay dos caminos de obtención (directo y relay) que deben producir **el mismo esquema** → el
    parseador es único en `shared/`, solo cambia el origen.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Omitir NHC en Web | Pierde la función más valiosa en la temporada de ciclones |
| Solo `api.weather.gov` | CORS ✅ pero cubre solo EE.UU./territorios, no la cuenca completa |
| Proxy propio (CF Worker / serverless) | Vuelve a ser un backend operado por nosotros |
| CORS proxy público de terceros | Indisponibilidad y problema de seguridad (SSRF) |

## Nota de diseño

El relay se documenta en `relay/` y su workflow. La implementación ocurre en **P3**, junto con el
target Web, porque hasta entonces no hay cliente que lo consuma.
