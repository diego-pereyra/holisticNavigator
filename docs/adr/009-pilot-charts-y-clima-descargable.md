# ADR-009: Pilot charts (climatología) y clima en vivo, descargables sin conexión

**Estado:** Aceptado para ejecución (especificación cerrada; Diego decide cuándo entra al semáforo)
**Fecha:** 2026-10-13 · **Épica:** E8 (climatología) + E13 (paquetes de pronóstico) · **Depende de:** T2.5 (mes de planificación), W5.1 (service worker con precache)

## 1. Qué se entrega

Dos capas de datos de viento y mar sobre el mismo mapa, con la misma UI, distinta fuente:

| | **Pilot chart** (climatología) | **Pronóstico** (clima en vivo) |
|---|---|---|
| Responde | "¿Qué viento y corriente hay *normalmente* en esta zona en marzo?" | "¿Qué viento habrá *esta semana* en mi travesía?" |
| Control | mes de planificación (barra superior) | deslizador de hora (0–7 días, paso 3 h) |
| Fuente | ERA5 (viento, olas, hielo), OSCAR (corrientes), IBTrACS (ciclones) | Open-Meteo Forecast + Marine API |
| Cobertura | mundo entero, 12 meses, rejilla 1° | caja de la travesía, rejilla 1° (0,5° si la caja < 20°), 3 h |
| Tamaño | ≈ 150 KB gzip por mes · ≈ 1,8 MB los 12 | 0,3–1 MB por paquete |
| Se descarga | con el sitio, mes a mes bajo demanda; "Guardar los 12" en un toque | por travesía: botón "Descargar pronóstico" |
| Sin red | sí, lo guardado | sí, el último paquete, con su edad visible |
| Licencia | Copernicus (atribución) · NASA y NOAA (dominio público) | CC BY 4.0, uso no comercial |

## 2. Pilot chart: datos por celda y mes

Rejilla fija: 360 × 180 celdas de 1°, origen en (−180, −90), orden fila por fila de sur a norte.
Por celda y mes, estos campos, en este orden, un byte cada uno:

| # | Campo | Tipo | Escala | Fuente | Qué muestra |
|---|---|---|---|---|---|
| 0 | `wu` | int8 | 0,5 kn | ERA5 `10m_u_component_of_wind`, media mensual 1991–2020 | componente E del viento medio |
| 1 | `wv` | int8 | 0,5 kn | ERA5 `10m_v_component_of_wind` | componente N del viento medio |
| 2 | `ws` | uint8 | 0,5 kn | ERA5 `10m_wind_speed` (escalar), media mensual | velocidad media real (no la del vector) |
| 3 | `st` | uint8 | % | `|(wu,wv)| / ws × 100` | **constancia** del viento: 80 % = alisio fiable; 30 % = variable |
| 4 | `hs` | uint8 | 0,25 m | ERA5 `significant_height_of_combined_wind_waves_and_swell` | ola media |
| 5 | `cu` | int8 | 0,05 kn | OSCAR v2 1993–2022, media mensual | corriente E |
| 6 | `cv` | int8 | 0,05 kn | OSCAR v2 | corriente N |
| 7 | `tc` | uint8 | tormentas por década que pasaron a < 150 nm | IBTrACS 1991–2020, vientos ≥ 34 kn | **riesgo ciclónico** del mes |
| 8 | `ice` | uint8 | % | ERA5 `sea_ice_cover`, media mensual | hielo (≥ 15 % = límite) |

Archivo: `clim/m01.bin` … `clim/m12.bin`, 9 × 64 800 = 583 200 bytes cada uno, sin cabecera.
Manifiesto `clim/clim.json`: `{ "schema": 1, "grid": [360,180], "origin": [-180,-90], "fields": [...], "scales": [...], "period": "1991-2020", "sources": {...}, "builtAt": "..." }`.
Tierra: celda con `ws = 255` = sin dato (se pinta nada). GitHub Pages comprime `.bin` con gzip.

Por qué estos campos y no "rosas de los vientos" completas: las rosas exigen datos horarios de 30
años (terabytes). Media vectorial + velocidad escalar + constancia es lo que un navegante lee en una
pilot chart (dirección dominante, fuerza, fiabilidad), cabe en 150 KB por mes y se calcula desde
medias mensuales ya publicadas.

## 3. Pipeline (una vez al año, en GitHub Actions por `workflow_dispatch`)

