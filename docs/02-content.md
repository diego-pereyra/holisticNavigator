# Política de contenido — *World Cruising Routes* (Jimmy Cornell)

**Estado:** Acordado · **Fecha:** 2026-10-07 · **Fase:** P0

> **Nota (2026-10-13):** el catálogo vigente (v2 y el v3 planificado) deriva de la **8.ª edición**
> (EPUB, Jimmy & Doina Cornell), que trae tablas de waypoints GPS, mejor época, temporada de
> tormentas, cartas y guías por ruta. Esta política se escribió para la 2.ª edición; la línea
> hechos/expresión y la capa `tips` se aplican igual. Pendiente (T6.5 del backlog): reescribir este
> documento para la 8.ª y decidir explícitamente la exposición de la tabla de waypoints y su
> exportación GPX (pregunta 2 de `03-ux-architecture.md §9`).

## Fuente

*World Cruising Routes*, Jimmy Cornell, 2ª edición, Adlard Coles Nautical / A & C Black, 1995.
ISBN 0-7136-4070-7. © Jimmy Cornell 1987, 1990, 1995. Todos los derechos reservados.

## Qué entramos al repo

| Artefacto | Ruta | Tratamiento |
|---|---|---|
| El PDF original | `World_Cruising_Routes_*.pdf` (raíz) | Fuente de trabajo. **No se distribuye con el producto.** |
| Dataset estructurado | `data/catalog/v1/*.jsonl` | Hechos derivados (coords, distancias, códigos) |
| Índice de texto | `data/catalog/v1/text/` | Índice de **búsqueda interno** del proyecto |
| Tips | `data/catalog/v1/tips.jsonl` | Derivados propios con atribución, expuestos en la app |

## Línea: hechos vs. expresión

- **Hechos** (no protegibles): coordenadas, códigos de ruta (`AN46`), distancias de círculo máximo,
  ventanas de temporada, meses de temporada de ciclones, agrupación por cuenca/hemisferio.
  → **Sí entran al dataset y a la app.**
- **Expresión** (protegida): redacción, prosa, selección y orden de los capítulos.
  → **No se reproduce en el producto.** No se distribuye el texto íntegro del libro ni un índice
  textual completo dentro de la app pública.

## Capa `tips`

La "sensación de estar inspirado en el libro" se construye con una capa `tips`:

- Tips **redactados por nosotros**, derivados del contenido de cada capítulo
  (p. ej. *"En el Atlántico Norte, la ventana para salir de Canarias es…"*).
- Cada tip lleva `source` (capítulo/título del libro), `attribution` (Jimmy Cornell, 2ª ed.) y
  `page` cuando aplique.
- No se copian párrafos. Si una idea se cita textualmente, se hace corta, entrecomillada y con
  atribución — y se evita por defecto.
- El `tips.jsonl` pasa revisión humana antes de entrar en un release.

El PDF permanece como referencia de trabajo y como insumo del pipeline; no se empaqueta en los
binarios de la app.

## Validación de coordenadas

La edición es de 1995: posiciones de arrecifes e islas calculadas antes de la precisión GNSS
moderna, y el propio Cornell advierte que la latitud suele ser más fiable que la longitud.
Antes de publicar coordenadas en la app:

1. Sanity por dominio (lat ∈ [-90, 90], lon ∈ [-180, 180], sin (0,0)).
2. Detección de *anchor outliers*: un topónimo que aparece en varias rutas pero cuya longitud
   se aleja > 4° de la mediana del resto (misma latitud) es casi siempre una errata o una tabla
   multi-destino que arrastró la coordenada de otra columna.
3. Cruces de tierra: `tools/landcheck.py` (máscara Natural Earth 110m, en `data/land/`) mide la
   corrida de tierra *interior* de cada tramo (se ignoran los dos extremos, que en la máscara
   gruesa caen en la costa). En el build, toda variante con una corrida interior ≥
   `LAND_FLAG_NM` (3 nm) se marca **`needsReview: true`** a nivel de variante y de ruta: la
   polilínea cruza tierra porque faltan waypoints intermedios o hay una coordenada mala.
   La máscara es cruda; 1 nm marcaría ~63 % del catálogo por ruido de costa, 3 nm marca ~429/779
   variantes. Pendiente: un optimizador de ruta que inserte los waypoints que siguen la costa.
4. Cruce con una fuente moderna para waypoints de peligro — los que no validan se marcan
   `needsReview: true` y no se muestran como navegables.

## Erratas de imprenta corregidas (catálogo v2)

La edición trae algunas coordenadas mal impresas. Se corrigen en `tools/build_v2_catalog.py`
(tabla `ERRATA`), deduciendo el valor correcto del mismo topónimo en otras rutas del catálogo:

| Ruta | Waypoint | Impreso (libro) | Corregido |
|---|---|---|---|
| AN18 | Graciosa E | 32°20'S, 51°16'W | 29.25,−13.51 (La Graciosa, Canarias) |
| AN32 | Acebuche | 36°02'N, 27°00'W | 36.042,−5.45 (Gibraltar) |
| AN46B | Gibraltar | 33°03'N, 16°18'W | 36.125,−5.383 (Porto Santo arrastrado) |
| AN141D | Banks | 56°05'N, 6°35'W | 40.0,−50.0 (Grand Banks) |
| AN157C | Christian | 56°53'N, 14°11'W | 60.058,−43.137 (Cabo Christian, Groenlandia) |
| AN177D | Falmouth | 50°08'N, 50°02'W | 50.133,−5.033 (longitud 50→5) |
| AT21A | Belém | 18°25'N, 64°31'W | −1.45,−48.52 (Belém, Brasil) |
| AT21A | Devil N | 15°17.5'N, 50°43'W | 5.29,−52.58 (Isla del Diablo; lat 15 por 5) |
| AT21A | Demerara | 6°58'N, 52°34'W | 6.967,−58.05 (Demerara, Guyana) |
| AN64C | Barbados SW / Bridgetown | 13°28'N, 16°34'W | 13.07/13.09,−59.62 (Barbados; el libro arrastró Banjul) |
| AN134B | Hoyo | 36°55'N, 25°08'W | 36.067,−6.333 (Hoyo, Tarifa; copió el vecino de Azores) |
| AN164A | Faroes S | 61°13'N, 6°44'E | 61.217,−6.733 (Feroe al W; signo invertido) |
| AN165C | Scoresby | 70°46'N, 9°06'W | 70.358,−22.0 (Scoresby Sund; no Jan Mayen) |
| IS13C | Thursday | 10°35'S, 142°13'E | −10.587,142.22 (Torres Strait, no mar de Banda) |
| IS13C | Normanby W | 10°34.5'S, 142°08'E | −10.575,142.133 (Torres Strait) |

`tools/validate_naming.py` (`--only-flags`) reporta las erratas residuales sobre el extract crudo;
`tools/check_quality.py` cubre adicionalmente los outliers de ancla por longitud y los cruces de
tierra. El catálogo ya sale corregido.

