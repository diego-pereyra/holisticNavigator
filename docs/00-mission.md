# Misión — Holistic Navigator

> App multiplataforma (Web → Android → iOS) para **planificar travesías oceánicas**, donde una sola
> coordenada GPS define el contexto: las rutas de Cornell, los vientos y corrientes estacionales
> (pilot charts) y el tiempo y avisos vigentes de tu posición — todo guardado **localmente en el
> dispositivo**, usable sin conexión, a bordo.

## Problema

Planificar una travesía larga hoy exige cruzar tres fuentes que no se hablan entre sí:

1. **Conocimiento de rutas** — cuándo salir, por dónde, qué evitar. Base clásica: *World Cruising
   Routes* (Jimmy Cornell), inigualable en temporadas, peligros y waypoints, pero en papel y de 1995.
2. **Condiciones estacionales** — vientos y corrientes medios por zona y mes (pilot charts). Hoy
   solo existen como cartas sueltas.
3. **Condiciones reales** — avisos de ciclones, meteo actual, corrientes operativas. Hoy dependen de
   APIs sueltas y de estar online.

Ninguna app las combina, y ninguna funciona bien sin conexión — que es exactamente la condición en
que más se necesitan.

## Qué resolvemos

Un solo lugar donde la **posición determina el contexto**: con una coordenada sabemos en qué cuenca
estás, qué avisos te aplican, qué pilot chart te corresponde, qué rutas de Cornell son relevantes y
qué estación local armar.

## Qué somos y qué no (revisado 2026-10-13)

Somos **casi un plotter**: planificamos la travesía y después la acompañamos en tiempo real
(seguir ruta, ETA, alarmas, fondeo, hombre al agua, carta de detalle offline por zonas, balizas y
batimetría de datos abiertos). Lo que **no** somos:

- No somos un plotter certificado: no distribuimos cartas oficiales (ENC/raster de hidrografías) y
  no sustituimos al equipo de a bordo para aproximaciones y puertos.
- No procesamos AIS ni tráfico marítimo (hasta que exista target nativo con NMEA, ADR-004).
- No gobernamos piloto automático ni instrumentos.
- No tenemos backend propio: todo vive en el dispositivo.

## Principios

1. **Offline primero.** Todo lo esencial está en el dispositivo antes de que salgas del puerto.
2. **La posición manda.** El contenido se adapta a dónde estás, no al revés.
3. **Sin backend.** Sin cuentas en la nube, sin servidor que mantener, sin dependencia nuestra.
4. **Datos abiertos.** Solo fuentes públicas (NOAA, Open-Meteo, MET Norway, NWS).
5. **Atribución.** El conocimiento de rutas proviene de Cornell; se cita, no se reproscribe.

## Fuentes de conocimiento

| Fuente | Rol | Estado |
|---|---|---|
| *World Cruising Routes*, Jimmy Cornell, 2ª ed. (1995) | Base de rutas, waypoints, temporadas, peligros, tips | Reindexado a `data/catalog/v1/` |
| Pilot charts / climatologías de viento y corriente | Capas estacionales mensuales | Assets empaquetados |
| Open-Meteo, MET Norway, NWS | Meteo operativa y corrientes en vivo | Cliente directo con cache local |
| NHC (NOAA) | Avisos y tormentas tropicales activas | Directo (nativo) / relay estático (web) |
| Rutas importadas por el usuario | GPX / KML / CSV de otras apps | Importador y exportador propio |

## Criterio de éxito

Un navegante puede, **sin conexión**, abrir la app en medio del océano y responder: ¿dónde estoy en el
esquema de Cornell?, ¿qué ventana de temporada corresponde?, ¿qué corriente y viento me tocan este
mes?, ¿hay algún aviso tropical activo sobre mi ruta?, ¿y cuánto me falta al siguiente waypoint?

## Proyectos hermanos

- **`wheatherDashBoard` (Panamarina Watch)** — proyecto independiente. Es el **referente de diseño**
  de cómo debe funcionar el clima local, y el origen de la idea de "estación local". El app instalado
  **no** tiene acceso a su `server.py`; solo consume fuentes externas.
