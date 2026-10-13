# Arquitectura de experiencia — Holistic Navigator

**Estado:** Propuesta para validar · **Fecha:** 2026-10-13 · **Fase:** post-prototipo
**Roles:** arquitectura de usabilidad (Claude) define y valida · Big Pickle (opencode) implementa según
[`04-backlog-ux.md`](04-backlog-ux.md).

Este documento traduce el espíritu de [`00-mission.md`](00-mission.md) a un modelo de experiencia
concreto, mide el prototipo actual contra ese espíritu y fija las decisiones de diseño que el backlog
técnico ejecuta. No reabre las decisiones de stack (ADR-001/002/004).

---

## 1. Diagnóstico: lo que promete la misión vs. lo que entrega el prototipo

El criterio de éxito de la misión son cinco preguntas que un navegante debe poder responder **sin
conexión, en medio del océano**. Hoy el prototipo responde una y media.

| Pregunta del criterio de éxito | Estado en el prototipo (código leído 2026-10-13) | Brecha |
|---|---|---|
| ¿Dónde estoy en el esquema de Cornell? | No existe. La posición solo sirve para navegar hacia la ruta ya elegida a mano. | Falta el motor **posición → contexto** (cuenca, rutas cercanas). Es el corazón de la misión ("la posición manda"). |
| ¿Qué ventana de temporada corresponde? | La ficha muestra `Temporada: may, ago`: dos meses sueltos extraídos por regex de *"Late May to mid-August"*. | Se destruye la ventana. El EPUB trae `bestTime` para 400/400 rutas. |
| Temporada de ciclones | Tabla fija por región escrita en código (`Recommendations.kt`). | El libro trae `tropicalStorms` por ruta (385/400); se ignora. |
| ¿Qué viento y corriente me tocan este mes? | No existe (ni pilot charts ni meteo). | Fase posterior. Requiere dos piezas que este documento deja listas: **mes de planificación** y **cuenca resuelta**. |
| ¿Hay un aviso tropical activo sobre mi ruta? | `nhc.json` es un placeholder vacío. El relay del ADR-003 no está implementado (no existe `relay/`). | Relay real + **antigüedad del dato visible**. |
| ¿Cuánto me falta al siguiente waypoint? | Sí: rumbo, distancia, XTE, cuando hay ruta seleccionada y GPS. | Falta "seguir ruta" explícito, posición manual y lenguaje sin jerga. |

Y contra los principios:

| Principio | Estado | Brecha |
|---|---|---|
| **Offline primero** | El service worker precachea shell, índice y geojson; los `facts/*.jsonl` solo se cachean si ese capítulo se visitó. El mapa base es el estilo *demo* online de MapLibre. | En el mar: **mapa en blanco** y fichas vacías de capítulos no visitados. Se necesita precache total y un mapa base empaquetado (ADR-005). |
| **Registrar mi travesía** (job 7) | La bitácora vive en memoria (`remember`): **se pierde al recargar**. Sin notas. | Persistencia local + notas. |
| **Trazar mi plan… exportar** (job 5) | Importa GPX/KML/CSV; solo exporta la bitácora. | Exportar los waypoints de una ruta de Cornell a GPX es el uso práctico número uno (cargar al plotter). |
| **Explorar en el mapa** (persona 3) | El mapa dibuja únicamente la ruta seleccionada. | El catálogo no se ve en el mapa; no hay exploración espacial. |
| **Atribución** | Correcta en ficha. | La documentación dice "2.ª ed. 1995" pero los datos son de la **8.ª edición (EPUB)**. Hay que alinear `02-content.md`. |

### Fricciones de usabilidad (no son brechas de espíritu, pero cuestan confianza)

