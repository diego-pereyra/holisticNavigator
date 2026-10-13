# ADR-006: Relay NHC publicado en una rama `data` (enmienda al ADR-003)

**Estado:** Propuesto · **Fecha:** 2026-10-13 · **Fase:** P-C

## Contexto

El ADR-003 decidió un relay estático de NHC en GitHub Pages. Al implementarse el deploy a Pages
(`deploy-pages.yml`), el sitio se publica como artefacto de un build Gradle completo: refrescar
`nhc.json` cada 10–15 minutos por ese camino implicaría reconstruir la app cada vez (minutos de CI y
despliegues innecesarios). Hoy `nhc.json` es un placeholder vacío empaquetado en el bundle y el relay
no existe.

ADR-002 verificó que `raw.githubusercontent.com` responde con `access-control-allow-origin: *`.

## Decisión

1. Un workflow `relay-nhc.yml` (cron cada 15 min) ejecuta `relay/fetch_nhc.py`, que lee
   `CurrentStorms.json` e `index-{at,ep,cp}.xml` de NHC y escribe `nhc/nhc.json` (esquema 1 del
   ADR-003) en la rama **`data`** del mismo repo, **solo si el contenido cambió**.
2. La app Web lee `https://raw.githubusercontent.com/diego-pereyra/holisticNavigator/data/nhc/nhc.json`
   con *network-first* (timeout 8 s), guarda la última copia en el store local con su `fetchedAt`, y
   degrada a esa copia y, en último término, al `nhc.json` empaquetado.
3. La UI muestra **siempre** la antigüedad del dato ("avisos de hace 12 min" / "últimos avisos de
   hace 2 d · sin conexión"). Un aviso sin edad no se muestra.
4. Si NHC falla, el job no toca el archivo (queda el último bueno) y termina en verde con una
   anotación.

## Por qué

- Sigue siendo "archivos planos, sin autenticación, sin lógica de negocio": no es un backend.
- Separa el ciclo de datos (minutos) del ciclo de la app (días); el deploy de Pages no se toca.
- La rama `data` tiene historial: se puede auditar cada snapshot.

## Consecuencias

- **Positivas:** relay real con cero infraestructura; la app nativa futura puede leer NHC directo o
  la misma rama; edad del dato visible, que es lo que un navegante necesita para confiar.
- **Negativas:** `raw.githubusercontent.com` cachea ~5 min y tiene límites de tasa generosos pero no
  garantizados; el repo público expone el historial del feed (no es un problema: es dato público de
  NOAA). Si GitHub cambiara el CORS de `raw`, el fallback es volver al artefacto de Pages del ADR-003.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Re-desplegar Pages cada 15 min | Build Gradle completo por refresco; lento y frágil |
| Segundo repo solo para datos con Pages | Funciona, pero dispersa el proyecto sin ganancia |
| Leer NHC directo desde el browser | Sin CORS (ADR-002) |
