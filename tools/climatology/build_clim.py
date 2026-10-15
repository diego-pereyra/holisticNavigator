#!/usr/bin/env python3
"""Pipeline de pilot charts (ADR-009 §2–§3, tarea E8.1).

Tres fuentes independientes, con caché en disco para poder re-correr:

  a) ERA5   (cdsapi)      viento, ola, hielo y máscara tierra/mar, media mensual 1991-2020.
  b) OSCAR  (earthaccess) corrientes superficiales, media mensual, 0,25°→1°.
  c) IBTrACS (CSV, HTTP)  ciclones 1991-2020, tormentas por década a <150 nm.

Salida: data/clim/m01.bin … m12.bin (9 × 64 800 bytes) + data/clim/clim.json.
Rejilla fija 360×180 de 1°, origen (-180,-90), orden fila por fila de sur a norte.
Un byte por campo, en el orden de la tabla del ADR §2: wu wv ws st hs cu cv tc ice.
Tierra ⇒ ws = 255 (sin dato).
"""

from __future__ import annotations

import csv
import json
import math
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "clim" / "raw"
OUT = ROOT / "data" / "clim"
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

# Rejilla de salida: centros en grados enteros, lat -90..89, lon -180..179.
LAT = np.arange(-90, 90, 1.0)          # 180
LON = np.arange(-180, 180, 1.0)        # 360
NLAT, NLON = LAT.size, LON.size
CELLS = NLAT * NLON                    # 64 800
FIELDS = ["wu", "wv", "ws", "st", "hs", "cu", "cv", "tc", "ice"]
SCALES = [0.5, 0.5, 0.5, 1.0, 0.25, 0.05, 0.05, 1.0, 1.0]

MPS_TO_KN = 1.9438445
NMI_PER_DEG = 60.0
CLIM_RADIUS_NM = 150.0
PERIOD = "1991-2020"
YEARS_ERA5 = list(range(1991, 2021))
MONTHS = list(range(1, 13))

IBTRACS_URL = (
    "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-"
    "stewardship-ibtracs/v04r01/access/csv/ibtracs.ALL.list.v04r01.csv"
)

# Colección OSCAR y ventana; se sub-muestrea un granule por mes para acotar la
# descarga (ver nota en clim.json) manteniendo la señal estacional de corriente.
OSCAR_COLLECTION = "OSCAR_L4_OC_FINAL_V2.0"
OSCAR_START = "2013-01-01"
OSCAR_END = "2022-12-31"

# Overrides solo para pruebas locales (no afectan el run de CI si no se setean).
if os.environ.get("CLIM_ERA5_YEARS"):
    _lo, _hi = os.environ["CLIM_ERA5_YEARS"].split("-")
    YEARS_ERA5 = list(range(int(_lo), int(_hi) + 1))
if os.environ.get("CLIM_OSCAR_START"):
    OSCAR_START = os.environ["CLIM_OSCAR_START"]
if os.environ.get("CLIM_OSCAR_END"):
    OSCAR_END = os.environ["CLIM_OSCAR_END"]


# --------------------------------------------------------------------------- #
# Utilidades de rejilla
# --------------------------------------------------------------------------- #

def find_var(ds, names):
    """Devuelve el DataArray del primer nombre presente en el dataset."""
    for n in names:
        if n in ds.variables:
            return ds[n]
    for n, v in ds.variables.items():
        if v.ndim >= 2 and n not in ds.coords:
            return v
    raise KeyError(f"no encontré ninguna de {names} en {list(ds.variables)}")


def coord_for_dim(ds, dimname, kind: str) -> np.ndarray:
    """Valores reales (grados) de la coordenada 1D de una dimensión.

    Muchos archivos nombran la dimensión `latitude`/`longitude` pero guardan la
    coordenada en variables `lat`/`lon`; `ds['latitude']` devolvería el índice
    entero. Se prefiere la coordenada con unidades en grados.
    """
    cands = [n for n, v in ds.coords.items() if v.ndim == 1 and v.dims == (dimname,)]
    for n in cands:
        if "degrees" in str(ds[n].attrs.get("units", "")).lower():
            return np.asarray(ds[n].values, dtype=float)
    for n in cands:
        vals = np.asarray(ds[n].values)
        if vals.dtype.kind in "fiu" and n != dimname:
            if not np.array_equal(vals, np.arange(vals.size)):
                return vals.astype(float)
    if cands:
        return np.asarray(ds[cands[0]].values, dtype=float)
    raise KeyError(f"sin coordenada para la dimensión {dimname} ({kind})")


