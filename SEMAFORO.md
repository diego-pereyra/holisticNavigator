ADELANTE

TAREA ÚNICA: W4.7 — la hoja no se reconstruye con cada fix de GPS.


Causa (verificada en `web/src/ui/app.ts`): `renderSheet` corre dentro de un `effect` que borra y
reconstruye todo el cuerpo de la hoja. Dentro, `renderRutas` / `renderAqui` leen señales como
`ui.position`, `ui.month`, `ui.imported`, `ui.query`: el efecto se suscribe a todas. Cada fix del
GPS (cada pocos segundos) reconstruye la hoja entera → el scroll vuelve arriba ("salta / se
refresca"). El mismo mecanismo destruye el campo de búsqueda en cada tecla (pierde el foco).

Archivos: `web/src/core/store.ts`, `web/src/ui/app.ts`. Un commit `W4.7: la hoja no se reconstruye con cada fix`.

1. `store.ts`: agregar `export function untracked<T>(fn: () => T): T` que ejecuta `fn` sin
   registrar dependencias (guardar y restaurar el "efecto actual" alrededor de la llamada). Test.
2. `renderSheet`: el `effect` exterior lee **solo** `ui.sheet()`, `ui.tab()` y `ui.selected()`.
   Todo lo demás (`renderAqui`, `renderRutas`, `renderTravesia`, `renderFicha`) se llama dentro de
   `untracked(() => …)`.
3. Dentro de cada pestaña, lo que depende de otras señales se actualiza con **efectos locales que
   reemplazan solo su nodo**:
   - `renderAqui`: la tarjeta "Ruta en curso" (rumbo, distancia, ETA) y la frase "Estás en…" se
     redibujan en un `effect` propio que hace `replaceChildren` de esa tarjeta, no del cuerpo.
   - `renderRutas`: la lista se redibuja solo al cambiar `query`, `region` o `nearMe` (ya pasa por
     `refresh()`); `position` se lee con `untracked` salvo cuando `nearMe` está activo, y en ese
     caso el efecto local guarda `body.scrollTop` antes y lo restaura después.
   - `renderTravesia`: los contadores (puntos, millas) en un efecto local sobre su tarjeta.
4. El campo de búsqueda no se destruye nunca: se crea una vez por montaje de la pestaña; `ui.query`
   se actualiza con `input` sin disparar reconstrucción (ya no la dispara tras el paso 2).
5. Prueba manual: pestaña Rutas, scrollear hasta la mitad, esperar 30 s con el GPS activo → el
   scroll no se mueve; escribir en la búsqueda → el teclado no se cierra, el foco se mantiene.

6. npm test (web/), bash scripts/build-web.sh. Commit "W4.7: la hoja no se reconstruye con cada fix". git push origin main.

Cuando termines: PARÁ. Claude escribe la siguiente tarea acá.
