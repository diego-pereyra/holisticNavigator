ADELANTE

TAREA ÚNICA: E10.0 — batimetría en el piso (corregida: con simplificación geométrica).

El bloqueo era correcto: redondear decimales no reduce puntos. Se simplifica la geometría con
Douglas-Peucker (sin dependencias), que sí los reduce ~100×. Todo lo demás de la tarea anterior
sigue igual (fuentes, capa bathy-fill, colores, precache).

1. En tools/build_basemap.py agregá esta función tal cual:

def simplify(ring, tol):
    """Douglas-Peucker sobre una lista de (lon, lat). tol en grados."""
    if len(ring) < 5:
        return ring
    def dist(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
        t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        px, py = x1 + t * dx, y1 + t * dy
        return ((x - px) ** 2 + (y - py) ** 2) ** 0.5
    stack = [(0, len(ring) - 1)]
    keep = [False] * len(ring)
    keep[0] = keep[-1] = True
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        k, dmax = i, 0.0
        for m in range(i + 1, j):
            d = dist(ring[m], ring[i], ring[j])
            if d > dmax:
                k, dmax = m, d
        if dmax > tol:
            keep[k] = True
            stack.append((i, k))
            stack.append((k, j))
    out = [p for p, k in zip(ring, keep) if k]
    return out if len(out) >= 4 else ring[:1] + [ring[len(ring) // 3], ring[2 * len(ring) // 3]] + ring[-1:]

2. Para cada polígono de batimetría: aplicar simplify a cada anillo con tol = 0.15 (≈ 9 nm);
   descartar anillos cuya caja mida menos de 0.5° en ambos ejes; redondear a 2 decimales;
   quitar puntos consecutivos iguales. Si bathy.geojson sigue > 2 MB, repetir con tol 0.25 y
   después 0.4 hasta cumplir. Anotar en el commit el tol final, los puntos antes/después y el
   tamaño bruto y gzip.
3. Capa "bathy-fill" en main.ts entre "background" y "country-fill", colores:
   200 → #13223a, 1000 → #0f1d33, 2000 → #0c182b, 3000 → #0a1425, 4000 → #081120, 5000 → #060d1a;
   "background" pasa a #15263f.
4. bathy.geojson al precache (manifiesto de build-web.sh).
5. Prueba: sin red, a zoom 2 se distinguen plataformas y fosas; a zoom 6 los bordes no son
   groseros (tol 0.15 ≈ 9 nm, aceptable para un piso oceánico).
6. npm test, build-web.sh, commit "E10.0: batimetría en el piso del mapa", push, PARÁ.
   Marcá el bloqueo como resuelto en BLOCKERS.md (una línea).
