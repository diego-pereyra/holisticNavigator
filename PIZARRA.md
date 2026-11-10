# PIZARRA — ¿quién es quién y qué se le pasa a cada uno?

> Anuncio para el equipo de agentes del repo `holisticNavigator`.
> Regla de oro: **a cada agente se le pasa DENTRO del prompt todo lo que
> necesita** (rutas de archivos, texto del pie, coordenadas del reel, qué
> escribir y dónde). "Probá mirar en el repo" NO es un prompt: cada agente
> arranca sin memoria de esta sesión.

## Los cuatros puestos

| Agente | Gafete | Arma | Cuando usarlo | Qué se le pasa en el prompt (todo, a mano) |
|---|---|---|---|---|
| **Yo (consultor de acción)** | implementador | terminal + agentes + vibe tools | TODO el pipeline: escribir specs a casos.json, grabar reels, publicar en IG, commitear, armar paquetes, hablar con Diego | el pedido de Diego + archivos线上线下 concretos + transacciones de las otras tareas pendientes |
| **Big Pickle** | arquitecto | docs/ y cola de tareas (SEMAFORO) | cuando hace falta que algo quede ESPECIFICADO en docs/: features nuevas, reglas, tareas W | un resumen del pedido de Diego en sus palabras + los archivos de contexto (docs/04-backlog-ux.md, código relacionado) + instrucción EXACTA de qué archivo escribir y qué no tocar |
| **Demo Eval** | vigía de demos | modelo multimodal (ve imágenes) | validar VISUALMENTE lo que se graba: screenshots del reel, si el texto se lee, si el tema es Día, si el punto appears | archivos de frame (.png) + criterios de aceptación (qué tiene que verse y qué no) |
| **Sponsor Gestor** | encargado de redes | modelo multimodal + dossier sponsors/IG/ | escribir pies, armar paquetes de posteos (ESTADO.md, pie.txt), plan de contenido, análisis de métricas | dossier de siempre (PLAN.md, pie activo y directiva velero ⛵), fechas, y el resumen visual del reel |

## Semáforo — el motor del flujo

`SEMAFORO.md` es el único que decide qué hacemos ahora.

| Estado | Acción |
|---|---|
| `ESPERAR` | No hay tarea activa. El hook del arquitecto carga la siguiente de `queue/` cuando escribo `Status:done` y hago commit+push. |
| `ADELANTE` + tarea | Ejecuto exactamente esa tarea, paso a paso. Al terminar: `npm test` (en `web/`), `bash scripts/build-web.sh`, commit con el nombre de la tarea, `git push origin main`, **escribo `Status:done` como última línea de `SEMAFORO.md`** (puede ir en el mismo commit). El hook detecta el done, cierra la tarea y carga la siguiente de `queue/`. |

**Para disparar a Big Pickle (o cualquier agente del arquitecto):** escribo la spec en `queue/`, escribo `Status:done` en `SEMAFORO.md`, commit+push — el hook carga la tarea y me avisa. NO uso `opencode run --agent big-pickle` directo salvo que Diego me lo pida explícitamente en sesión directa (como hoy).

## Cómo se llama a la gente (recetas probadas)

- CLI: `opencode run --agent <agenda> "<prompt completo>"` desde
  `/home/diego/workspace/holisticNavigator` con `source scripts/env.sh`.
- NOTA hace falta: la salida del CLI se CORRÓ a ~1200-5000 chars: si el
  agente tiene que escribir un archivo largo, pedile que escriba el archivo
  PRIMERO y que el resumen final sea corto (≤20 líneas).
- Timeout por corrida: entre 5 y 10 min. Si muere a mitad de exploración
  (esto pasa): partir el pedido en dos, la mitad specs primero.
- Le herramienta browser NO se le entrega a los agentes: solo "yo" la usa
  (sesión de IG de Diego, cookies en `/tmp/ig-cookies.json`).

## Reglas para pasar información (por qué existel)

1. **Los pies del reel los escribe Sponsor Gestor, no yo a mano**: pie.txt
   con directiva ⛵ velero + CTA "link en bio → app gratis". Yo armel el
   paquete, él el texto.
2. **Los casos de grabación los escribe Big Pickle en specs** (web/demo/casos
   [-reels].json): demanda su trabajo concreto para features / momientos que
   no existen todavía — así el implementador solo ejecuta.
3. **Los screenshots NO se muestran al usuario directo: se los cuenta Demo
   Eval** con criterios ("se ve toda la pantalla", "se encuadran los dos
   clubes", "no hay bordes negros"). El que ve el reel final soy yo.
4. Cuando alguien muere o falla: el implementador termina a mano y nota el
   hecho en la PIZARRA (acá) como regla extra si se repite.

## Estado de la obra (corta, la actualiza DONT siempre)

- 2026-11-09: reel estreno v3 en 9:16 sin crop (Dfin9xxPArA) ✅. Receta
  completa en `sponsors/IG/CREAR-CUENTA.md`.
- Cola de reels: rutas del libro · recomendaciones · viaje en el tiempo
  (aunque el último lo esté contraFeat confidencias de producto). Specs de
  Big Pickle en camino, en `web/demo/casos-reels.json`.
