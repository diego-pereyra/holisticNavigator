# Target — Holistic Navigator

## Personas

### 1. Crucero de larga distancia — *primario*

Vela en travesías de semanas o meses. Cruza océanos, planifica con meses de antelación.

| | |
|---|---|
| **Contexto** | A bordo, conexión intermitente o nula, datos caros |
| **Dolor** | Cruzar el libro, los pilot charts y los avisos a mano; nada offline |
| **Job** | *"Dime si es buen momento para salir de X hacia Y, y qué peligros hay en el camino"* |
| **Criterio** | Confiabilidad offline y claridad de la ventana de temporada |

### 2. Navegante costero y de islas — *secundario*

Circula una región (Caribe, Mediterráneo, Pacífico Este). Salidas de días.

| | |
|---|---|
| **Contexto** | Siempre conectado, pero dependiente de avisos locales |
| **Dolor** | Seguir a mano los avisos de tormenta y el estado del mar por zona |
| **Job** | *"¿Qué me toca hoy, aquí, y hay algo activo cerca?"* |
| **Criterio** | Rapidez: posición → contexto en menos de 3 segundos |

*Origen de la idea: Panamarina Watch (Portobelo, Panamá) — una estación local, ahora genérica.*

### 3. Planificador y estudiante — *terciario*

Aún no zarpa. Explora rutas, épocas y distancias.

| | |
|---|---|
| **Contexto** | Escritorio, online, exploración libre |
| **Dolor** | El libro no es navegable ni está cruzado con un mapa |
| **Job** | *"Enséñame las rutas del Pacífico Sur y en qué meses se hacen"* |
| **Criterio** | Calidad de búsqueda y de la exploración en el mapa |

## Jobs to be done

1. **Orientarme** — con mi GPS, ver en qué esquema de Cornell caigo y qué rutas me competen.
2. **Elegir cuándo** — ventana de temporada y temporada de ciclones para una ruta concreta.
3. **Entender el medio** — vientos y corrientes medios del mes en mi zona (pilot chart) + estado real.
4. **Recibir avisos** — tormentas y avisos tropicales relevantes para mi cuenca, no para todas.
5. **Trazar mi plan** — importar rutas de otras apps, guardarlas, anotarlas, exportarlas.
6. **Funcionar sin red** — todo lo anterior a bordo, sin conexión.
7. **Registrar mi travesía** — posición, track y notas guardadas en el dispositivo.

## Segmentos por plataforma

| Orden | Target | Motivo |
|---|---|---|
| 1 | **Web** | Canal del **prototipo**: iteración ligera, prueba en el celular por URL, exploración |
| 2 | **Android** | Diferido: primero WebView/Capacitor sobre el bundle Web, nativo cuando haya SDK y aplique NMEA |
| 3 | **iOS** | Postergado: requiere Mac para compilar y publicar |

El prototipo usa `navigator.geolocation`; el GPS externo NMEA (TCP/UDP) queda para el target
nativo — ver [`docs/adr/004-web-first-prototype.md`](adr/004-web-first-prototype.md).

## Non-goals explícitos

Plotter / navegación en tiempo real · cartas náuticas completas · AIS · cuentas en la nube ·
backend propio · social/feed · suscripciones de por medio (por ahora).

## Cómo se mide

- **Utilidad offline:** todas las funciones esenciales disponibles en modo avión.
- **Contexto correcto:** la región/cuenca resuelta desde GPS coincide con la realidad en >99% de los fixes.
- **Velocidad:** posición → contexto en <3 s en dispositivo de gama media.
- **Cobertura del catálogo:** nº de rutas y waypoints extraídos ≈ nº del índice impreso del libro.