- Idioma mezclado: UI en español, títulos de ruta en inglés sin subtítulo humano.
- `Millas: 2421, 9` (lista cruda por variante, sin etiqueta), `Waypoints: 8 (falmouth, lizard, landsend…)` (códigos internos en minúscula).
- "Datos a revisar (trazado cruza tierra)" en rojo en 164 de 400 rutas (41 %): un flag interno de QA leído como "la app está rota".
- El **simulador** (herramienta de desarrollo) comparte el panel principal con la bitácora; botones `↺`, `x4`, `◉` sin etiqueta.
- `XTE 0.3 nm der · tramo 3`: jerga sin contexto.
- GPS falla en silencio (errores solo en consola); sin estado "buscando / denegado / sin GPS".
- Sin indicador de conexión ni de "listo para usar sin red".
- El service worker es *cache-first* con nombre de caché fijado a mano (`hn-v14`): un despliegue nuevo **no llega** al usuario hasta que alguien cambie ese número.
- `?route=` se lee de la URL pero no se escribe al seleccionar: no se puede compartir ni guardar la selección.
- Chip de saludo "Holistic Navigator" en el centro superior del escritorio: ocupa el lugar más valioso y no dice nada.
- Objetivos táctiles de ~24 dp en chips y botones de texto.
- En móvil el panel tapa el mapa por completo: elegir ruta y verla son dos pasos excluyentes.

---

## 2. El espíritu, en una frase operativa

> **Con una coordenada y un mes, la app te dice dónde estás, cuándo conviene moverte y por dónde,
> sin red.**

De aquí sale el modelo mental de la app: hay exactamente **tres entradas** que el usuario controla y
todo lo demás se deriva de ellas.

| Entrada | Fuentes | Valor por defecto | Siempre visible en |
|---|---|---|---|
| **Posición** | GPS · fijada en el mapa · escrita a mano · simulada | GPS si hay permiso; si no, "sin posición" | chip de posición (barra superior) |
| **Mes de planificación** | selector de 12 meses | mes actual | barra superior |
| **Ruta activa** | elegida desde el catálogo, el mapa o "Aquí" | ninguna | tira inferior (peek) |

Todo panel, texto y color de la app se explica como una función de estas tres entradas. Si una
pantalla no se puede describir así, no pertenece al producto.

---

## 3. Modelo de pantalla

Mobile-first. Un solo código Compose; en escritorio la hoja inferior se acopla como panel izquierdo.
El mapa **siempre** está visible, al menos en parte.

```
MÓVIL (390 × 844)                                ESCRITORIO (≥ 900 px)
┌──────────────────────────────────┐             ┌──────────────┬──────────────────────────────────┐
│ 📍 Atlántico Norte · OCT ▾ · ⚠   │ GPS ±12 m   │ Aquí Rutas   │ 📍 Atlántico Norte · OCT ▾ · ⚠   │
├──────────────────────────────────┤             │ Travesía     │                                  │
│                                  │             ├──────────────┤          MAPA                    │
│             MAPA                 │             │              │   (costa empaquetada + rutas     │
│   costa · rutas del filtro       │             │   contenido  │    del filtro + ruta activa +    │
│   (tenues) · ruta activa (fuerte)│             │   del tab    │    mi posición + avisos)         │
│   · waypoints con nombre ·       │             │   (scroll)   │                                  │
│   mi posición · tormentas        │             │              │                                  │
│                                  │        ◉    │              │                               ◉  │
├──────────────────────────────────┤             │              │                                  │
│ ▲ AN12 · Falmouth → Newport      │ Seguir ▸    │              │ Sin conexión · listo   ? ayuda   │
│   Aquí   ·   Rutas   ·  Travesía │             └──────────────┴──────────────────────────────────┘
└──────────────────────────────────┘
      hoja inferior: peek / media / completa
```

### 3.1 Barra de contexto (arriba)

Una línea, siempre presente, que responde "dónde y cuándo":

`📍 {cuenca} · {MES} ▾ · {estado de ciclones}` + chip de posición a la derecha.

- Tocar la cuenca → abre el tab **Aquí**.
- Tocar el mes → selector de mes de planificación (12 chips, "hoy" para volver al actual).
- Chip de posición: estados `buscando…` / `GPS ±12 m` / `fijada` / `simulada` / `GPS denegado` /
  `sin GPS`. Tocar → menú: *Usar GPS · Fijar en el mapa · Escribir coordenadas · Apagar*.
- Sin posición: `📍 Sin posición · OCT ▾` y el tab Aquí explica cómo fijarla.

### 3.2 Hoja inferior / panel lateral, tres tabs

**Aquí** (el contexto; la pantalla de la misión)

