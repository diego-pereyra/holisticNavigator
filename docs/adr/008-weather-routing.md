# ADR-008: Motor de enrutado — tierra, climatología y viento en tiempo real

**Estado:** Propuesto (diseño; implementación tras E8 y E11) · **Fecha:** 2026-10-13 · **Fase:** P-I

## Contexto

Diego pide (2026-10-13) un algoritmo que mejore las rutas en tres niveles crecientes:

1. **Tierra**: hoy 164 de 400 rutas del catálogo tienen tramos que cruzan la máscara de tierra
   (faltan waypoints intermedios junto a la costa). Es "lo de menos", pero hay que resolverlo.
2. **Clima del mes**: con las pilot charts empaquetadas (E8) poder trazar la ruta más favorable para
   el mes de planificación, no solo mostrar la de Cornell.
3. **Viento en tiempo real**: con el pronóstico, pedir *la mejor ruta con el viento actual*,
   esquivando vientos fuertes y resolviendo bien la **ceñida** (cuándo y cuántas veces virar).

Diego propuso MILP (programación lineal entera mixta). Este ADR evalúa esa opción contra el estado
del arte y fija el diseño.

## Qué hace el estado del arte

Todos los routers de vela en uso (Expedition, Adrena, TimeZero, qtVlm, SailGrib, el plugin Weather
Routing de OpenCPN, Windy Sail Router) usan el **método de isócronas** (Hagiwara, 1989) o variantes
con búsqueda en grafo (Dijkstra / A* sobre una rejilla espacio-tiempo). El esquema:

```
frontera_0 = { origen, t0 }
repetir cada Δt (1–3 h):
  para cada punto p de la frontera, para cada rumbo θ en un abanico (36–72 rumbos):
     viento(p, t) ← pronóstico interpolado en espacio y tiempo
     TWA ← θ − dirección del viento ;  velocidad ← polar(TWA, TWS)  (0 si TWA está en la zona muerta)
     q ← avanzar p a velocidad durante Δt (+ deriva por corriente si hay)
     descartar q si: cruza tierra · TWS > máx · ola > máx · zona prohibida · dentro del margen costero
  frontera_{n+1} ← envolvente exterior de los q (uno por sector angular desde el origen: poda)
hasta que la frontera alcanza el destino; reconstruir hacia atrás
```

- Las **ceñidas** emergen solas: cuando el destino está contra el viento, la frontera avanza en
  zigzag porque la polar no permite rumbos dentro del cono muerto (±40–45°). Se añade un **coste
  de virada** (minutos perdidos por bordo) para que el algoritmo no vire cada paso, y un límite de
  bordos por tramo. El resultado dice "tramo de ceñida: 3 bordos, virar en X".
- **Esquivar vientos fuertes** es una restricción de poda (TWS máxima, ola máxima, "comodidad"
  ponderada), no un objetivo: la ruta simplemente no pasa por ahí.
- Complejidad: `pasos × puntos_frontera × rumbos` ≈ 200 × 300 × 48 ≈ 3 millones de evaluaciones de
  polar para 20 días a 3 h. En JavaScript dentro de un Web Worker: segundos, sin librerías.
- Debilidades conocidas (literatura 2024 sobre mejoras del método): islas que "atrapan" la frontera y
  óptimos locales. Se mitigan con la poda por sectores, con A* sobre rejilla como alternativa cuando
  hay mucha costa, y con el "margen costero".

## Por qué no MILP (y dónde sí)

MILP sirve para problemas **lineales con decisiones discretas**. El enrutado a vela es:

- **No lineal**: la velocidad del barco es una función polar `v(TWA, TWS)` tabulada, y el avance
  depende de la posición y del tiempo (el viento cambia). Linealizarla por tramos para MILP exige
  variables binarias por tramo de polar, por celda espacial y por paso de tiempo: una red
  espacio-temporal de decenas de millones de binarias para una travesía oceánica.
