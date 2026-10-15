ADELANTE

TAREA ÚNICA: PN-1 — Puente con Navionics (y cualquier plotter).


Archivos: `web/src/core/gpx.ts` (+test), `web/src/platform/download.ts`, `web/src/ui/app.ts`.
Commit `PN-1: exportar a Navionics y detección de duplicados al importar`.

1. Exportación: el botón "Exportar GPX" pasa a "Enviar a plotter". Genera el GPX de la variante
   elegida (ya existe: `<rte>` con nombres, `<copyright>`) con nombre de archivo
   `AN12A-Falmouth-Newport.gpx` y nombre de ruta dentro del GPX `AN12A Falmouth-Newport`
   (sin caracteres fuera de ASCII en el nombre de archivo). Si `navigator.canShare?.({ files })`
   existe, usa la hoja de compartir del sistema (`navigator.share({ files: [File], title })`):
   en Android/iOS aparece Navionics como destino. Si no, descarga como hoy.
2. Lo mismo para rutas propias/importadas y para la bitácora ("Enviar track").
3. Importación: al importar un GPX con el mismo nombre o con ≥ 90 % de puntos coincidentes
   (± 0,05 nm) con una ruta ya importada, preguntar "Ya tenés esta ruta. ¿Reemplazar?" (banda
   inferior con Reemplazar / Guardar como nueva), sin modal. Test del detector de duplicados.
4. Ayuda: línea "Enviá cualquier ruta a Navionics con el botón Enviar a plotter".
5. Prueba: en Android, Enviar a plotter → hoja de compartir → Navionics abre la ruta con sus
   waypoints nombrados; en escritorio descarga el archivo.
6. npm test, build-web.sh, commit, push, PARÁ.