1. Cuenca y mes: "Estás en el **Atlántico Norte**. Octubre: ⚠ temporada de ciclones (jun–nov)."
2. Avisos activos en tu cuenca, con distancia a tu posición, o "sin tormentas activas · avisos de
   hace 12 min". Sin cobertura NHC: nombre del centro responsable (Météo-France La Réunion, BoM,
   Fiji/Nadi, JTWC, IMD).
3. **Rutas cerca de vos**: hasta 8 rutas a menos de 600 nm, ordenadas por distancia al trazado:
   `AN12 · Falmouth → Newport · pasa a 35 nm · ✔ en ventana`. Tocar → ficha.
4. Si hay ruta activa: próximo waypoint, rumbo, distancia, desvío (babor/estribor), tramo n de m.

**Rutas** (el catálogo)

- Búsqueda (código, puerto, cuenca) + chips de cuenca + chip "cerca de mí" cuando hay posición.
- Lista: `AN12 · Falmouth → Newport` · título del libro en inglés como secundaria · insignia de
  ventana para el mes de planificación (✔ / ⚠ / —) · `3011–3309 nm`.
- "+ Importar GPX/KML/CSV" como fila al final, no como botón protagonista.
- Lo que la lista filtra, el mapa muestra: el filtro es espacial y textual a la vez.

**Ficha de ruta** (se abre dentro del tab Rutas, con `‹ Rutas` para volver; ver §5).

**Travesía** (la bitácora)

- Estado: `● grabando · 12.3 nm · desde 06:40` o `○ en pausa`.
- Acciones: Grabar/Pausar · + Nota · Exportar GPX · Nueva travesía · Borrar (con confirmación).
- Línea de tiempo: notas con hora y posición; travesías anteriores guardadas.

### 3.3 Sobre el mapa

- Botón ◉ "Centrar" (en mi posición; si no hay, en la ruta activa).
- Chip "Sin conexión · listo" / "En línea" + "? ayuda" abajo a la izquierda (en móvil, dentro del tab
  Aquí para no tapar el mapa).
- Nada más. El simulador y la bitácora dejan de ser controles flotantes.

---

## 4. Las tres entradas, en detalle

### 4.1 Posición

```
PositionSource = Gps | Manual(lat, lon) | Simulated(routeVariant, nm)
PositionStatus = Off | Searching | Fixed(accuracyM) | Denied | Unavailable
```

- **Manual** es una función de primera clase, no un atajo de desarrollo: el planificador en tierra y
  el navegante antes de zarpar necesitan preguntar "si estuviera en 15°N 60°W en marzo…". Se fija
  tocando el mapa (tras elegir *Fijar en el mapa*) o escribiendo coordenadas en cualquier formato
  habitual (`15.5 -60.2`, `15°30'N 60°12'W`, `15 30.0 N 60 12.0 W`).
- **Simulada** solo existe mientras se "recorre" una ruta desde su ficha; al detener, vuelve la
  fuente anterior. El marcador es ámbar y la barra dice `simulada`.
- La posición manual y la última fija GPS se persisten: al abrir sin red y sin GPS, la app sigue
  teniendo contexto.

### 4.2 Mes de planificación

Estado global, por defecto el mes actual (UTC), cambiable desde la barra. Gobierna: el veredicto de
ciclones en la barra y en Aquí, la tira de meses de cada ficha, las insignias de la lista y, en la
fase P-D, la capa de viento y corriente. Se persiste por sesión; "hoy" lo devuelve al actual.

### 4.3 Ruta activa

Se activa con **Seguir esta ruta** (ficha o tira peek). Solo con ruta activa aparece el bloque de
navegación (próximo waypoint, rumbo, distancia, desvío). Seleccionar una ruta para *verla* no la
activa: ver y seguir son acciones distintas, y eso evita que el panel de navegación aparezca al
explorar el catálogo.

---

## 5. Ficha de ruta: anatomía

Orden fijo, de más accionable a más contextual. Scroll completo (sin tope de 320 dp).

