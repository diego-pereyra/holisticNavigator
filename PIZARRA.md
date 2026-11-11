# PIZARRA — quién es quién, cómo se hace cada cosa, y dónde quedó la obra

> Anuncio para el equipo de agentes del repo `holisticNavigator`.
> Regla de oro: **a cada agente se le pasa DENTRO del prompt todo lo que
> necesita** (rutas de archivos, texto del pie, coordenadas, qué escribir y
> dónde). "Probá mirar en el repo" NO es un prompt: cada agente arranca sin
> memoria de esta sesión.
> Si te reiniciaron y no sabés por dónde seguir: leé "Estado de la obra"
> al final y seguí desde ahí. No empieces de nuevo.

## Los cuatro puestos

| Agente | Gafete | Arma | Cuando usarlo | Qué se le pasa en el prompt (todo, a mano) |
|---|---|---|---|---|
| **Yo (implementador)** | terminal + agentes + vibe tools | TODO el pipeline: specs a casos.json, disparar GitHub Actions, publicar en IG, commitear, armar paquetes, hablar con Diego | el pedido de Diego + archivos concretos + estado de las otras tareas pendientes |
| **Big Pickle** | arquitecto | docs/ y cola de tareas (SEMAFORO) | cuando algo tiene que quedar ESPECIFICADO: features nuevas, reglas, tareas W | el pedido de Diego en sus palabras + archivos de contexto (docs/04-backlog-ux.md, código relacionado) + instrucción EXACTA de qué archivo escribir y qué no tocar |
| **Demo Eval** | vigía de demos | modelo multimodal (ve imágenes) | validar VISUALMENTE lo grabado: frames del reel, si el texto se lee, si el tema es Día, si el punto costero aparece | archivos de frame (.png) + criterios de aceptación (qué tiene que verse y qué no) |
| **Sponsor Gestor** | encargado de redes | terminal + dossier sponsors/IG/ | publicar en IG, escribir pies, armar paquetes de posteos, análisis de métricas | dossier (PLAN.md, pie activo, directiva velero ⛵), rutas de videos/pies/cookies DENTRO del workspace, y el comando exacto a correr |

## Semáforo — el motor del flujo

`SEMAFORO.md` es el único que decide qué hacemos ahora.

| Estado | Acción |
|---|---|
| `ESPERAR` | No hay tarea activa. El hook del arquitecto carga la siguiente de `queue/` cuando escribo `Status:done` y hago commit+push. |
| `ADELANTE` + tarea | Ejecuto exactamente esa tarea. Al terminar: `npm test` (en `web/`), `bash scripts/build-web.sh`, commit, `git push origin main`, **`Status:done` como última línea de `SEMAFORO.md`** (mismo commit). El hook detecta el done, cierra y carga la siguiente. |

**Para delegar features al arquitecto:** spec en `queue/`, tarea en `SEMAFORO.md`, `Status:done`, commit+push. El hook hace el resto.
**Para ejecutar agentes directo:** `source scripts/env.sh && opencode run --agent <nombre> "<prompt completo>"` desde la raíz del repo.

## CÓMO SE GRABAN LOS VIDEOS (leelo dos veces)

**Los videos los graba GitHub Actions, no yo.** Pipeline completo:

1. Los casos de grabación viven en `web/demo/casos.json` (viewport y acciones
   de cada video). **Viewport tiene que ser 432×768** = 9:16 exacto para IG
   (390×844 sale más alto que 9:16 y arruina el reel).
2. Commit + push de cualquier cosa en `web/demo/**` dispara `.github/workflows/demo.yml`
   (~10-15 min): build → teselas → serve local con Range → graba con Playwright →
   recorta esperas de descarga → convierte a MP4 → sube a la release **demo-latest**.
3. Bajar los MP4 de
   `https://github.com/diego-pereyra/holisticNavigator/releases/download/demo-latest/demo-XX-<id>.mp4`
4. Escalar a 1080×1920: `ffmpeg -i in.mp4 -vf scale=1080:1920:flags=lanczos,unsharp=5:5:0.4 -pix_fmt yuv420p out.mp4`
5. Publicar (abajo).

**Nunca grabar videos local a mano** (salvo debug puntual autorizado por Diego):
GitHub los graba en ubuntu-latest con browser real; en WSL no hay browser real.

## CÓMO SE PUBLICA EN INSTAGRAM

Script parametrizado: `publicar-reels.cjs` (basado en la receta v5 probada):

```
node publicar-reels.cjs <video.mp4> <pie.txt> [cookies.json]
```

- Cookies de sesión: `sponsors/IG/posteos/<paquete>/ig-cookies.json` (copiadas
  de `/tmp/ig-cookies.json` tras login manual de Diego). **Nunca commitearlas**
  (están en `.gitignore`).
- Receta crítica (por qué murió v1-v3): popup "OK" tras elegir Post → **paso
  Crop: elegir "Original"** (si no, IG recorta a 1:1) → Next ×2 → pie con
  `keyboard.insertText` (preserva emoji/tildes) → Share → esperar ~180s.