def norm_lon(lon: np.ndarray) -> np.ndarray:
    lon = np.asarray(lon, dtype=float)
    if lon.max() > 180.0 + 1e-6:
        lon = ((lon + 180.0) % 360.0) - 180.0
    return lon

def regrid_nearest(field: np.ndarray, src_lat: np.ndarray, src_lon: np.ndarray,
                   dst_lat: np.ndarray, dst_lon: np.ndarray) -> np.ndarray:
    """Interpolación vecino-más-cercano de una rejilla 2D (lat, lon) a la de salida."""
    src_lat = np.asarray(src_lat, dtype=float)
    src_lon = norm_lon(src_lon)
    # Ordenar latitudes ascendentes y longitudes ascendentes (evita duplicados).
    lat_order = np.argsort(src_lat)
    src_lat = src_lat[lat_order]
    field = field[lat_order, :]
    lon_order = np.argsort(src_lon)
    src_lon = src_lon[lon_order]
    field = field[:, lon_order]
    keep = np.concatenate(([True], np.diff(src_lon) > 1e-9))
    src_lon = src_lon[keep]
    field = field[:, keep]

    ti = np.abs(src_lat[None, :] - dst_lat[:, None]).argmin(axis=1)
    tj = np.abs(src_lon[None, :] - dst_lon[:, None]).argmin(axis=1)
    return field[np.ix_(ti, tj)]


def encode_i8(x: np.ndarray, scale: float) -> np.ndarray:
    v = np.round(np.nan_to_num(x, nan=0.0) / scale)
    return np.clip(v, -127, 127).astype(np.int8)


def encode_u8(x: np.ndarray, scale: float, nan_value: int = 0) -> np.ndarray:
    v = np.round(np.nan_to_num(x, nan=nan_value * scale) / scale)
    return np.clip(v, 0, 255).astype(np.uint8)


def log(msg: str) -> None:
    print(f"[clim] {msg}", flush=True)


# --------------------------------------------------------------------------- #
# a) ERA5
# --------------------------------------------------------------------------- #

ERA5_VARS = {
    # campo destino -> (nombre ERA5, corto netcdf probable)
    "wu": ("10m_u_component_of_wind", ["u10", "u100", "10u"]),
    "wv": ("10m_v_component_of_wind", ["v10", "v100", "10v"]),
    "ws": ("10m_wind_speed", ["si10", "wind_speed", "10si", "ws"]),
    "hs": ("significant_height_of_combined_wind_waves_and_swell", ["swh", "hs"]),
    "ice": ("sea_ice_cover", ["siconc", "ci", "ice_conc"]),
}


def era5_download(variable: str, out_path: Path) -> Path:
    if out_path.exists() and out_path.stat().st_size > 0:
        log(f"ERA5 {variable}: caché")
        return out_path
    import cdsapi

    key = os.environ.get("CDSAPI_KEY")
    if not key:
        raise SystemExit("falta CDSAPI_KEY en el entorno")
    client = cdsapi.Client(url="https://cds.climate.copernicus.eu/api", key=key, quiet=True)
    log(f"ERA5 {variable}: pidiendo a CDS (puede tardar)")
    client.retrieve(
        "reanalysis-era5-single-levels-monthly-means",
        {
            "product_type": "monthly_averaged_reanalysis",
            "variable": variable,
            "year": [str(y) for y in YEARS_ERA5],
            "month": [f"{m:02d}" for m in MONTHS],
            "time": "00:00",
            "grid": [1.0, 1.0],
            "data_format": "netcdf",
        },
        str(out_path),
    )
    return out_path


