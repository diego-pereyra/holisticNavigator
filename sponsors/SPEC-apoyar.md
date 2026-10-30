# SPEC - Botón "Apoyar el proyecto" (tarea para la cola)

**Estado:** LISTA PARA COLA — implementa Big Pickle vía `SEMAFORO.md`. El gestor no toca `web/src/`.
**Fecha:** 2026-10-30
**Origen:** Ko-fi VIVA → https://ko-fi.com/holisticnavigator (enlace canónico, ver `ENLACES.md`).
**Nombre propuesto de commit/tarea:** `apoyar-kofi`

## Objetivo
Un único punto discreto en **Ajustes** que abre la página de Ko-fi del proyecto. Sin pop-up, sin
banda, sin nada en la pantalla de navegación (el que navega no se interrumpe; modo avión y una mano).

## Qué implementar

### 1) Constante del enlace (core, testeable)
- Archivo nuevo: `web/src/core/enlaces.ts`
  ```ts
  // Enlace canónico de "Apoyar el proyecto" (decisión del programa sponsors,
  // sponsors/ENLACES.md). Un solo lugar: no duplicar la URL en la UI.
  export const ENLACE_APOYAR = "https://ko-fi.com/holisticnavigator";
  ```
- Test `web/src/core/enlaces.test.ts`: el valor es exactamente `https://ko-fi.com/holisticnavigator`,
  sin query ni barra final, y `sponsors/ENLACES.md` contiene esa misma cadena (guardia anti-desparramo).

### 2) Tarjeta en Ajustes
- En `renderAjustes()` (`web/src/ui/app.ts`), insertar **después de `themeCard(ui, cleanup)`** y
  **antes** de la tarjeta "Datos sin conexión":
  - `<div class="hn-card">` con título `Apoyar el proyecto`.
  - Una línea de texto: `holisticNavigator es gratis y sin publicidad. Si te sirve, podés invitarme un café.`
  - Un enlace (`<a>`, no `<button>`): texto `Invitame un café ›`, `href = ENLACE_APOYAR`,
    `target="_blank"`, `rel="noopener noreferrer"`, `class="hn-apoyar-link"`.
- Sin estado persistido, sin contador, sin analytics, sin cookies. Funciona offline (el enlace
  simplemente no abre si no hay red; la app no se rompe ni avisa nada).

### 3) CSS
- En `web/public/app.css`, junto a `.hn-datos-link`, agregar `.hn-apoyar-link` copiando el mismo
  patrón (full width, `display:flex`, `justify-content:space-between`, `gap:10px`, `text-align:left`)
  y color de acento para el texto. **No** crear lenguaje visual nuevo ni colores fuera de los tokens
  `--hn-*` existentes.

### 4) Test de estructura
- En `web/src/ui/app.structure.test.ts`, un test que verifique:
  - `renderAjustes` contiene `ENLACE_APOYAR` y `noopener`;
  - el enlace **no** aparece en `renderMapa`/barra de navegación ni en ninguna pantalla de navegación
    (buscar `ENLACE_APOYAR` fuera de `renderAjustes` debe dar 0 en `app.ts`);
  - no hay `window.open` ni `alert`/`confirm` para esto.

## Criterios de aceptación
1. `npm test` verde en `web/`, `bash scripts/build-web.sh` < 1 s.
2. En Ajustes se ve la tarjeta "Apoyar el proyecto" al final (antes de "Datos sin conexión").
3. Click abre Ko-fi en pestaña nueva; la app queda en el mismo estado.
4. Grep de la URL en `web/src/`: **una sola** ocurrencia (la constante).
5. Nada de pop-up, banner, modal ni aviso de primer arranque.
6. Sin cambios en `docs/`, `SEMAFORO.md` (salvo `Status:done`), `queue/`.

## Fuera de alcance
- Mercado Pago / GitHub Sponsors en la UI (cuando existan, se suman como opciones **dentro** de Ko-fi
  o como segunda línea, nunca compitiendo).
- Contador de visitas (va aparte, ver `METRICAS.md`).
- Portada: si se agrega el enlace ahí, usar la misma constante y el mismo criterio discreto.
