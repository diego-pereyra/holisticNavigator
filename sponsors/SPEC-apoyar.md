# SPEC - Sección "Apoyar el proyecto" (tarea para la cola)

**Estado:** LISTA PARA COLA (rev. 2) — implementa Big Pickle vía `SEMAFORO.md`. El gestor no toca `web/src/`.
**Fecha:** 2026-10-30 (rev. 2: dos canales vivos — Ko-fi + GitHub Sponsors)
**Origen:** Ko-fi **VIVA** (https://ko-fi.com/holisticnavigator) y **GitHub Sponsors VIVA — perfil aprobado**
(https://github.com/sponsors/diego-pereyra). Reglas en `ENLACES.md`.
**Nombre propuesto de commit/tarea:** `apoyar-dos-canales`

## Objetivo
Un único punto discreto en **Ajustes** que ofrece **dos formas de apoyar**, cada una con su rol.
Sin pop-up, sin banda, sin nada en la pantalla de navegación (el que navega no se interrumpe;
modo avión y una mano).

## Qué implementar

### 1) Constantes de enlaces (core, testeable)
- Archivo nuevo `web/src/core/enlaces.ts`:
  ```ts
  // Enlaces de "Apoyar el proyecto" (decisión del programa sponsors,
  // sponsors/ENLACES.md). Un solo lugar por URL: no duplicar en la UI.
  export const ENLACE_KOFI = "https://ko-fi.com/holisticnavigator";       // puntual + vitrina
  export const ENLACE_SPONSORS = "https://github.com/sponsors/diego-pereyra"; // recurrente + corporativo
  ```
- Test `web/src/core/enlaces.test.ts`:
  - cada valor es exactamente el string declarado (sin query, sin barra final);
  - `sponsors/ENLACES.md` contiene las **dos** cadenas (guardia anti-desparramo);
  - ningún `http` dentro de `enlaces.ts` que no sea una de estas dos.

### 2) Tarjeta en Ajustes (`renderAjustes()` en `web/src/ui/app.ts`)
Insertar **después de `themeCard(ui, cleanup)`** y **antes** de la tarjeta "Datos sin conexión":

- `<div class="hn-card">` con título `Apoyar el proyecto`.
- Una línea de texto: `holisticNavigator es gratis y sin publicidad. Si te sirve, hay dos formas de reconocerlo.`
- **Dos filas, mismo componente, distinta etiqueta** (una tarjeta con dos `<a>`, no dos botones sueltos):

  | Fila | Texto visible | `href` | Aclaración (segunda línea, chica) |
  |---|---|---|---|
  | 1 | `Aporte puntual (Ko-fi) ›` | `ENLACE_KOFI` | `una vez, con tarjeta` |
  | 2 | `Sostener todos los meses (Sponsors) ›` | `ENLACE_SPONSORS` | `mensual, también para clubes y empresas` |

  Marcado por fila: `<a class="hn-apoyar-link" href=… target="_blank" rel="noopener noreferrer">`
  con un `<span class="hn-apoyar-label">` y un `<span class="hn-apoyar-nota">` adentro.
  Los textos son **exactamente** los de la tabla (términos náuticos no aplican acá; español rioplatense sí).
- Sin estado persistido, sin contador, sin analytics, sin cookies. Funciona offline: el enlace no
  abre si no hay red y la app no avisa nada ni se rompe.

### 3) CSS (`web/public/app.css`)
- Junto a `.hn-datos-link`, agregar `.hn-apoyar-link` copiando ese patrón (full width, `display:flex`,
  `justify-content:space-between`, `gap:10px`, `text-align:left`, color de acento en el label).
- `.hn-apoyar-nota`: `font-size` un escalón menor, color atenuado, `display:block`.
- **No** crear lenguaje visual nuevo ni colores fuera de los tokens `--hn-*` existentes.

### 4) Test de estructura (`web/src/ui/app.structure.test.ts`)
- `renderAjustes` contiene `ENLACE_KOFI`, `ENLACE_SPONSORS` y `noopener` (dos veces, una por fila).
- Las dos constantes aparecen **solo** dentro de `renderAjustes` en `app.ts` (0 ocurrencias en
  `renderMapa` / barra de navegación / cualquier pantalla de navegación).
- No hay `window.open`, `alert` ni `confirm` para esto.
- El orden de las filas es Ko-fi primero, Sponsors segundo (mismo orden que `ENLACES.md`).

## Criterios de aceptación
1. `npm test` verde en `web/`; `bash scripts/build-web.sh` < 1 s.
2. En Ajustes se ve la tarjeta "Apoyar el proyecto" con **dos filas**, antes de "Datos sin conexión".
3. Cada fila abre su destino en pestaña nueva; la app queda en el mismo estado.
4. Grep de cada URL en `web/src/`: **una sola** ocurrencia (su constante).
5. Nada de pop-up, banner, modal ni aviso de primer arranque.
6. Sin cambios en `docs/`, `SEMAFORO.md` (salvo `Status:done`), `queue/`.

## Fuera de alcance
- **Mercado Pago UY** en la UI: cuando exista, entra como **tercera** fila (`Transferencia local`)
  con el mismo componente y una spec aparte; no antes.
- Contador de visitas (va aparte, ver `METRICAS.md`).
- Portada: si se agrega el enlace ahí, usar las mismas constantes y el criterio discreto
  (una línea, sin tarjeta).
- Cualquier texto persuasivo, íconos nuevos o badges tipo "sponsor".