`tools/climatology/build_clim.py` + `.github/workflows/climatology.yml`:

1. **ERA5**: `cdsapi` → dataset `reanalysis-era5-single-levels-monthly-means`, producto
   `monthly_averaged_reanalysis`, años 1991–2020, 12 meses, variables de la tabla, rejilla 1°
   (`grid: [1.0, 1.0]`), área global. Promediar los 30 años por mes.
2. **OSCAR**: `earthaccess` → colección `OSCAR_L4_OC_FINAL_V2.0`, 1993–2022; promediar por mes;
   remuestrear 0,25° → 1° por media.
3. **IBTrACS**: CSV `ibtracs.ALL.list.v04r01.csv` (sin credenciales). Para cada tormenta con
   `WMO_WIND ≥ 34` o `USA_WIND ≥ 34`, marcar las celdas a < 150 nm de cada punto de su track en su
   mes; contar tormentas distintas por celda y mes; dividir por 3 (décadas).
4. Escribir los 12 `.bin` + `clim.json` a `data/clim/`, copiar a `web/public/clim/` en
   `scripts/sync-catalog.sh`. Commit automático del job: `clim: climatología 1991-2020 (YYYY-MM-DD)`.

**Lo único que hace Diego:** crear dos cuentas gratuitas y guardar sus claves como *secrets* del
repo: `CDSAPI_KEY` (Copernicus CDS, https://cds.climate.copernicus.eu, aceptar la licencia de
ERA5 una vez) y `EARTHDATA_TOKEN` (NASA Earthdata, https://urs.earthdata.nasa.gov). IBTrACS no
necesita nada. Sin estas claves el job falla en el primer paso y lo dice.

## 4. Pronóstico en vivo: paquete por travesía

`web/src/core/forecast.ts` + `web/src/platform/forecast.ts`:

- **Caja**: bbox de la ruta activa (o seleccionada) + 300 nm de margen; sin ruta, la vista actual
  del mapa. Rejilla 1°; 0,5° si la caja mide < 20° en ambos ejes. Tope: 1 500 puntos (si se
  supera, se sube a 2°).
- **Variables**: `wind_speed_10m`, `wind_direction_10m`, `wind_gusts_10m`, `pressure_msl`
  (Forecast API) y `wave_height`, `wave_direction`, `wave_period`, `ocean_current_velocity`,
  `ocean_current_direction` (Marine API). Horizonte 7 días a paso 3 h (56 pasos); opción 16 días.
- **Descarga**: llamadas de hasta 200 coordenadas por petición (`latitude=a,b,c&longitude=...`),
  `timeformat=unixtime`, `windspeed_unit=kn`; 8 peticiones para 1 500 puntos; barra de progreso.
- **Almacenamiento**: IndexedDB clave `hn.forecast.<id>`: `{ issuedAt, fetchedAt, bbox, step,
  cols, rows, times[], vars: { wind_speed: Int16Array, ... } }` (Int16 con escala 0,1). Un paquete
  "actual" por travesía; "Actualizar" reemplaza. Edad visible siempre (regla 7 de §6 ter).
- **Empalme**: más allá del horizonte del paquete, las capas y el enrutado usan la climatología del
  mes y lo dicen ("clima medio").

## 5. Dibujo (capas `wx-*` de ADR-008, mismas para las dos fuentes)

| Capa | Pilot chart (mes) | Pronóstico (hora) |
|---|---|---|
| `wx-field` | color por `ws` (rampa de 6 escalones: 0–5–10–15–20–30–40+ kn) | color por `wind_speed` |
| `wx-arrows` | flecha por celda: dirección de `(wu,wv)`, largo ∝ `ws`, **opacidad ∝ `st`** (constancia): un alisio se ve firme, un viento variable se ve tenue | flecha por celda, largo ∝ velocidad |
| `wx-current` | flechas finas azules por `(cu,cv)` desde zoom 3 | corrientes del Marine API |
| `wx-cyclone` | rayado rojo donde `tc ≥ 1` (≥ 1 tormenta por década), más denso si `tc ≥ 3` | — |
| `wx-ice` | relleno blanco-azul donde `ice ≥ 15` | — |
| `wx-waves` | contornos de `hs` cada 1 m | altura y dirección de ola |
| `wx-isobars` | — | isobaras cada 4 hPa |

Densidad de flechas por zoom: z ≤ 2 cada 4°, z 3 cada 2°, z ≥ 4 cada 1°. Todo se repinta con
`setData` / canvas en < 50 ms al cambiar mes u hora. Ninguna capa `wx-*` tapa rutas, posición ni
avisos (orden de apilado en "Nombres fijos").

## 6. UI

- **Interruptor "Tiempo"** en la barra de contexto (icono de viento): apagado · Pilot chart ·
  Pronóstico. Pilot chart está disponible siempre (con el mes de la barra); Pronóstico solo si hay
  paquete descargado o red.
- **Deslizador de hora** bajo la barra cuando está en Pronóstico: `mié 14 · 15:00 UTC`, paso 3 h,
  botón "ahora". En Pilot chart no hay deslizador: el mes de planificación manda.
- **Leyenda** compacta abajo a la izquierda: rampa de nudos + "flechas tenues = viento variable" +
  "rayado = ciclones" + fuente y período.
- **Panel "Sin conexión"** (en Aquí → Ajustes, y es el mismo panel de E10): filas con nombre,
  tamaño, estado y fecha, un botón cada una:
  `Carta base · 0,2 MB · siempre` · `Pilot charts (12 meses) · 1,8 MB · [Guardar]` ·
  `Pronóstico de la travesía · 0,6 MB · hace 4 h · [Actualizar]` · `Carta detallada por zona ·
  [Descargar …]` (E10). "Guardar" los pilot charts = `cache.addAll` de los 12 `.bin` por el SW.
- En la **ficha de ruta**, bajo "Cuándo": `Viento medio en ruta (marzo): 14 kn del ENE, constancia
  72 % · corriente a favor 0,6 kn · riesgo ciclónico: bajo` calculado muestreando la climatología a
  lo largo del trazado. Es el dato de pilot chart que el libro no puede dar.

## 7. Presupuesto y rendimiento

Primera carga no cambia (la climatología se pide al activar "Tiempo"). Un mes = 150 KB gzip; los 12
guardados = 1,8 MB en Cache Storage. Paquete de pronóstico ≤ 1 MB. Repintado < 50 ms. Cálculo de
"viento medio en ruta" < 5 ms (muestreo cada 60 nm).

## 8. Tareas (épica E8 + E13, en este orden; una por línea del semáforo cuando Diego lo decida)

| Tarea | Qué | Aceptación |
|---|---|---|
| E8.1 | `tools/climatology/build_clim.py` (ERA5 + OSCAR + IBTrACS → 12 `.bin` + `clim.json`) + workflow | el job corre con las dos claves y commitea `data/clim/`; `m03.bin` pesa 583 200 B; en (15 N, 60 W) marzo: viento del ENE 15–20 kn, constancia > 70 % |
| E8.2 | `core/clim.ts`: carga de un mes, acceso por lat/lon, interpolación bilineal, muestreo a lo largo de una ruta | tests: alisio en Cabo Verde en enero; corriente del Golfo > 1 kn en (35 N, 75 W); `tc` > 0 en Caribe en septiembre |
| E8.3 | Capas `wx-field`, `wx-arrows`, `wx-current`, `wx-cyclone`, `wx-ice`, interruptor "Tiempo", leyenda | cambiar de mes repinta < 50 ms; en febrero el Atlántico N muestra alisios firmes y westerlies tenues |
| E8.4 | "Viento medio en ruta" en la ficha + "Guardar los 12" en el panel Sin conexión | AN12 en junio muestra viento, corriente y riesgo; sin red, los 12 meses funcionan |
| E13.1 | `core/forecast.ts` + `platform/forecast.ts`: paquete por caja, Open-Meteo, IndexedDB, edad | descarga de Canarias–Caribe a 1°/3 h/7 d en < 60 s con progreso; recarga sin red lo muestra con edad |
| E13.2 | Deslizador de hora, `wx-isobars`, `wx-waves` en modo Pronóstico, empalme con climatología | mover la hora repinta < 50 ms; pasado el horizonte dice "clima medio" |

## 9. Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Rosas de los vientos reales (frecuencia por dirección) | exige datos horarios de 30 años; media + constancia da la misma lectura en 1 byte |
| Escanear las pilot charts de la NGA (PDF) | imágenes, no datos; no se pueden muestrear ni mezclar con rutas |
| GRIB directo de NOAA en el browser | sin CORS; decodificar GRIB2 (JPEG2000) pesa más que todo el app |
| Servidor propio de clima | ADR-002 |
