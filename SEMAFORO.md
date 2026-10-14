ADELANTE

TAREA ÚNICA: UX-1 — la app abre mostrando qué hacer: Aquí a media altura y ayuda de primer uso.

Archivos: web/src/ui/app.ts, web/public/app.css. Nada más.

1. Al montar: la hoja arranca en "half" con la pestaña Aquí (hoy arranca en peek). Excepciones:
   si hay ruta activa y posición → peek con la tira Navegando (E9.1); si la URL trae ?route= →
   la ficha, como ahora.
2. Aquí, primera tarjeta cuando NO hay posición: título "Tu posición manda" y tres botones
   grandes (44 px, ancho completo): "Usar GPS" (wireGpsStart), "Fijar en el mapa", "Escribir
   coordenadas" (los mismos del menú de posición). Cuando hay posición, esa tarjeta no aparece.
3. Ayuda de primer uso (una sola vez, hn.seenHelp): tarjeta al tope de Aquí, no modal:
   "Tu posición manda · Elegí una ruta · Tocá Seguir" en una línea cada una, con un icono de texto
   (📍 ▸ ⚑), y un botón "Entendido" que la cierra y guarda hn.seenHelp = "1". Máximo 4 líneas de
   alto. Nunca tapa el mapa.
4. En escritorio no cambia nada salvo la tarjeta de ayuda y la de posición, que van en la misma
   pestaña Aquí del panel.
5. Prueba: borrar datos del sitio, abrir → mapa + hoja a media altura con la ayuda y "Tu posición
   manda"; tocar Usar GPS → la tarjeta de posición desaparece y aparecen cuenca y rutas cercanas;
   recargar → la ayuda ya no vuelve.
6. npm test, build-web.sh, commit "UX-1: apertura en Aquí y ayuda de primer uso", push, PARÁ.
