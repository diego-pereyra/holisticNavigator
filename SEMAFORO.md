ADELANTE

TAREA ÚNICA: T11.5 — temas Día / Noche / Rojo, configurables y automáticos.


Diego (2026-10-14): "los colores de noche me cierran, de día no tanto, y quiero poder configurarlo".

Archivos: `web/public/app.css`, `web/src/ui/theme.ts` (nuevo), `web/src/main.ts`, `web/src/ui/app.ts`.
Commit `T11.5: temas Día, Noche y Rojo`.

1. **Tokens CSS** en `:root` para todo color de la UI (panel, texto, secundario, línea, acento,
   error, insignias). Tres bloques `html[data-theme="night"]` (los valores actuales),
   `html[data-theme="day"]` y `html[data-theme="red"]`:

| Token | Noche (actual) | Día | Rojo |
|---|---|---|---|
| `--hn-bg` (panel) | #0b1626 | #ffffff | #000000 |
| `--hn-panel` | #12233a | #f4f7fa | #0a0000 |
| `--hn-text` | #e8eef4 | #0f1a26 | #ff3b30 |
| `--hn-text-2` | #9FB0C0 | #5b6b7a | #b71c1c |
| `--hn-line` | #2a3b4a | #d8dee5 | #4a0000 |
| `--hn-accent` | #4FC3F7 | #0b5aa8 | #ff5252 |
| `--hn-error` | #FF1744 | #d50000 | #ff1744 |
| `--hn-ok` | #2E7D32 | #2e7d32 | #ff8a80 |
| `--hn-warn` | #C62828 | #c62828 | #ff5252 |

2. **Mapa**: `theme.ts` exporta `mapPalette(theme)` con los colores de cada capa, y `applyTheme(map, theme)`
   que hace `setPaintProperty` sobre las capas existentes (no recrea el estilo):

| Capa | Noche | Día | Rojo |
|---|---|---|---|
| background | #15263f | #dbeaf6 | #000000 |
| bathy 200/1000/2000/3000/4000/5000 | #13223a #0f1d33 #0c182b #0a1425 #081120 #060d1a | #c3dbee #b4d0e7 #a6c6e0 #98bcd9 #8bb3d3 #7faacd | #0a0000 #080000 #060000 #050000 #040000 #030000 |
| country-fill (7 tonos) | actuales | #ece9e0 #e6e3d8 #efe9dc #e9e5da #e4e2d6 #ede7de #e8e4d9 | #1a0000 ×7 |
| country-line / coast-line | #3a4a5a | #b9b4a6 / #6f8aa0 | #5a0000 |
| graticule-line / label | #17202b / #44546a | #c5d5e3 / #7a8a98 | #2a0000 / #8b0000 |
| country-label / city-label / detail-place | #6b7f96 / #9FB0C0 | #3c4a58 / #4a5a6a | #c62828 |
| detail-water / detail-earth | #0b1626 / #1c2733 | #cfe3f3 / #ece9e0 | #000000 / #1a0000 |
| catalog-lines / route-lines / route-active | #4FC3F7 | #1565c0 | #ff5252 |
| route-wps | #FFCC80 | #ef6c00 | #ff8a80 |
| nav-to-wp | #00E676 | #00897b | #ff6e40 |
| voyage-line | #FFD54F | #f9a825 | #ff9e80 |
| my-dot GPS / manual / simulada | #2979FF / #B388FF / #FF8F00 | #1e88e5 / #7e57c2 / #fb8c00 | #ff1744 / #ff5252 / #ff8a80 |
| basin-label | #4FC3F7 | #0b5aa8 | #ff5252 |
| seamarks | sus colores | sus colores | sin cambio (son señales) |
| halo de todos los textos | #0b1626 | #ffffff | #000000 |

3. **Selector**: en la barra de contexto, un botón de un toque (icono ☀ / ☾ / ●) que rota
   Día → Noche → Rojo → Auto. En Aquí → Ajustes, la misma elección como cuatro chips, y un
   interruptor "De noche usar Rojo" (solo afecta a Auto). Persistido en `hn.settings.theme`
   (`"day" | "night" | "red" | "auto"`) y `hn.settings.redAtNight`.
4. **Auto**: con `sunTimes` (ya existe) sobre la posición actual (sin posición: 40 N, 0 E) y la
   hora: entre salida y puesta del sol → Día; si no → Noche, o Rojo si `redAtNight`. Se reevalúa
   cada 5 min y al cambiar la posición. Por defecto: `auto`, `redAtNight = false`.
5. `<meta name="theme-color">` y el `background` de `html` siguen al tema (barra del sistema).
6. Prueba: los tres temas sin ningún color fuera de la tabla en la UI (inspección); en Día, texto
   principal con contraste ≥ 7:1 sobre el panel; en Rojo no hay ningún píxel blanco ni azul; Auto
   cambia a Noche al anochecer con una posición simulada.

7. npm test, build-web.sh, commit, push, PARÁ.