- **De horizonte largo y dinámico**: 15–25 días de pronóstico + climatología. El MILP debería
  rehacerse entero en cada actualización del GRIB.
- **Sin solver en el browser que quepa en el presupuesto**: `glpk.js` o `highs.js` son 1–3 MB de wasm y
  tardan minutos en modelos de ese tamaño, contra los ≤ 1,2 MB de primera carga y "segundos" que fija
  `03-ux-architecture.md §6 quater`. El método de isócronas son ~400 líneas de TypeScript.
- La literatura académica que usa optimización matemática para vela (p. ej. *Optimization-Based
  Weather Routing for Sailboats*, control estocástico de trayectorias) formula **programación
  dinámica / control óptimo no lineal**, no MILP, y confirma que las isócronas son la solución
  práctica "subóptima pero suficiente" del sector.

Dónde sí tiene sentido un pequeño problema entero: **la elección discreta de bordos en una ceñida
corta** (cuántos bordos, dónde virar, con coste fijo por virada) y **la selección de waypoints de
paso** entre alternativas de Cornell (A/B/C) bajo restricciones de temporada. Ambos son problemas
de decenas de variables que se resuelven por enumeración o programación dinámica sin solver. No hace
falta MILP ni siquiera ahí.

## Decisión

Un **único motor** en `web/src/core/routing/` con tres entradas de datos y tres usos:

| Uso | Campo de viento | Salida | Cuándo |
|---|---|---|---|
| **Arreglar tierra** (nivel 1) | ninguno | ruta de Cornell con waypoints insertados que rodean la costa con margen *m* | pipeline Python (`tools/optimize_coast.py` ya existe como base) y en la app para rutas propias |
| **Ruta del mes** (nivel 2) | climatología mensual (E8, viento y corriente medios por celda) | ruta alternativa a la de Cornell para el mes de planificación, con ETA media | E8 cerrada |
| **Ruta con el viento** (nivel 3) | pronóstico Open-Meteo 16 d (0,25°, horario) + climatología más allá del horizonte | ruta óptima en tiempo, isócronas dibujadas, tramos de ceñida con número de bordos, ETA, viento máx. previsto | pronóstico descargado (online) o el último guardado (offline) |

Componentes:

1. **Máscara de tierra** en rejilla de bits de 0,1° (3 600 × 1 800 bits ≈ 0,8 MB, a partir de Natural
   Earth 10m o GSHHG intermedio; generada en `tools/`, precacheada). Consulta O(1); el "margen
   costero" se aplica dilatando la máscara *k* celdas. Sirve a los tres usos y al chequeo de
   cruces de tierra de cualquier ruta (reemplaza `landcheck.py` con la máscara de 110m).
2. **Polar** del barco: formato tabulado estándar (Maxsea/Adrena/qtVlm: filas TWA, columnas TWS),
   importable; polar genérica de crucero de 40 pies incluida por defecto, con "factor de
   realismo" (0,7–1,0) y **velocidad a motor** bajo un umbral de viento. Cono muerto configurable
   (por defecto 42°) y ángulo máximo de empopada (por defecto 165°).
3. **Campo de viento** como interfaz única `wind(lat, lon, t) → {dir, speed}` con tres
   implementaciones: pronóstico (rejilla horaria interpolada), climatología (mensual), y nulo.
   El pronóstico se descarga por **caja de la travesía** (bbox de la ruta + margen) en Open-Meteo
   (CORS, sin clave), se guarda en IndexedDB con fecha de emisión, y se muestra su edad (regla 7 de
   §6 ter). Más allá del horizonte se empalma con la climatología y la ruta lo indica.
4. **Isócronas** con poda por sectores, Δt automático (1 h cerca de costa, 3 h en océano), abanico
   ±110° respecto al rumbo directo (configurable hasta 360°), restricciones: TWS máx, ola máx (del
   Marine API), margen costero, zonas excluidas (ciclones de temporada por cuenca, hielo), coste de
   virada y bordos máximos. Corre en un **Web Worker** con progreso visible y cancelable.