- Tras Share, IG tarda ~2 min en terminar de procesar: no cerrar el browser antes.

## Limitaciones de los agentes (aprendidas el 2026-11-10, a los ponchazos)

1. **Los agentes NO acceden a `/tmp`**: el sandbox rechaza `external_directory`
   automáticamente. Todo lo que un agente necesita (videos, pies, cookies,
   scripts) va DENTRO del workspace, con rutas absolutas o relativas al repo.
2. **La salida del CLI se corta** (~1200-5000 chars): pedirle al agente que
   escriba el archivo PRIMERO y devuelva un resumen corto (≤20 líneas).
3. **Timeout 5-10 min por corrida**: si muere a mitad, partir el pedido en dos.
4. La herramienta browser solo la uso YO (sesión IG de Diego). Los agentes
   publican corriendo `publicar-reels.cjs` con bash, no navegando.

## Reglas para pasar información

1. **Los pies los escribe Sponsor Gestor, no yo a mano**: pie.txt con directiva
   ⛵ velero + CTA "link en bio → app gratis". Yo armo el paquete, él el texto.
2. **Los casos de grabación los especifica Big Pickle** en
   `web/demo/casos[-reels].json` cuando hay que mostrar features nuevas; yo
   solo ejecuto el pipeline.
3. **Los screenshots no se muestran directo: se los pasa a Demo Eval** con
   criterios ("se ve toda la pantalla", "tema Día activo", "no hay bordes
   negros").
4. Cuando un agente falla: lo termino yo a mano y anoto la causa acá como
   regla si puede repetirse.

## Estado de la obra (la actualiza SIEMPRE el implementador)

- **2026-11-10 (cierre del día):**
  - **3 reels NUEVOS publicados y verificados en el perfil:**
    - Optimizar (punto costero, tema día): https://www.instagram.com/reel/DfkrA1vNVUc/
    - Rutas del libro (Cornell): https://www.instagram.com/reel/DfkpIhLMJ13/
    - Recomendaciones (Consejo): https://www.instagram.com/reel/DfkreczMWNq/
    - Pipeline usado: casos.json (432×768) → GitHub Actions `demo` → release
      demo-latest → ffmpeg 1080×1920 → Demo Eval (frames) → sponsor-gestor
      publica con `publicar-reels.cjs` → yo verifico con `verificar-reels.cjs`.
  - **LECCIÓN: la 1ª subida a veces queda en spinner "Sharing"** (a los 180s del
    Share) y NO llega al perfil: verificar siempre con `verificar-reels.cjs` y
    re-publicar los que falten. Hoy pasó con 07 y 10.
  - Reel v4 `DfkOP2RvEGs` vivo hasta el VEREDICTO 48h (~2026-11-11 17:00, cron
    cada 4h con `monitoreo-reel.cjs`); después BORRARLO (duplica al nuevo
    optimizar). Cron sigue apuntando a v4 hasta entonces.
  - Features delegadas al arquitecto vía `queue/` (commits 49c6133, a4fc0ef):
    simulación en el tiempo (contador de días + polares + posición del barco) y
    preferencia costera (peso a rumbos cerca de la costa). El hook del
    arquitecto las tomó con `Status:done` prematuro SIN implementarlas; Diego
    ordenó "continúa con las tareas pendientes" y se implementaron a mano
    (commit f928171):
    - **Preferencia costera**: `landmask.coastDistanceNm()`; en `IsoConfig`
      `coastNearNm/coastFarNm/coastPenaltyMin`; presets `COASTAL_WEIGHTS`
      (baja 20 / media 45 / alta 90 min por paso de 3 h, libre hasta 40 nm,
      tope a 300 nm); chip "Costera" + peso en el panel del optimizador,
      persistido en `settings.coastalBias`.
    - **Simulación día a día**: core puro `routing/sim-days.ts`
      (`optTrack`, `positionAt`, `distanceBetween`, `simulateDays`) sobre los
      `etaMs` del optimizador; botón "Simular día a día" con slider, autoplay
      1,1 s/día, "Día X de N · nm · kn · rumbo · viento", posición simulada
      (#FF8F00) y barco en el mapa. No confundir con "Recorrer" (6 kn fijos).
    - 13 tests nuevos; `npm test` 257/257 y build OK.
- Pendientes de Diego: deploy del worker de métricas (`npx wrangler deploy`
  en metricas/ → URL a `web/src/core/enlaces.ts:8`), Ko-fi $1 de prueba,
  tiers GitHub Sponsors, Mercado Pago UY.
- v1/v2/v3 borrados (crop cuadrado). Receta completa con el paso Crop:
  `sponsors/IG/CREAR-CUENTA.md`.
- 2026-11-11: el deploy de Pages de f928171/59eb58f falló en `deploy-pages`
  (el build y el smoke test pasaron; probable choque con el run cancelado por
  concurrencia). Se re-dispara con un push; verificar que el run quede en
  success y que la web muestre el chip "Costera".
