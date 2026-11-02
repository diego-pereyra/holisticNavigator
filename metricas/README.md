# Contador de visitas (BT1.2)

Worker mínimo para Cloudflare que cuenta visitas **anónimas** a la app: un GET
por dispositivo y día, sin IP, sin userAgent, sin cookies y sin nada visible en
la interfaz. La app solo lo llama si `ENLACE_METRICAS` (en
`web/src/core/enlaces.ts`) tiene una URL.

> Hasta que termines el deploy y pegues la URL en `ENLACE_METRICAS`, la app no
> manda **ni un byte** a nadie: la constante está vacía y el código es un no-op.

## Deploy en 10 pasos (plan Free de Cloudflare)

1. Creá una cuenta gratis en <https://dash.cloudflare.com/sign-up> (no pide
   tarjeta). Workers & Pages Free alcanza de sobra: 100.000 requests por día.
2. Desde esta carpeta (`metricas/`) autenticate con `npx wrangler login` y
   aceptá el permiso en el navegador.
3. Creá el namespace KV:
   `npx wrangler kv namespace create METR_KV`
4. Copiá el `id` que devuelve el comando anterior y pegalo en
   `wrangler.toml`, en `kv_namespaces[0].id` (el archivo ya viene de ejemplo).
5. Desplegá el worker: `npx wrangler deploy`.
6. Copiá la URL que imprime el deploy, con la forma
   `https://hn-metricas.<tu-subdominio>.workers.dev`.
7. Probalo en el navegador: abrí esa URL (devuelve un PNG de 1×1 transparente)
   y después `.../stats` (devuelve `{"dia":1,"semana":1,"total":1}`).
8. Pegá la URL base en `web/src/core/enlaces.ts`:
   `export const ENLACE_METRICAS = "https://hn-metricas.<tu-subdominio>.workers.dev";`
   (sin barra final).
9. Rebuild y publicá la web como siempre (`bash scripts/build-web.sh` y el
   deploy de Pages). A partir de ahí cada dispositivo manda un GET por día.
10. A la semana, abrí `.../stats` y copiá el número de `semana` (o `total`) en
    `sponsors/METRICAS.md`, en la fila que corresponda. No hace falta tocar el
    worker para leerlo.

## Qué devuelve `GET /stats`

```json
{ "dia": 12, "semana": 74, "total": 310 }
```

- `dia`: visitas únicas de hoy (UTC).
- `semana`: suma de los últimos 7 días (hoy incluido).
- `total`: acumulado histórico.

## Notas

- El rate limit es barato y aproximado: guarda `m:<8 chars del SHA-256 de la
  IP>` durante 60 segundos. La IP completa nunca se guarda.
- Las claves `d:<fecha>` expiran a los 8 días; `total` queda para siempre.
- KV es eventualmente consistente: con mucha concurrencia el número puede
  quedar corto por unos segundos. Para el pitch alcanza.
- No hay `package.json` acá a propósito: `npx wrangler` se usa suelto y no se
  agrega ninguna dependencia al repo.
