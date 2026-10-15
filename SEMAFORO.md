ADELANTE

TAREA ÚNICA: E8.1 — pilot charts: pipeline de climatología (ERA5 + OSCAR + IBTrACS → 12 .bin).

Especificación completa en docs/adr/009-pilot-charts-y-clima-descargable.md §2 y §3. Los secrets
CDSAPI_KEY y EARTHDATA_TOKEN ya están cargados en el repo.

Archivos: tools/climatology/build_clim.py (nuevo), tools/climatology/requirements.txt (cdsapi,
earthaccess, xarray, netCDF4, numpy), .github/workflows/climatology.yml (nuevo), data/clim/
(salida), scripts/sync-catalog.sh (copia a web/public/clim/). Nada de la app todavía.

1. build_clim.py, tres pasos independientes con caché en disco (data/clim/raw/) para poder
   re-correr sin descargar todo otra vez:
   a) ERA5 (cdsapi; URL https://cds.climate.copernicus.eu/api, clave en env CDSAPI_KEY):
      dataset "reanalysis-era5-single-levels-monthly-means", product_type
      "monthly_averaged_reanalysis", years 1991..2020, months 1..12, time "00:00",
      variables ["10m_u_component_of_wind","10m_v_component_of_wind","10m_wind_speed",
      "significant_height_of_combined_wind_waves_and_swell","sea_ice_cover"], grid [1.0,1.0],
      format netcdf. Una petición por variable (5 archivos). Promediar los 30 años por mes.
   b) OSCAR (earthaccess; token en env EARTHDATA_TOKEN): colección "OSCAR_L4_OC_FINAL_V2.0",
      1993-01-01 a 2022-12-31; abrir con xarray, agrupar por mes, promediar u/v, remuestrear
      0,25° → 1° por media (coarsen 4×4). Si la descarga completa supera 2 h en Actions, usar un
      archivo cada 5 días (sub-muestreo temporal) y anotarlo en clim.json.
   c) IBTrACS: https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.ALL.list.v04r01.csv
      Filtrar 1991–2020 y viento (WMO_WIND o USA_WIND) ≥ 34 kn; por tormenta y mes, marcar celdas
      a < 150 nm de cada punto del track; contar tormentas distintas por celda y mes; /3 (décadas),
      tope 255.
2. Salida: data/clim/m01.bin … m12.bin, 9 campos × 64 800 celdas, orden y escalas de la tabla
   del ADR §2 (wu, wv, ws, st, hs, cu, cv, tc, ice; tierra = ws 255), más data/clim/clim.json con
   schema, grid, origin, fields, scales, period, sources (con licencias), builtAt.
3. climatology.yml: on workflow_dispatch; ubuntu-latest; python 3.12; pip install -r
   requirements.txt; secrets como env; ejecuta build_clim.py; commitea data/clim/*.bin y clim.json
   a main con mensaje "clim: climatología 1991-2020 (YYYY-MM-DD)" (actions/checkout con token
   por defecto y git push). Timeout del job 300 min.
4. Validaciones dentro del script (fallan el job si no se cumplen): m03.bin pesa 583 200 B;
   celda (15 N, 60 W) en marzo: ws entre 10 y 25 kn, dirección del vector entre 45° y 110° (ENE),
   st > 60; celda (35 N, 75 W) cualquier mes: |(cu,cv)| > 0,8 kn (Corriente del Golfo);
   celda (18 N, 65 W) septiembre: tc ≥ 1; celda (75 N, 0 E) marzo: ice ≥ 15.
5. Lanzar el workflow: agregá tools/climatology/VERSION con "1" y commit "clim: pipeline" — el
   workflow además escucha push en tools/climatology/**. Esperá el resultado del run.
6. Al terminar: commit del código (el job commitea los datos), push, PARÁ. Si el job falla,
   BLOCKERS.md con el log resumido y PARÁ.