1. **Cabecera**: `AN12` · `Falmouth → Newport` · *Europe to North America (southern routes)*.
2. **Acciones**: `Seguir` · `Exportar GPX` · `Recorrer ▶` · `Enlace`.
3. **Cuándo** — tira de 12 meses `E F M A M J J A S O N D`: verde = mejor época (`bestMonths`),
   rojo rayado = tormentas tropicales (`stormMonths`), borde = mes de planificación. Debajo, texto:
   `Mejor época: finales de mayo a mediados de agosto` · `Ciclones: junio a noviembre` · veredicto
   para el mes elegido: `✔ junio está en la mejor época` / `⚠ octubre: temporada de ciclones` /
   `— marzo: fuera de la mejor época`. Si la ruta no trae datos, se usa la tabla por cuenca y se
   indica "(estimación por cuenca)".
4. **Consejo** (nuestro) · **Cómo encarar · {cuenca}** (nuestro) · **Del libro** (cita corta con
   atribución). Se conservan tal cual.
5. **Variantes**: filas `A · Falmouth → Newport · 3309 nm`, `B · … · 3011 nm`, `C · … · 1176 nm`.
   Seleccionar una resalta su trazado y filtra la tabla de waypoints.
6. **Waypoints** de la variante: `#`, nombre, `50°00.0'N 005°02.0'W`, ● destino, ⚑ corregido
   (tooltip: "coordenada corregida respecto al libro"). Tocar → centra el mapa en ese punto.
7. **Cartas** (`BA 4011, US 121`) · **Guías** · **Planificador** (referencias del libro, texto plano).
8. **Nota de trazado** solo si `needsReview`: en azul informativo, no rojo:
   "Trazado orientativo: en tramos costeros faltan waypoints intermedios. Verificá con tu carta."
9. **Atribución**: `World Cruising Routes, 8.ª ed. — Jimmy & Doina Cornell`.

Desaparecen: `Waypoints: 8 (falmouth, lizard…)`, `Millas: 2421, 9`, la línea
"8.ª edición · waypoints GPS reales" del catálogo (va a la ayuda/acerca de).

---

## 6. Decisiones de UI (cerradas salvo objeción)

1. **Idioma**: UI en español rioplatense (voseo, como ya está). Los títulos del libro quedan en inglés
   como dato secundario; la línea humana es siempre `origen → destino`.
2. **Sin jerga interna**: `needsReview` → "trazado orientativo"; `XTE` → "desvío 0,3 nm a estribor";
   `tramo 3` → "tramo 3 de 8"; `◉` → "Centrar"; `↺` → "Reiniciar".
3. **Estados siempre visibles**: posición (fuente + calidad), mes, ruta activa, conexión, antigüedad
   de los avisos. Un navegante decide con datos viejos solo si sabe que son viejos.
4. **Objetivos táctiles ≥ 44 dp.** Acciones destructivas (borrar bitácora, quitar importada) con
   confirmación.
5. **El simulador es "Recorrer la ruta"**, una acción de la ficha. Sirve al usuario (previsualizar el
   trazado y los waypoints) sin disfrazarse de GPS.
6. **Mapa base empaquetado** (ADR-005): costa Natural Earth 110m + retícula de 10°, estilo oscuro.
   Sin teselas online por ahora: para planificar océanos la costa basta, y así el mapa es idéntico
   con y sin red. Las teselas vuelven como capa opcional cuando exista una política de atribución.
7. **Avisos NHC vía rama `data`** (ADR-006): el relay escribe un JSON en una rama del repo y la app
   lo lee por `raw.githubusercontent.com` con caché local y edad visible.
8. **Tres temas: Día, Noche, Rojo**, con cambio manual en un toque y automático por hora solar
   (corregido el 2026-10-13; antes decía "tema oscuro único"). Ver §6 ter, regla 3.
9. **Rutas importadas** se tratan igual que las del libro: tienen ficha (sin "cuándo"), se pueden
   seguir, recorrer y exportar.

---

## 6 bis. Es un navegador: "casi un plotter"

Decisión de Diego (2026-10-13): la app **tiene que ser casi un plotter**. Planifica la travesía y
después la acompaña en tiempo real. El límite ya no es "no navegamos", sino "no somos un plotter
certificado": sin cartas oficiales ENC, sin AIS hasta el target nativo, sin piloto automático. Los
non-goals de `00-mission.md` y `01-target.md` quedaron actualizados.

Qué significa "casi un plotter" en esta app, por capas, de más a menos esencial:

