ADELANTE

TAREA ÚNICA: BT1.2 — Contador de visitas no invasivo, armado para operar con
el dossier de sponsors (`sponsors/METRICAS.md`: la métrica del pitch).

Resumen (si hay duda, mandan los criterios de acá):
1. **Beacon en la app** (`web/src/ui/app.ts`): al arrancar, si y solo si
   `const ENLACE_METRICAS` (nuevo, en `web/src/core/enlaces.ts`) NO está
   vacío, mandar un `fetch(ENLACE_METRICAS, { method: "GET", mode: "cors" })`
   fire-and-forget, UNA sola vez por dispositivo/día (guardar stamp del día en
   localStorage con clave `"hn-beacon-dia"`, formato `YYYY-MM-DD`; si es otro
   día, reenviar). Sin parámetros, sin cabeceras raras, sin datos del usuario,
   sin cookies. Si falla la red, silencio absoluto (catch vacío). Con la
   constante vacía el código ES UN NO-OP (un if temprano devolviendo) — así
   queda dormido hasta que Diego configure el worker.
   - `web/src/core/enlaces.ts` queda con `ENLACE_METRICAS = ""` y comentario
     de una línea: la URL se completa cuando el worker esté deployado. Los
     tests de `enlaces.test.ts` NO deben exigir que no esté vacía (pero sí
     que, si no está vacía, sea https).
2. **Worker listo para deploy** (`metricas/worker.js`, carpeta nueva en la
   raíz del repo, fuera de web/): worker de Cloudflare mínimo — cuenta hits
   por día en KV (`METR_KV`), endpoint `GET /` → incrementa `d:<YYYY-MM-DD>`
   y `total`, responde una PNG de 1×1 transparente base64 (side-effect
   suave), `GET /stats` → JSON `{ dia, semana, total }` con un pool de los
   `d:<fecha>` de los últimos 7 días. Rate limit barato: cap de +1 por
   `request.headers.get("cf-connecting-ip")` por minuto en KV `m:<ip-hash>`
   (no guardar la IP: guardar solo sus primeros 8 chars hasheados). Sin
  ookies, sin userAgent, sin geolocalización. Debe ser standalone (sin
   wrangler en package.json del repo de web/ — en la carpeta metricas/ va su
   propio `wrangler.toml` de ejemplo NE ALTILLO y un README de 10 pasos para
   Diego con la cuenta gratis de Cloudflare).
3. **Test** (en `web/src/core/enlaces.test.ts` o uno nuevo
   `metricas.test.ts` a nivel logsic): la función de decisión
   (extraerla a `core/enlaces.ts` como `deberiaApitarBeacon(url, stampHoy,
   stampGuardado)`, lógica pura testable: devuelve false si url vacía, false
   si mismo día, true si día nuevo y url https).
4. **README de la carpeta metricas/**: los 10 pasos del deploy (Workers &
   Pages gratis, plan Free: 100k req/día, más que suficiente; KV gratis) +
   cómo leer `GET /stats` y pegar el número en `sponsors/METRICAS.md`.
   Explicito: hasta que Diego termine el deploy y pegue la URL en
   `ENLACE_METRICAS`, la app no manda nada (ni byte) a nadie.

Criterios:
- npm test (en web/) verde; bash scripts/build-web.sh OK.
- Grep: cero URLs de métricas hardcodeadas fuera de `enlaces.ts`; el beacon
  NO corre si la constante está vacía; ningún dato de usuario sale del
  dispositivo (sin userAgent, sin IP, sin fingerprinting; el stamp del día
  queda solo en localStorage local).
- Nada visible en la UI (sin aviso, sin "te contamos que...", sin settings
  nuevos).
- Sin cambios en docs/, queue/, sponsors/ (el deploy lo hace Diego; vos solo
  dejás armados el código, el worker y la guía).

Commit "contador no invasivo: beacon local opt-in + worker listo pa deploy",
push.

Status: ready