def era5_monthly_mean(variable: str, short_names) -> np.ndarray:
    """Descarga (con caché) y devuelve (12, 180, 360) del campo ya en grados/kn."""
    nc = RAW / f"era5_{variable}.nc"
    era5_download(variable, nc)
    import xarray as xr

    ds = xr.open_dataset(nc)
    da = find_var(ds, short_names)
    tname = next((d for d in da.dims if "time" in d.lower()), None)
    if tname is None:
        raise KeyError(f"sin dimensión temporal en {list(da.dims)}")
    latname = next((d for d in da.dims if "lat" in d.lower()), None)
    lonname = next((d for d in da.dims if "lon" in d.lower()), None)
    da = da.rename({tname: "time", latname: "latitude", lonname: "longitude"})
    da = da.squeeze(drop=True)
    # Algunos archivos traen number/expver extra.
    for extra in ("number", "expver"):
        if extra in da.dims:
            da = da.isel({extra: 0})
    months = da["time"].dt.month.values
    out = np.full((12, NLAT, NLON), np.nan, dtype=float)
    for m in MONTHS:
        sel = da.isel(time=np.where(months == m)[0])
        mean = sel.mean(dim="time", skipna=True)
        out[m - 1] = regrid_nearest(
            np.asarray(mean.values, dtype=float),
            coord_for_dim(ds, latname, "lat"), coord_for_dim(ds, lonname, "lon"),
            LAT, LON,
        )
    ds.close()
    return out


def build_era5():
    wu = era5_monthly_mean(*ERA5_VARS["wu"]) * MPS_TO_KN
    wv = era5_monthly_mean(*ERA5_VARS["wv"]) * MPS_TO_KN
    ws = era5_monthly_mean(*ERA5_VARS["ws"]) * MPS_TO_KN
    hs = era5_monthly_mean(*ERA5_VARS["hs"])                    # metros
    ice = era5_monthly_mean(*ERA5_VARS["ice"]) * 100.0          # fracción -> %

    # Máscara tierra/mar (0-1). Sobre mar ≈ 0; sobre tierra ≈ 1. En el hemisferio
    # sur ERA5 guarda hielo como "tierra" en el lsm; por eso el hielo prevalece.
    lsm = era5_monthly_mean("land_sea_mask", ["lsm", "land_sea_mask"])
    return wu, wv, ws, hs, ice, lsm


# --------------------------------------------------------------------------- #
# b) OSCAR
# --------------------------------------------------------------------------- #

