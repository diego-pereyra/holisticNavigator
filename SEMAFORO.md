ADELANTE

TAREA ÚNICA: E13.6 — De vuelta a las flechitas, pero discretas: viento y corrientes como
antes, sin invadir. (Veredicto de Diego sobre E13.5: "el resultado visual espantoso —
prefiero volver a las flechitas pero MÁS DISCRETAS que antes, tanto en viento como en
corrientes". Los ríos se retiran; se queda lo que sí arregló la invasión.)

SE QUEDA DE E13.5 (lo que funcionó):
- Espaciado por píxeles de pantalla (~80 px viento, ~120 px corriente): a cualquier zoom,
  clim o pronóstico, la misma cantidad de flechas.
- Umbrales de calma: corriente < 0,5 kn y viento < 2 kn no se dibujan.
- Fondo de viento: default apagado; encendido a 0,15.

SE RETIRA: las líneas de flujo (streamlines) de viento y corriente — el "río" no cerró
visualmente. El archivo core/streamlines.ts se elimina con sus tests.

VUELVEN LAS FLECHAS — discretas:

1. **Viento (wx-arrows + su cabeza):** segmento corto (largo fijo ~0,4° escalado por
   zoom, NO proporcional a la velocidad — el color ya dice la intensidad), línea FINA
   (1,25 px fija; se acaba el ancho que crecía con el viento de 0,6 a 5,5 px: esa era la
   invasión), cabeza chica (~15 % del largo), color por la rampa de velocidad, opacidad ∝
   constancia en pilot chart / 0,85 en pronóstico.
2. **Corriente (wx-current + su cabeza):** segmento corto (~0,35°), línea fina de 1,25 px
   SOLIDA (el dash a tamaño chico era ruido), un solo azul #2e9bff, cabeza chica, opacidad
   0,8, cada ~120 px, por debajo del viento como hoy.
3. **Olas (wx-waves + cabeza):** mismo tratamiento: finas, cortas, color por altura.
4. Isobaras (wx-isobars) e hielo (wx-ice) sin cambios.
5. Tests: los de espaciado por píxeles y umbrales de E13.5 se MANTIENEN (core, sin
   streamlines); nuevos del tamaño (width fija 1,25 px, largo corto por zoom); los tests de
   streamlines se retiran con el archivo.
6. Prueba de Diego: el Golfo a z5 → pocas flechas azules finas y legibles; los alisios de
   octubre → flechitas cortas de colores espaciadas con el fondo del mapa VISIBLE; el
   fondo de viento apagado por defecto; cambiar mes u hora repinta al toque.
7. npm test (en web/), bash scripts/build-web.sh, commit "E13.6: flechitas discretas
   (adiós ríos)", push. Al terminar escribí "Status: DONE" como última línea.

Status: DONE
