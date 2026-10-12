# ADR-001: Stack multiplataforma

**Estado:** Aceptado · **Fecha:** 2026-10-07 · **Fase:** P0

## Contexto

El producto debe correr en iOS, Android y Web con una sola base de código, datos locales y sesión
local. Hay que elegir framework, mapa, base de datos y networking, y decidir qué versión de cada
target es viable.

## Decisión

**Kotlin Multiplatform + Compose Multiplatform.**

| Elemento | Elección |
|---|---|
| Lenguaje / UI | Kotlin + Compose Multiplatform |
| Targets | Android, iOS (diferido), **Web = Kotlin/JS** |
| Mapa | `org.maplibre.compose:maplibre-compose` (MapLibre Native en Android/iOS, MapLibre GL JS en browser) |
| Base de datos | SQLDelight 2.x con `generateAsync = true` |
| Drivers | `android-driver` · `native-driver` · `WebWorkerDriver` + `sql.js` |
| Networking | Ktor Client + `kotlinx.serialization` |
| Scheduling/cache | `kotlinx-datetime`, cache TTL propio sobre SQLDelight |

## Por qué

- **Un solo lenguaje** para dominio, red, persistencia y UI reduce el triple coste de mantener
  tres codebases.
- **MapLibre** es la única vía multiplataforma con un mismo API de estilos/capas/cámara, y ya se usa
  Leaflet/MapLibre en el proyecto hermano Panamarina Watch.
- **SQLDelight** da tipos seguros en tiempo de compilación y se puede sembrar con el catálogo
  extraído del libro.

## Descartado y por qué

| Alternativa | Motivo de descarte |
|---|---|
| Flutter | Dart aparte; el resto del ecosistema ya es JVM/JS. Menor integración con mapas nativos |
| React Native + RN Web | JS/TS, pero exigiría reimplementar toda la lógica y el tipado perdería valor |
| Tres apps nativas | Triple mantenimiento; imposible para este alcance |
| **Kotlin/Wasm** | **No viable hoy:** MapLibre Compose no soporta Wasm (depende de Spatial-K) y SQLDelight no tiene driver Wasm. Se elige **Kotlin/JS** para el browser |

## Consecuencias

- **Positivas:** una base de código; dominio compartido; el catálogo y los importadores se escriben
  una sola vez; mismo modelo de cache offline.
- **Negativas:** el target JS de Compose es el menos maduro de los tres — es el **gate del P0**;
  SQLDelight en JS usa `WebWorkerDriver` asíncrono, lo que contamina las firmas con `suspend`.
- **Mitigación:** si el spike falla, se conserva `shared/` KMP y el Web usa un frontend propio
  (ya existe como referencia en Panamarina Watch). El costo de la bifurcación es ~0 iteraciones
  porque el spike ocurre antes de escribir UI.

## Versiones

- Kotlin 2.x · Compose Multiplatform 1.12.x · SQLDelight 2.1.x · MapLibre Compose 0.x (API inestable)
- Java 21 (toolchain) · Gradle 9.x

## Referencias

- maplibre.org/maplibre-compose — matriz de soporte por plataforma (sin Wasm)
- sqldelight.github.io — drivers soportados por plataforma (sin Wasm)