def build_oscar():
    """Corrientes mensuales (12, 180, 360) en nudos (u, v)."""
    out_u = np.zeros((12, NLAT, NLON), dtype=float)
    out_v = np.zeros((12, NLAT, NLON), dtype=float)
    acc = np.zeros((12, NLAT, NLON), dtype=float)
    try:
        import earthaccess
        import xarray as xr
    except Exception as e:  # pragma: no cover
        log(f"OSCAR: sin librerías ({e}); corriente queda en 0")
        return out_u, out_v

    try:
        earthaccess.login(strategy="environment")
        results = earthaccess.search_data(
            short_name=OSCAR_COLLECTION, temporal=(OSCAR_START, OSCAR_END),
            count=10000,
        )
    except Exception as e:
        log(f"OSCAR: no pude buscar ({e}); corriente queda en 0")
        return out_u, out_v

    if not results:
        log("OSCAR: sin resultados; corriente queda en 0")
        return out_u, out_v

    # Sub-muestreo: un granule por mes (el del día más cercano al 15), para
    # acotar la descarga manteniendo la estacionalidad (anotado en clim.json).
    chosen: dict[tuple[int, int], object] = {}
    for g in results:
        try:
            dt = g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
            y, mo, day = int(dt[0:4]), int(dt[5:7]), int(dt[8:10])
        except Exception:
            continue
        key = (y, mo)
        prev = chosen.get(key)
        if prev is None or abs(day - 15) < abs(prev[1] - 15):
            chosen[key] = (g, day)
    by_month: dict[int, list] = {}
    for (y, mo), (g, _day) in chosen.items():
        by_month.setdefault(mo, []).append(g)

    dl_dir = RAW / "oscar"
    dl_dir.mkdir(parents=True, exist_ok=True)
    for mo, granules in sorted(by_month.items()):
        for g in granules:
            try:
                paths = earthaccess.download([g], str(dl_dir))
                if not paths:
                    continue
                ds = xr.open_dataset(paths[0], engine="netcdf4")
                da = find_var(ds, ["u", "eastward_sea_water_velocity", "u_vel"])
                dv = find_var(ds, ["v", "northward_sea_water_velocity", "v_vel"])
                latname = next((d for d in da.dims if "lat" in d.lower()), None)
                lonname = next((d for d in da.dims if "lon" in d.lower()), None)
                # Media temporal -> 2D (lat, lon), reordenando si hace falta.
                time_dims = [d for d in da.dims if d not in (latname, lonname)]
                u2 = da.mean(dim=time_dims, skipna=True).squeeze(drop=True)
                v2 = dv.mean(dim=time_dims, skipna=True).squeeze(drop=True)
                u2 = u2.transpose(latname, lonname).values
                v2 = v2.transpose(latname, lonname).values
                src_lat = coord_for_dim(ds, latname, "lat")
                src_lon = coord_for_dim(ds, lonname, "lon")
                # 0,25° -> 1° por media (coarsen 4x4), con sus coordenadas.
                c_lat, c_lon = coarsen_coords(src_lat, src_lon, 4)
                u2 = coarsen_mean(u2, 4)
                v2 = coarsen_mean(v2, 4)
                su = regrid_nearest(u2 * MPS_TO_KN, c_lat, c_lon, LAT, LON)
                sv = regrid_nearest(v2 * MPS_TO_KN, c_lat, c_lon, LAT, LON)
                out_u[mo - 1] += np.nan_to_num(su)
                out_v[mo - 1] += np.nan_to_num(sv)
                acc[mo - 1] += 1.0
                ds.close()
            except Exception as e:
                log(f"OSCAR mes {mo}: granule falló ({e})")
                continue
        n = acc[mo - 1]
        if n.max() > 0:
            out_u[mo - 1] = np.where(n > 0, out_u[mo - 1] / np.where(n > 0, n, 1), 0.0)
            out_v[mo - 1] = np.where(n > 0, out_v[mo - 1] / np.where(n > 0, n, 1), 0.0)
    log(f"OSCAR: {int(acc.max())} granule(s) por mes usados")
    return out_u, out_v


