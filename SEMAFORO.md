ADELANTE

TAREA ÚNICA: E13.5 — El clima elegante: viento y corrientes como ríos, el mapa manda.
(Diego: "la representación quedó muy invasiva y no se ve el fondo; las corrientes son un
caos… me gusta el viento también 'como ríos' y después vemos que ambas capas no coincidan".
Decisiones de diseño cerradas con el arquitecto.)

Diagnóstico: las capas nacieron para la rejilla de 1° de la pilot chart; el pronóstico trae
0,5° y todo se pintó el doble de denso. El fondo de cuadrados (0,35) es una alfombra y las
corrientes una-flecha-por-celda son confeti.

Archivos: web/src/core/streamlines.ts (nuevo, +test — matemática pura),
web/src/ui/weather.ts, web/src/ui/app.ts (solo el default del interruptor),
web/public/app.css (solo leyenda).

1. **Líneas de flujo para viento Y corriente.** Función pura
   `streamlines(sample, viewportDeg, spacingPx, opts) → polilíneas`: siembra en rejilla con
   jitter cada `spacingPx` de PANTALLA (no celdas), integra el campo con pasos ~medio
   celda, corta al salir de la caja o tras ~24 pasos. Los ids de capas NO cambian
   (wx-arrows, wx-current, sus puntas): las fuentes pasan a llevar polilíneas.
2. **Dos idiomas visuales, cero colisión:**
   - **Viento:** líneas FINAS (1,25 px), COLOR por la rampa de velocidad (la de hoy:
     0–5–10–15–20–30–40+), punta de flecha chica en el extremo, opacidad ∝ constancia
     en pilot chart (0,15→0,95), fija 0,9 en pronóstico. Espaciado ~80 px.
   - **Corriente:** líneas GRUESAS (2–3 px, ancho ∝ velocidad), UN solo azul (#2e9bff),
     punta chica, espaciado mayor (~120 px) y capa POR DEBAJO del viento (el orden de
     hoy ya lo tiene). Corrientes < 0,5 kn no se dibujan; viento < 2 kn tampoco (las
     calmas no son ríos).
3. **El fondo de viento deja de ser alfombra:** el interruptor "Fondo de viento" (el de
   UX-N.4) pasa a DEFAULT APAGADO; encendido, la opacidad baja de 0,35 a 0,15 — un
   susurro para leer el patrón sin tapar costa ni rutas.
4. **Olas e isobaras:** olas siguen como flechas pequeñas pero con el mismo espaciado
   por píxeles (~100 px); isobaras sin cambios (líneas continuas con su hPa).
5. **Rendimiento:** el cálculo corre en el moveend (debounce de 300 ms que ya existe) y
   el repintado se mantiene < 50 ms; si las polilíneas de un viewport entero pesan, sembrar
   solo dentro de la vista + margen (así ya se hace).
6. Tests (node:test, en core/streamlines.ts): campo uniforme → líneas rectas paralelas;
   campo con cizalla → curvas; calma bajo umbral → cero líneas; espaciado por píxeles
   (a z3/z5/z8 la cantidad de líneas cae en el rango esperado); integración se corta al
   salir de la caja.
7. Prueba de Diego: el Golfo a z5 se lee como un río azul grueso CON el viento fino
   multicolor por encima — dos capas, dos idiomas, cero confusión; los alisios de octubre
   → pocas líneas finas largas y el fondo del mapa visible; cambiar mes u hora repinta al
   toque; el interruptor de fondo apagado por defecto.
8. npm test (en web/), bash scripts/build-web.sh, commit "E13.5: clima elegante (viento y
   corrientes como ríos)", push. Al terminar escribí "Status: DONE" como última línea.

Status: DONE