| Capa | Qué incluye | Épica |
|---|---|---|
| **Seguir la ruta** | Próximo waypoint, rumbo, distancia, desvío, **ETA**, SOG/COG, VMG, paso automático de waypoint, pantalla "Navegando" grande y de noche (rojo) | E9 |
| **Seguridad** | Alarmas de desvío y llegada, **vigilancia de fondeo**, **hombre al agua (MOB)** con un toque: marca la posición y navega de vuelta; pantalla siempre encendida (`Wake Lock`) | E9 |
| **Carta de detalle** | PMTiles sobre OSM por zonas descargables; **batimetría** Natural Earth (polígonos 0–200–1000–2000… m, dominio público, liviana) como piso mundial; **balizas y luces** de OpenSeaMap como capa opcional cuando hay red | E10 |
| **Herramientas de carta** | Modo seguir/centrado y **proa arriba**; vector de rumbo (dónde estaré en 10/30/60 min); **medir** distancia y rumbo entre dos puntos; anillos de distancia; crear **waypoint** tocando; **editor de rutas propias** (crear, arrastrar, insertar, invertir, exportar) | E11 |
| **Bitácora** | Track continuo persistente, notas, parte diario, travesías archivadas | E5 |

Lo que **no** entra: AIS (hasta NMEA nativo), cartas oficiales, mareas y corrientes de marea en
tiempo real, enrutado automático evitando tierra, piloto automático, radar.

Consecuencias de arquitectura:

- **El mapa es la pantalla.** La hoja inferior nunca tapa más del 50 % salvo que el usuario la
  extienda. Todo control de navegación vive sobre el mapa o en la tira peek.
- **La ruta activa es editable.** Una ruta de Cornell se "copia a mis rutas" para ajustarla: los
  datos del libro no se modifican; la copia es del usuario.
- **El target nativo sube de prioridad** (ADR-004): en Web las alarmas y el track solo funcionan con
  la app en primer plano, y Wake Lock mitiga pero no resuelve. Un APK por Capacitor con un servicio
  en segundo plano es el paso lógico tras P-E.
- **Datos pesados por zona, no por app**: batimetría y detalle se descargan por cuenca, nunca el
  mundo entero obligatorio. El piso (costa + batimetría gruesa + retícula) sigue cabiendo en el
  precache.

---

## 6 ter. Usabilidad a bordo: reglas verificables

Un plotter se usa en condiciones hostiles: sol directo, pantalla mojada, una mano (la otra en el
timón), guantes, noche, movimiento y fatiga. Cada regla de abajo es un criterio de aceptación; si
una pantalla no la cumple, no se entrega.

### Dos modos, uno automático

| | **Planificar** | **Navegar** |
|---|---|---|
| Cuándo | Sin ruta activa, o con ruta activa pero parado (SOG < 0,5 kn más de 2 min) | Ruta activa y en movimiento, fondeo activo o MOB |
| Pantalla | Mapa + hoja hasta 50 % + listas y fichas | Mapa a pantalla completa + tira de datos grandes; la hoja solo en peek |
| Texto | Normal | Mínimo 24 sp para datos, 40 sp para la cifra principal |
| Entrada de texto | Sí | **Nunca.** Solo toques y pulsación larga |
| Diálogos modales | Confirmaciones de borrado | **Ninguno.** Las alarmas son bandas con un único botón "Silenciar" |

El cambio es automático y se puede forzar con un toque en la tira. Nada de lo que se ve en Navegar
exige leer más de tres números.

### Reglas