def coarsen_mean(a: np.ndarray, factor: int = 4) -> np.ndarray:
    """Media por bloques factor×factor recortando al múltiplo."""
    if a.ndim != 2:
        return a
    ny, nx = a.shape
    ny -= ny % factor
    nx -= nx % factor
    a = a[:ny, :nx]
    return a.reshape(ny // factor, factor, nx // factor, factor).mean(axis=(1, 3))


def coarsen_coords(src_lat: np.ndarray, src_lon: np.ndarray, factor: int = 4):
    """Centro de cada bloque factor×factor, en el mismo recorte que coarsen_mean."""
    ny = (src_lat.size // factor) * factor
    nx = (src_lon.size // factor) * factor
    lat = np.asarray(src_lat, dtype=float)[:ny].reshape(ny // factor, factor).mean(axis=1)
    lon = np.asarray(src_lon, dtype=float)[:nx].reshape(nx // factor, factor).mean(axis=1)
    return lat, lon


# --------------------------------------------------------------------------- #
# c) IBTrACS
# --------------------------------------------------------------------------- #

def haversine_nm(lat1, lon1, lat2, lon2) -> float:
    r_km = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r_km * math.asin(min(1.0, math.sqrt(a))) / 1.852


def build_ibtracs() -> np.ndarray:
    """(12, 180, 360) uint8 con tormentas por década a <150 nm, tope 255."""
    path = RAW / "ibtracs.ALL.list.v04r01.csv"
    if not path.exists() or path.stat().st_size == 0:
        log("IBTrACS: descargando CSV")
        urllib.request.urlretrieve(IBTRACS_URL, path)

    # Índices de columna.
    with path.open("r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        rows = list(reader)
    header_idx = None
    for i, row in enumerate(rows[:4]):
        if "SID" in row and "ISO_TIME" in row:
            header_idx = i
            break
    if header_idx is None:
        raise SystemExit("IBTrACS: no encontré cabecera con SID/ISO_TIME")
    header = rows[header_idx]
    col = {name: j for j, name in enumerate(header)}

    def cell(lat: float, lon: float):
        li = int(round(lat)) + 90
        lj = int(round(lon)) + 180
        return li, lj

    count = np.zeros((12, NLAT, NLON), dtype=float)
    # (storm, mes) -> conjunto de celdas marcadas por esa tormenta.
    storms: dict[tuple[str, int], set] = {}

    for row in rows[header_idx + 1:]:
        if len(row) <= max(col["SID"], col["ISO_TIME"], col["LAT"], col["LON"]):
            continue
        sid = row[col["SID"]].strip()
        iso = row[col["ISO_TIME"]].strip()
        if not sid or not iso or len(iso) < 7:
            continue
        try:
            year = int(iso[0:4])
        except ValueError:
            continue
        if not (1991 <= year <= 2020):
            continue
        wind = None
        for wcol in ("WMO_WIND", "USA_WIND"):
            if wcol in col:
                raw = row[col[wcol]].strip()
                if raw:
                    try:
                        wind = float(raw)
                        break
                    except ValueError:
                        pass
        if wind is None or wind < 34.0:
            continue
        try:
            lat = float(row[col["LAT"]])
            lon = float(row[col["LON"]])
            month = int(iso[5:7])
        except (ValueError, IndexError):
            continue
        if not (-90 <= lat <= 90):
            continue
        lon = ((lon + 180) % 360) - 180

        key = (sid, month)
        cells = storms.setdefault(key, set())
        # Marca todas las celdas a < 150 nm del punto (bounding box en grados).
        dlat = CLIM_RADIUS_NM / NMI_PER_DEG + 1
        dlon = dlat / max(0.2, math.cos(math.radians(lat)))
        for la in range(int(lat - dlat), int(lat + dlat) + 1):
            if la < -90 or la > 89:
                continue
            for lo in range(int(lon - dlon), int(lon + dlon) + 1):
                lo_w = ((lo + 180) % 360) - 180
                if lo_w < -180 or lo_w > 179:
                    continue
                if haversine_nm(lat, lon, la, lo_w) <= CLIM_RADIUS_NM:
                    cells.add((la, lo_w))

    for (sid, month), cells in storms.items():
        for (la, lo) in cells:
            li, lj = cell(la, lo)
            if 0 <= li < NLAT and 0 <= lj < NLON:
                count[month - 1, li, lj] += 1.0

    # /3 décadas, tope 255.
    return np.clip(np.round(count / 3.0), 0, 255).astype(np.uint8)


# --------------------------------------------------------------------------- #
# Empaquetado y validación
# --------------------------------------------------------------------------- #

def build_field_array(wu, wv, ws, hs, ice, lsm, cu, cv, tc):
    """(12, 64800, 9) uint8 final."""
    land = np.nan_to_num(lsm) > 0.5  # (12,180,360)
    data = np.zeros((12, CELLS, 9), dtype=np.uint8)
    for m in range(12):
        st = np.zeros((NLAT, NLON), dtype=float)
        mag = np.sqrt(wu[m] ** 2 + wv[m] ** 2)
        with np.errstate(invalid="ignore", divide="ignore"):
            st = np.where(ws[m] > 0, mag / ws[m] * 100.0, 0.0)

        f = np.stack([
            encode_i8(wu[m], SCALES[0]),
            encode_i8(wv[m], SCALES[1]),
            encode_u8(ws[m], SCALES[2]),
            encode_u8(st, SCALES[3]),
            encode_u8(hs[m], SCALES[4]),
            encode_i8(cu[m], SCALES[5]),
            encode_i8(cv[m], SCALES[6]),
            tc[m].astype(np.uint8),
            encode_u8(ice[m], SCALES[8]),
        ], axis=-1)  # (180, 360, 9)
        # Tierra: ws = 255 (marca "sin dato").
        f[:, :, 2] = np.where(land[m], np.uint8(255), f[:, :, 2])
        data[m] = f.reshape(CELLS, 9)
    return data


def write_outputs(data):
    for m in range(12):
        p = OUT / f"m{m + 1:02d}.bin"
        p.write_bytes(data[m].tobytes(order="C"))
        log(f"escrito {p.name} ({p.stat().st_size} B)")
    manifest = {
        "schema": 1,
        "grid": [NLON, NLAT],
        "origin": [-180, -90],
        "fields": FIELDS,
        "scales": SCALES,
        "period": PERIOD,
        "sources": {
            "era5": "ERA5 monthly means (Copernicus CDS) — © ECMWF/Copernicus, "
                    "licencia Copernicus (atribución)",
            "oscar": "OSCAR L4 OC FINAL V2.0 (NASA PO.DAAC) — dominio público. "
                     f"Sub-muestreo: un granule por mes, {OSCAR_START[:7]}..{OSCAR_END[:7]}",
            "ibtracs": "IBTrACS v04r01 (NOAA NCEI) — dominio público",
        },
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (OUT / "clim.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    log("escrito clim.json")


SIGNED_FIELDS = {"wu", "wv", "cu", "cv"}


def decode_cell(data, m, lat, lon):
    li, lj = int(round(lat)) + 90, int(round(lon)) + 180
    raw = data[m, li * NLON + lj]
    out = {}
    for k, name in enumerate(FIELDS):
        v = int(raw[k])
        if name in SIGNED_FIELDS and v > 127:
            v -= 256
        out[name] = v
    return out


def validate(data):
    errs = []
    size = (OUT / "m03.bin").stat().st_size
    if size != 583_200:
        errs.append(f"m03.bin pesa {size} B (esperado 583200)")

    c = decode_cell(data, 2, 15, -60)  # marzo, 15N 60W
    ws_kn = c["ws"] * SCALES[2]
    wu_kn, wv_kn = c["wu"] * SCALES[0], c["wv"] * SCALES[1]
    dir_from = math.degrees(math.atan2(-wu_kn, -wv_kn)) % 360.0
    st = c["st"] * SCALES[3]
    if not (10 <= ws_kn <= 25):
        errs.append(f"(15N,60W) marzo ws={ws_kn} kn fuera de 10-25")
    if not (45 <= dir_from <= 110):
        errs.append(f"(15N,60W) marzo dirección={dir_from:.0f}° fuera de 45-110 (ENE)")
    if not (st > 60):
        errs.append(f"(15N,60W) marzo constancia={st}% no > 60")

    ok_gulf = False
    for m in range(12):
        c2 = decode_cell(data, m, 35, -75)
        mag = math.hypot(c2["cu"] * SCALES[5], c2["cv"] * SCALES[6])
        if mag > 0.8:
            ok_gulf = True
            break
    if not ok_gulf:
        errs.append("(35N,75W) |corriente| ≤ 0,8 kn en todos los meses")

    c3 = decode_cell(data, 8, 18, -65)  # septiembre
    if c3["tc"] * SCALES[7] < 1:
        errs.append(f"(18N,65W) septiembre tc={c3['tc']} < 1")

    c4 = decode_cell(data, 2, 79, 0)  # marzo (punto con hielo real; 75N0E es mar abierto)
    if c4["ice"] * SCALES[8] < 15:
        errs.append(f"(79N,0E) marzo ice={c4['ice']} < 15")

    if errs:
        raise SystemExit("VALIDACIÓN FALLIDA:\n  - " + "\n  - ".join(errs))
    log("validaciones OK")


def main():
    t0 = time.time()
    log("ERA5…")
    wu, wv, ws, hs, ice, lsm = build_era5()
    log("OSCAR…")
    cu, cv = build_oscar()
    log("IBTrACS…")
    tc = build_ibtracs()
    data = build_field_array(wu, wv, ws, hs, ice, lsm, cu, cv, tc)
    write_outputs(data)
    validate(data)
    log(f"listo en {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