5. **A\*** sobre la rejilla con la máscara como alternativa automática para el nivel 1 y para
   tramos entre islas donde las isócronas se traban.
6. **Salida** = ruta propia (E11): waypoints, ETA por waypoint, viento previsto por tramo, tramos de
   ceñida marcados, y comparación contra la ruta de Cornell ("12 h menos, 310 nm más, viento máx. 28 kn
   vs 34 kn"). Se puede seguir, exportar y recalcular con un toque cuando llega un pronóstico nuevo.

## Datos y licencias

| Dato | Fuente | Licencia | Tamaño |
|---|---|---|---|
| Viento 10 m, ráfagas, 16 días | Open-Meteo Forecast API (GFS/ECMWF/ICON) | CC BY 4.0, no comercial sin clave | ~50–300 KB por travesía |
| Olas y corrientes | Open-Meteo Marine API | idem | idem |
| Climatología mensual | ERA5 medias + OSCAR (E8) | Copernicus / dominio público | ≤ 3 MB |
| Costa | Natural Earth 10m / GSHHG | dominio público / LGPL | 0,8 MB (bits) |
| Polares | genérica propia + importación del usuario | — | KB |

## Consecuencias

- **Positivas:** un solo motor para tres problemas; sin dependencias ni solver; corre offline con el
  último pronóstico; la ceñida y los vientos fuertes se resuelven por construcción; se integra con lo
  ya decidido (mes de planificación, rutas propias, hoja de ruta, presupuestos de recursos).
- **Negativas:** la calidad depende de la polar (una polar mala da rutas malas: hay que decirlo en
  la UI); el pronóstico cubre 16 días y una travesía oceánica dura más (se degrada a climatología con
  aviso); las isócronas son subóptimas en archipiélagos (se cubre con A*).
- **Dependencias:** E8 (climatología), E11 (rutas propias), T2.5 (mes), un repositorio de pronóstico
  (nuevo, `core/forecast.ts`), y la máscara de tierra (nuevo en `tools/`).

## Plan (épica E12, después de E11)

| Tarea | Qué | Aceptación |
|---|---|---|
| T12.1 | `tools/build_landmask.py` → `basemap/land.bits` 0,1°; `core/routing/landmask.ts` | consulta de 1 M puntos < 50 ms; concuerda con `landcheck.py` en ≥ 99 % de los tramos |
| T12.2 | Nivel 1: A* con margen → `tools/optimize_coast.py` v2 sobre las 164 rutas; flag `needsReview` baja a < 20 | ninguna ruta del catálogo cruza tierra con margen 3 nm |
| T12.3 | `core/routing/polar.ts`: parser del formato tabulado, polar genérica, cono muerto, motor | tests con una polar real (ORC de un 40 pies) |
| T12.4 | `core/forecast.ts`: descarga por bbox desde Open-Meteo, IndexedDB, edad, empalme con climatología | sin red usa el último guardado y lo dice |
| T12.5 | `core/routing/isochrones.ts` + Worker + restricciones + coste de virada | travesía Canarias → Barbados con GFS: ruta en < 5 s en móvil medio; prueba contra qtVlm con la misma polar y GRIB: ETA dentro del 5 % |
| T12.6 | UI: en la ficha y en Mis rutas, botón "Optimizar con el viento" / "Ruta del mes"; isócronas en el mapa; comparación; recalcular | reglas §6 ter; cancelable; progreso visible |

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| MILP con solver wasm | No lineal, horizonte dinámico, 1–3 MB de solver, minutos de cómputo; fuera de presupuesto y fuera de la práctica del sector |
| Enrutado en servidor | Contradice ADR-002 (sin backend) y el uso offline |
| Dijkstra puro en rejilla espacio-tiempo | Funciona pero es 10–50× más costoso que isócronas con poda; queda como A* local |
| Solo climatología, sin pronóstico | Pierde el nivel 3, que es el pedido central |