1. **Regla de los tres segundos.** Al abrir la app, en < 3 s se ve el mapa con la posición (o "sin
   posición" y cómo fijarla). Nada de pantalla de carga que exija leer; nada de ayuda modal cuando
   hay ruta activa.
2. **Regla del pulgar.** Todo lo que se usa navegando (Centrar, Seguir, Silenciar, MOB, cambiar
   modo) está en el tercio inferior de la pantalla y a ≤ 80 px del borde derecho o izquierdo
   (configurable: mano derecha/izquierda). Objetivos ≥ 56 dp en Navegar, ≥ 44 dp en Planificar,
   con ≥ 8 dp de separación.
3. **Regla del sol.** Tres temas, no uno: **Día** (fondo claro, contraste ≥ 7:1 en datos), **Noche**
   (el oscuro actual) y **Rojo** (para no perder la visión nocturna). Cambio manual en un toque desde
   la tira y automático por hora solar local (puesta/salida calculadas de la posición). Corrige la
   decisión 8 de §6: "tema oscuro único" era un error para un plotter.
4. **Regla del agua.** Ninguna acción crítica depende de un gesto fino: nada de deslizar para borrar,
   nada de doble toque con significado. Pulsación larga (600 ms) solo para crear waypoint y MOB,
   siempre con confirmación visual progresiva (anillo que se llena).
5. **Regla de reversibilidad.** Toda acción se deshace con un toque durante 8 s ("Ruta quitada ·
   Deshacer") en lugar de pedir confirmación antes. Solo borrar una travesía o una ruta propia pide
   confirmación.
6. **Regla de un vistazo.** Cada estado tiene un signo visible sin leer: color del marcador por
   fuente de posición (azul GPS, violeta manual, ámbar simulada), borde rojo pulsante en alarma,
   chip gris "sin conexión", punto rojo en "● grabando". El texto confirma, el color avisa.
7. **Regla de los datos viejos.** Toda cifra que puede envejecer (posición, aviso NHC, ETA) muestra
   su edad cuando supera un umbral: posición > 30 s → "hace 2 min" en ámbar; aviso > 6 h → ámbar;
   > 24 h → gris. Nunca se muestra un dato sin que se note que es viejo.
8. **Regla del silencio.** Las alarmas suenan hasta que se silencian, y una vez silenciadas no vuelven
   a sonar por la misma causa hasta que la condición se resuelve y se repite. Nada de alertas
   informativas con sonido.
9. **Regla de la carta.** El mapa responde a los gestos estándar (arrastrar, pellizcar, rotar) y nada
   más; cualquier arrastre suelta el modo seguir y muestra "Volver a seguir". Zoom y rotación nunca
   cambian solos mientras el usuario toca el mapa.
10. **Regla del lenguaje.** Español rioplatense, términos náuticos correctos (estribor/babor, rumbo,
    desvío, SOG, ETA), sin siglas internas, sin inglés salvo nombres propios y títulos del libro.
    Unidades: millas náuticas, nudos, grados verdaderos, coordenadas en grados y minutos decimales.
11. **Regla del primer uso.** La ayuda de primer uso cabe en una pantalla, se puede saltar, y la
    primera acción que propone es "Fijar mi posición" si no hay GPS. Nada de tour de cinco pasos.
12. **Regla del escritorio.** Todo funciona con teclado y ratón: rueda = zoom, Esc = cerrar ficha,
    `/` = buscar, flechas en listas. El panel lateral no tapa nunca el mapa en escritorio.

### Pruebas de usabilidad (protocolo mínimo)

Cinco tareas, con un navegante real (no el equipo), teléfono en mano, de pie, idealmente al sol.
Se mide tiempo y errores; el umbral es el criterio de aceptación de cada fase.

| # | Tarea | Umbral |
|---|---|---|
| 1 | Abrir la app y decir en qué cuenca está y si es temporada de ciclones | < 10 s, sin ayuda |
| 2 | Encontrar la ruta de Canarias al Caribe y saber en qué meses conviene salir | < 45 s |
| 3 | Seguir esa ruta y leer rumbo, distancia y ETA al próximo waypoint | < 20 s desde la ficha |
| 4 | Fijar una posición manual en 15°N 60°W sin usar el teclado del mapa | < 30 s |
| 5 | Activar la vigilancia de fondeo y silenciar la alarma con una mano | < 15 s, una mano |

Además, en cada entrega: revisión heurística con esta lista (12 reglas) sobre capturas de 390 px
y 1366 px, y comprobación de contraste en los tres temas.

---

## 6 quater. Presupuesto de recursos (objetivo no menor)

Diego fijó dos restricciones duras (2026-10-13): no forzar la máquina donde se compila, y una app
ultraperformante con los mínimos recursos posibles. Se tratan como criterios de aceptación, no como
deseos. La decisión de stack que las hace posibles está en [ADR-007](adr/007-web-ligero.md); las
reglas de abajo valen con cualquier stack.

### Presupuestos (los mide `scripts/budget.sh`; superarlos rompe el build)

| Métrica | Límite |
|---|---|
| Transferencia de la primera carga (gzip, sin zonas de teselas) | ≤ 1,2 MB |
| JS a parsear (bruto) | ≤ 1,5 MB |
| Arranque frío hasta mapa con posición (móvil medio) | ≤ 1,5 s |
| Memoria de la pestaña en móvil | ≤ 120 MB |
| Precache offline completo (sin zonas) | ≤ 6 MB |
| Catálogo (geojson + índice + facts, gzip) | ≤ 0,5 MB |
| Zona de teselas descargable | ≤ 150 MB, con tamaño visible antes de descargar |
| Build de producción | ≤ 5 s, ≤ 300 MB de RAM |
| Tests | en Node, ≤ 3 s |

### Reglas de rendimiento en tiempo de ejecución

1. **Nada repinta si nada cambió.** La UI se actualiza por señales del store, no por bucles. Prohibido
   `setInterval` para dibujar; el simulador usa `requestAnimationFrame` y se detiene si la pestaña no
   está visible (`visibilitychange`).
2. **El mapa recibe datos, no capas nuevas.** Las fuentes GeoJSON se crean una vez y se actualizan con
   `setData`; el filtro del catálogo es una expresión `["in", ["get","code"], [...]]`, nunca una
   reconstrucción de la colección. El catálogo completo se carga una vez y se mantiene en memoria
   como `Float32Array` de coordenadas por variante para los cálculos (cercanía, navegación).
3. **GPS con criterio.** `watchPosition` con `maximumAge` 5 s y `enableHighAccuracy` solo en modo
   Navegar; en Planificar, 30 s y baja precisión. Ningún cálculo pesado (cercanía sobre 2 268
   variantes) más de una vez cada 10 s o cuando la posición se movió > 0,5 nm.
4. **Datos compactos.** Coordenadas a 4 decimales (≈ 11 m, suficiente para un libro de rutas
   oceánicas); facts por capítulo bajo demanda; índice sin campos que la lista no muestra; nada de
   texto duplicado entre índice y facts.
5. **Sin dependencias por comodidad.** Cada dependencia nueva se justifica en el commit con su
   tamaño gzip y por qué no se escribe en 50 líneas. Límite: MapLibre GL JS + `pmtiles` (E10) +
   herramientas de build.
6. **Fuentes del sistema**, sin webfonts. Iconos como SVG inline (≤ 20, ≤ 1 KB cada uno), sin
   librerías de iconos.
7. **Batería.** Wake Lock solo en Navegar/fondeo/MOB; sin animaciones continuas en Navegar (el
   pulso de alarma es CSS, pausado al silenciar); el mapa en Navegar no rota salvo en proa arriba.

### Reglas para no forzar la máquina de compilación

- Un solo build a la vez; nunca dev y producción encadenados sin `pkill -f KotlinCompileDaemon`
  entre medio (mientras exista Gradle). Con ADR-007 aceptado, Gradle desaparece del ciclo Web.
- Tests en Node o Python, nunca en browser.
- `free -m` antes de un build pesado; si hay < 2,5 GB disponibles, no se lanza.
- La extracción de PMTiles y la batimetría se corren en GitHub Actions, nunca en la laptop.

---

## 7. Fases y orden

| Fase | Objetivo | Épicas del backlog | Resultado observable |
|---|---|---|---|
| **P-A Verdad y claridad** | Que lo que ya existe sea cierto, completo y legible | E0 catálogo v3 · E1 offline real · E3 ficha · E5 bitácora · E6 controles | Ficha con ventana real, mapa con costa sin red, bitácora que sobrevive, controles sin jerga |
| **P-B La posición manda** | Cumplir la frase operativa | E2 contexto · E4 mapa explorable | Barra de contexto, tab Aquí, rutas cerca, posición manual, catálogo visible en el mapa |
| **P-C Avisos vivos** | Tormentas reales con edad del dato | E7 relay NHC | Avisos en Aquí y en el mapa, en móvil y sin backend |
| **P-D Viento y corriente** | Pilot charts del mes | E8 (solo diseño/ADR en este ciclo) | Flechas de viento/corriente por mes sobre el mapa, empaquetadas |
| **P-E Seguir y seguridad** | Capas 1–2 de §6 bis | E9 | ETA, SOG/COG, alarmas, fondeo, MOB, pantalla "Navegando", Wake Lock |
| **P-F Carta de detalle** | Capa 3 de §6 bis · ADR-005 fase 2 | E10 | Batimetría en el piso, PMTiles por zona, balizas OpenSeaMap |
| **P-G Herramientas de carta** | Capa 4 de §6 bis | E11 | Proa arriba, vector de rumbo, medir, waypoints y rutas propias editables |
| **P-H Nativo** | ADR-004 / ADR-009 | — | APK Capacitor con servicio en segundo plano para alarmas y track |
| **P-I Enrutado** | ADR-008 | E12 | Rutas sin tierra, ruta del mes por climatología, ruta óptima con el viento (isócronas), ceñida resuelta |

P-A y P-B pueden ir en paralelo por archivos distintos (datos/ficha vs. motor de contexto), pero
**E0 va primero**: todo lo demás consume el contrato de datos v3.

---

## 8. Cómo se verifica (definición de hecho)

Para cada épica, además de los criterios de aceptación del backlog:

1. `scripts/build-web.sh jsBrowserDistribution` sin errores; servir `productionExecutable`.
2. **Prueba offline**: cargar una vez en línea, activar modo avión (o "Offline" en DevTools), recargar,
   abrir cualquier ruta de cualquier capítulo: mapa con costa, ficha completa, sin errores de consola.
3. **Prueba de posición manual**: fijar 15°N 60°W, mes agosto → barra `Atlántico Tropical · AGO · ⚠`;
   Aquí lista rutas AT/AN a < 600 nm ordenadas por distancia.
4. **Prueba móvil** (390 px): la hoja en peek deja ≥ 60 % del mapa visible; todo tocable ≥ 44 dp.
5. Tests unitarios en `shared/src/commonTest` para parsers, resolver de contexto y navegación; tests
   Python para el parser de ventanas (todas las frases distintas del EPUB).

---

## 9. Preguntas de espíritu — resueltas por Diego el 2026-10-13

Todas cerradas. Se conservan como registro de la decisión; el backlog las da por hechas.

1. **Pantalla de llegada.** ✅ **Decidido: la app abre en *Aquí*** (contexto de mi posición y mes) con el
   catálogo a un toque. (Diego, 2026-10-13.)
2. **Tabla de waypoints y exportación GPX.** ✅ **Decidido: sí.** Se muestra la tabla completa de
   waypoints de cada variante y se exporta a GPX, con atribución a Cornell en la ficha y dentro del
   archivo. Lectura de la política: las coordenadas son hechos. (Diego, 2026-10-13; T6.5 lo pasa a
   `02-content.md`.)
3. **Edición fuente.** ✅ 8.ª edición como fuente única; el PDF de 1995 queda como histórico (T6.5).
4. **Mapa base.** ✅ Costa + batimetría gruesa + retícula empaquetadas como piso (ADR-005); detalle
   OSM por zonas con PMTiles como fase 2 (pedido de Diego: "la opción más liviana y potente").
5. **Avisos por rama `data`.** ✅ ADR-006.
6. **Viento y corriente (P-D).** ✅ Solo ADR este ciclo (T8.1).
7. **Simulador.** ✅ "Recorrer la ruta" dentro de la ficha (T3.7).
8. **Nivel de navegación.** ✅ "Casi un plotter" (§6 bis). Orden: el del apartado "Orden sugerido de
   entrega" del backlog (lo que hace plotter antes que el tab Aquí).
9. **Mapa detallado.** ✅ PMTiles sobre OSM por zonas + batimetría Natural Earth en el piso, con
   atribución de OpenStreetMap (E10).
10. **Nativo.** ✅ **Decidido: planificar el APK por Capacitor como P-H** (alarmas y track en segundo
    plano), a implementar cuando haya Android SDK, después de P-E. (Diego, 2026-10-13.) Requiere un
    ADR-008 "Empaquetado Capacitor" que se escribe al cerrar E9.
