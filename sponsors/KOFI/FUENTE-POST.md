# FUENTE — Post de introducción del feed de Ko-fi

**Estado:** PUBLICADO 2026-10-30 (Diego, desde ko-fi.com/holisticnavigator)
**Imagen destacada:** `sponsors/KOFI/post-introduccion-1200x600.png` (1200×600, 2:1, beat de demo-07)
**Uso de este archivo:** es la fuente única del post. La próxima edición del feed es **copiar de acá y editar la sección "Novedad"**, no escribir de cero.

---

## Título

```
holisticNavigator — planificar la travesía entera, gratis y sin cuenta
```

## Cuerpo (Markdown listo para re-pegar en Ko-fi)

```
☕ Hola, soy Diego. Hice esta app para planificar mis propias travesías y la dejo abierta para quien navegue el Río de la Plata y la costa uruguaya.

**holisticNavigator** es una app de navegación que corre en el navegador (y se instala en el celular), gratis y sin cuenta. La idea es simple: planificar la travesía entera en un solo lugar, antes de salir.

**Qué podés hacer hoy con la app:**

- **Waypoints en la carta.** Marcá los puntos de tu ruta sobre la carta náutica y ordenalos como los vas a navegar.
- **Rutas propias + GPX.** Armá tu ruta a mano y traé o llevá los waypoints en GPX (importar y exportar).
- **Pronóstico sobre la ruta, con deslizador.** Mirá el viento a lo largo de toda la travesía y movete en el tiempo con el deslizador para elegir la ventana.
- **Optimizar con el viento.** Con isócronas y la polar del barco, la app ajusta los tramos para aprovechar mejor las condiciones y compara tiempo y millas contra el trazado original.
- **Sin conexión.** Dejá guardada la carta y el pronóstico y planificá a bordo, sin señal.

**Tu data queda en tu dispositivo.** Rutas, waypoints y ajustes se guardan en tu propio celular o compu. Sin cuenta, sin nube obligatoria.

**Novedad de esta semana: polares del barco editables.** Elegís la plantilla más cercana a la eslora de tu barco (de 27 a 45 pies) y ajustás la tabla de velocidad según ángulo y fuerza del viento. Esos valores son los que usan la duración estimada y el optimizador: si tenés la polar real de tu barco, mejor todavía.

La app es gratis, sin publicidad y sin telemetría. No hay muro ni versión "premium": si te sirve y querés que siga creciendo, podés invitarme un café acá mismo, en Ko-fi.

Probar la app: https://diego-pereyra.github.io/holisticNavigator/
Apoyar el proyecto: https://ko-fi.com/holisticnavigator

Buen viento. ⛵
```

---

## Protocolo de actualización del feed (buzón "next")

**Regla:** cada versión que entra a producción con feature visible → **1 post en el feed**, con la **sección "Novedad" cambiada** y el resto igual. No se reescribe el post entero.

Pasos para Diego (≈2 min):
1. Abrir este archivo y copiar el bloque de cuerpo.
2. Reemplazar el párrafo de **"Novedad de esta semana"** por la novedad nueva (texto de la tabla de abajo).
3. Actualizar la imagen si hay beat nuevo: `sponsors/KOFI/post-<version>-1200x600.png` (2:1).
4. Pegar en Ko-fi → **Nuevo post** → título = el de arriba (o variante con la versión) → publicar.
5. Anotar en la tabla de abajo: fecha, versión, novedad, imagen.

**Nota 2026-10-30:** no existe en el repo una SPEC de automatización `kofi-feed` (buscada; no está). Ko-fi **no tiene API pública documentada para publicar en el feed**, así que la automatización no es viable por ahora: el protocolo es copiar-editar, y así queda registrado. Si en el futuro se quiere automatizar algo, va como spec aparte y con aprobación del arquitecto.

### Historial de novedades del feed

| Fecha | Versión | Novedad (texto publicado) | Imagen | Estado |
|---|---|---|---|---|
| 2026-10-30 | intro | Polares del barco editables, plantillas de 27 a 45 pies (TWA × TWS) | `post-introduccion-1200x600.png` | PUBLICADO ✅ |
| ____ | ____ | ____ | ____ | ____ |

### Texto de "Novedad" — plantilla para la próxima

```
**Novedad de esta semana: <título corto de la feature>.**
<2–3 líneas en rioplatense: qué hace, dónde está en la app (Ajustes / barra / ficha) y para qué te sirve al planificar.>
```

**Criterios de redacción (mantener):** términos náuticos correctos (waypoint, carta, travesía, eslora, polar, ceñida), nada de siglas internas, sin promesas de fecha, sin "revolucionario". Cerrar siempre con los dos enlaces (app + Ko-fi).
