# Posicionamiento — por qué alguien usaría Holistic Navigator al lado de Navionics

**Fecha:** 2026-10-15 · **Pregunta de Diego:** Navionics tiene una batimetría increíble y una
usabilidad probada durante años. ¿Qué haría que una persona se pase a nuestra app, siguiendo con
Navionics como plotter principal?

## 1. Qué es Navionics y qué no es

Navionics (Garmin) es **la carta**: cartografía costera con batimetría detallada (SonarChart, en parte
colaborativa), ruteo automático muelle a muelle, mareas y corrientes de marea, puntos de interés y
reseñas (ActiveCaptain), capa de viento y olas a pocos días, descarga de cartas por región con
suscripción anual. Es insuperable **cerca de la costa**: entrar a un puerto, fondear, esquivar un bajo.

Lo que Navionics **no hace**, y no va a hacer porque no es su negocio:

| Pregunta del navegante de océano | Navionics | Nuestra app (ya o en el plan) |
|---|---|---|
| ¿Cuándo conviene cruzar de Canarias al Caribe? | no | ventana de temporada y ciclones por ruta (hecho), pilot charts por mes (ADR-009) |
| ¿Por dónde cruzo *esta semana* con este pronóstico? | no (solo muestra el viento) | enrutado por isócronas con polar y pronóstico (ADR-008) |
| ¿Qué viento voy a tener a los 12 días, fuera del pronóstico? | no | pronóstico empalmado con climatología (ADR-009) |
| ¿En qué cuenca estoy, hay ciclones, qué rutas de Cornell me pasan cerca? | no | pestaña Aquí (hecho) + avisos NHC (E7) |
| ¿Cómo va mi travesía: millas en 24 h, ETA al destino, parte para mandar por satélite? | mínimo | parte diario, notas, GPX (hecho) |
| ¿Funciona sin red, sin suscripción, con datos abiertos? | región por suscripción, muchas funciones online | sí, por diseño (ADR-002/005) |
| ¿Qué dice el libro de referencia sobre esta ruta? | no | 400 rutas de Cornell con waypoints, consejo y cita (hecho) |

Navionics es **los ojos cerca de la costa**. El hueco es **el cerebro de la travesía**: la decisión de
cuándo salir, por dónde ir y cómo va, a escala de océano y de semanas. Las apps que cubren eso hoy
(PredictWind Offshore, qtVlm, Expedition) son herramientas de meteorología profesional, de pago, con
curva de aprendizaje, y ninguna trae el conocimiento de rutas.

## 2. El usuario que usa las dos

No es un "cambio" sino una **convivencia por rol**, y hay que diseñar para ella:

- **Meses antes:** abre la nuestra. Explora rutas de Cornell, ve en qué mes conviene, mira las pilot
  charts, arma el plan, exporta el GPX. Navionics no participa.
- **Semana de salida:** abre la nuestra. Descarga el paquete de pronóstico, corre el enrutado, elige
  el día. Exporta la ruta optimizada a Navionics.
- **En el océano:** abre la nuestra. Tira Navegando, parte diario, alarmas, pilot charts del mes,
  pronóstico empalmado, avisos de ciclones. Navionics queda cerrado: en alta mar no aporta.
- **Aproximación y puerto:** abre Navionics. Batimetría, marea, muelle. La nuestra queda cerrada.
- **Fondeado:** cualquiera de las dos para la vigilancia; la nuestra tiene la ventaja de no pedir red.

La condición para que esto funcione es que **el paso de una a otra sea trivial**: exportar e
importar rutas sin fricción. Ese puente es parte del producto, no un detalle.

## 3. Las siete razones para abrir la nuestra (en orden de fuerza)

1. **"¿Cuándo salgo?" en un toque.** Ruta → tira de meses con mejor época, ciclones y, con ADR-009,
   viento medio, constancia, corriente y riesgo ciclónico muestreados sobre la ruta. Nadie lo tiene
   junto. Es barato de construir sobre lo que ya hay.
2. **Enrutado con el viento real, sin servidor y sin pagar.** PredictWind cobra cientos de dólares al
   año por esto. Nosotros lo hacemos en el teléfono con datos abiertos (ADR-008).
3. **El libro vivo.** Las 400 rutas de Cornell en el mapa, con waypoints exportables. Para un
   crucerista, Cornell es la biblia; verla georreferenciada ya justifica la app.
4. **Conciencia de situación oceánica.** Aquí: cuenca, temporada, avisos, luz del día, rutas cerca.
   Navionics no sabe dónde está el barco en el esquema del mundo, solo en la carta.
5. **Pronóstico más allá del pronóstico.** Paquete de 7–16 días empalmado con climatología, con la edad
   del dato siempre visible. Para una travesía de 20 días es la única respuesta honesta.
6. **Travesía registrada y comunicable.** Parte diario en texto plano para mandar por satélite,
   notas con posición, GPX con todo.
7. **Independencia.** Cero suscripción, cero cuenta, cero servidor, datos públicos con atribución,
   funciona en modo avión. Para alguien que cruza océanos, la dependencia es un riesgo real.

## 4. Lo que no vamos a hacer (y hay que decirlo en la app)

- Competir en batimetría costera ni en cartas oficiales: licencias de hidrografías y años de sonar
  colaborativo. Nuestra carta de detalle (E10) es para orientarse y planificar, no para entrar a
  puerto. La nota de escala lo dice: "usá tu carta para el puerto".
- Ruteo automático costero muelle a muelle, mareas de puerto, reseñas de marinas.
- Comunidad, nube, social.

## 5. Consecuencias para el orden del trabajo

Las razones 1, 2 y 5 son las que **todavía no existen** y son las que hacen que alguien instale la app.
El detalle del mapa (E10) ya alcanza el nivel "para orientarse"; seguir invirtiendo ahí da
rendimientos decrecientes contra Navionics. Orden recomendado después de SIM:

| # | Tarea | Razón que construye | Coste |
|---|---|---|---|
| 1 | **Planificador de salida**: en la ficha, bajo "Cuándo", una tarjeta por mes con puntaje (mejor época ✔, ciclones ⚠, y con ADR-009 viento/corriente/riesgo en ruta); y en Rutas un filtro "salgo en {mes}" que ordena por puntaje | 1 | bajo: usa datos que ya están |
| 2 | **Puente con Navionics**: "Exportar a Navionics" = GPX con `<rte>` y nombre limpio + hoja de compartir del sistema (Web Share API con archivo); "Importar desde Navionics" = el importador actual + detección de rutas duplicadas | 2 y 3 | bajo |
| 3 | **E8 pilot charts** (ADR-009) — requiere las dos cuentas de datos | 1 y 5 | medio |
| 4 | **E11.4 rutas propias** (editor) | prerrequisito de 5 | medio |
| 5 | **E13 paquetes de pronóstico** (ADR-009 §4) | 5 | medio |
| 6 | **E12 enrutado por isócronas** (ADR-008) | 2 | alto |
| 7 | E7 avisos NHC reales | 4 | bajo |
| 8 | E10.4 catálogo de zonas de carta | orientación | bajo, cuando sobre tiempo |

## 6. La frase

> Navionics te lleva al puerto. Holistic Navigator te dice cuándo y por dónde cruzar el océano, y
> cómo vas mientras lo cruzás. Sin red, sin suscripción, con el libro de Cornell a bordo.
