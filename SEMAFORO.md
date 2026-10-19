ADELANTE

TAREA ÚNICA: UX-N.2 — El pronóstico por caja: punto, vista o ruta, todos de primera clase.
(RETOMADA: el hook la saltó por disparo falso — su texto contenía el marcador; ya corregido.
docs/07-rediseño-usabilidad.md, decisión D2. Hoy la descarga solo existe en "Sin conexión"
y su caja depende de la ruta activa/seleccionada — app.ts:2326-2401.)

Archivos: web/src/core/forecast.ts (+test), web/src/platform/forecast.ts, web/src/ui/app.ts,
web/public/app.css.

0. **Arreglo previo (rojo de UX-N.3):** el test "E12.1 consulta de 1 000 000 de puntos en
   < 50 ms" dio **61,9 ms** — la transformada de distancia (E12.8) encareció
   `isLandWithMargin`. Optimizá la ruta de consulta hasta volver a < 50 ms (el presupuesto es
   de la casa: no se afloja el test).
1. **Tres cajas de primera clase**, con ids propios: `punto-<hash>` (pin + 300 nm de
   margen), `vista` (límites actuales del mapa), `<código de ruta>`. `downloadForecast` ya
   recibe id+caja: solo faltan las superficies que las piden.
2. **"Clima acá" gana descarga:** en la hoja de UX-N.1, botón "Descargar pronóstico acá"
   (caja del punto + 300 nm) con progreso y edad en el panel; con el paquete, muestra los
   datos de la hora del deslizador.
3. **Panel Tiempo:** botón "Descargar pronóstico de la vista" cuando ningún paquete cubra el
   centro del mapa.
4. **"Optimizar desde acá":** si ningún paquete cubre pin→destino, ofrece descargar la caja
   combinada antes de correr el motor.
5. **Sin conexión lista TODOS los paquetes** (nombre, tipo de caja, edad, tamaño) con borrar
   por fila — `removeForecast` por fin se llama; sin acumulación eterna.
6. Tests (node:test): ids punto/vista/ruta; la caja del punto lleva 300 nm de margen; borrar
   saca el paquete del IndexedDB y no reaparece.
7. Aceptación: "Clima acá" descarga SIN ninguna ruta seleccionada (J1 del UAT en ≤ 3 toques);
   Sin conexión muestra las cajas con edad y las borra.
8. npm test (en web/), bash scripts/build-web.sh, commit "UX-N.2: pronóstico por caja",
   push. Al terminar escribí "Status: DONE" como última línea de este archivo.

Status: DONE
