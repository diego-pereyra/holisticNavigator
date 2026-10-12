# ADR-004: Prototipo Web-first y diferimiento de nativo

**Estado:** Aceptado · **Fecha:** 2026-10-08 · **Fase:** P0

## Contexto

El spike del P0 ya genera un bundle `Kotlin/JS` con MapLibre Compose sirviéndose en el browser.
Al mismo tiempo el entorno es restrictivo: laptop con poca RAM libre en WSL, sin `sudo` (no hay
Android SDK ni libs de navegador headless), sin Mac. Compilar el target Android o firmar un APK
es hoy la parte más pesada y lenta del ciclo.

Además, el alcance del prototipo quedó definido: **GPS del dispositivo + capas de clima/avisos +
contenido del catálogo**. El GPS externo NMEA/P2000 (TCP/UDP/serial) **no es alcance del prototipo**.

## Decisión

1. **El prototipo se desarrolla y prueba en Web**, sobre el target JS de KMP — es decir, el mismo
   código de `shared/` y la misma UI Compose. No se escribe una segunda app en HTML/TS.
2. **Android nativo (CMP) queda diferido.** Cuando haga falta un APK instalable, se empaqueta el
   bundle Web en una **WebView (Capacitor)** en lugar de compilar la UI en nativo.
3. **NMEA/serial queda fuera del prototipo.** La posición viene de `navigator.geolocation`
   (HTTPS). El camino `NmeaSource` / TCP-UDP / P2000 sigue en el diseño, habilitado cuando exista
   un target nativo.
4. iOS sigue diferido (requiere Mac; tanto CMP como Capacitor/Xcode).

```
Prototipo (hoy)          shared/ KMP ──► composeApp target JS ──► bundle ──► browser (escritorio/celular)
                              │
                              └──► (futuro) Capacitor/WebView ──► APK instalable
                              └──► (futuro) composeApp target Android ──► nativo, cuando haya SDK
```

## Por qué

- **Un solo ciclo de iteración**: `scripts/build-web.sh jsBrowserDevelopmentExecutableDistribution`
  + servidor estático. Sin Android SDK, sin firma, sin Gradle nativo.
- **El bundle Web ya sirve en el celular por URL** (GitHub Pages, ver ADR-003), así que probar en
  pantalla chica no exige instalar nada.
- **No desperdicia lo hecho**: el target Web *es* parte de KMP; `shared/` no se toca.
- **Capacitor reutiliza el mismo bundle** cuando haga falta empaquetar: ni reescritura ni
  divergencia de código.

## Consecuencias

- **Positivas:** build más liviano y predecible en la laptop (pico medido ~5 GB → hoy se opera con
  `Xmx768m` Gradle + `Xmx1400m` Kotlin daemon y sin daemon Gradle); pruebas en el dispositivo por
  URL; el ciclo "ver → tocar → recargar" se mide en minutos, no en compilaciones de Android.
- **Negativas / pendientes:**
  - **Sin acceso a sensores seriales** en el prototipo: no se puede validar la lectura NMEA/P2000.
  - **Sin app instalable** en el prototipo: depende del browser y de red para recargar (offline
    solo después de que el browser cachee el bundle).
  - el bundle dev pesa ~61 MB con source maps; **hay que pasar a build de producción** (minificado)
    antes de probarlo en el teléfono.
  - WebView (Capacitor) también necesita Android SDK para generar el APK: cambia *dónde* se
    empaqueta, no elimina el SDK para publicar en tienda.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Android nativo CMP desde ya | Requiere SDK + firma en este entorno restringido; no aporta al alcance del prototipo |
| App web + frontend propio (TS/React) | Duplicaría la UI; ADR-001 ya eligió Compose y el spike funciona |
| NMEA/P2000 en el prototipo | Fuerza un puente nativo o servidor local; fuera del alcance acordado |
| Esperar al target Android para probar en el celular | Se pierde el canal más rápido de validación (URL) |

## Relación con los ADRs previos

- **ADR-001** se mantiene (KMP + Compose + MapLibre + SQLDelight); solo se reordena *cuándo* se
  implementa el target Android.
- **ADR-002 / ADR-003** ganan peso: sin cliente nativo, las fuentes con CORS se resuelven hoy por
  el relay estático en GitHub Pages.
