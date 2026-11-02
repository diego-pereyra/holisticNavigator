// BT1.2 — contador de visitas no invasivo (Cloudflare Worker + KV).
//
// GET /        incrementa d:<YYYY-MM-DD> y total; responde un PNG 1×1
//              transparente (side-effect suave, sin cuerpo útil para el usuario).
// GET /stats   responde { dia, semana, total } con los últimos 7 días.
//
// Privacidad: no se guardan IPs (solo 8 chars de su SHA-256 por 60 s para el
// rate limit), ni userAgent, ni cookies, ni geolocalización.

const PNG_1X1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
  (c) => c.charCodeAt(0),
);

const CORS = { "Access-Control-Allow-Origin": "*" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return json({ error: "método no permitido" }, 405);
    if (url.pathname === "/stats") return stats(env);
    if (url.pathname === "/") return hit(request, env);
    return new Response("No encontrado", { status: 404, headers: CORS });
  },
};

async function hit(request, env) {
  try {
    const ip = request.headers.get("cf-connecting-ip") ?? "";
    const hash = ip ? await hashIp(ip) : "";
    if (hash) {
      const limitKey = `m:${hash}`;
      if (await env.METR_KV.get(limitKey)) return png();
      await env.METR_KV.put(limitKey, "1", { expirationTtl: 60 });
    }

    const dia = hoyUtc();
    await Promise.all([bump(env, `d:${dia}`, 8 * 86400), bump(env, "total")]);
  } catch {
    // Si KV falla igual devolvemos el pixel: el visitante no se entera.
  }
  return png();
}

async function stats(env) {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);

  let dia = 0;
  let semana = 0;
  for (let i = 0; i < 7; i += 1) {
    const fecha = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
    const n = Number(await env.METR_KV.get(`d:${fecha}`)) || 0;
    if (i === 0) dia = n;
    semana += n;
  }
  const total = Number(await env.METR_KV.get("total")) || 0;
  return json({ dia, semana, total });
}

async function bump(env, key, expirationTtl) {
  const n = Number(await env.METR_KV.get(key)) || 0;
  const opts = expirationTtl ? { expirationTtl } : undefined;
  await env.METR_KV.put(key, String(n + 1), opts);
}

async function hashIp(ip) {
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

function hoyUtc() {
  return new Date().toISOString().slice(0, 10);
}

function png() {
  return new Response(PNG_1X1, {
    headers: {
      ...CORS,
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
