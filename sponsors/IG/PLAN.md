# IG PLAN - Cuenta Instagram holisticNavigator

**Cuenta:** A cargo de Diego (creación propia). El gestor produce paquetes listos para publicar.
**Modo de publicación:** **MANUAL** — Diego publica desde el celular con el paquete del gestor (~60 s). Hasta fase 2 (ver abajo). Sin credenciales de IG en el agente ni en el repo.
**Objetivo:** Mostrar casos de uso reales (planificación, optimización con viento, travesías Plata) sin vender. Dirigir a link en bio → app gratis.

## Línea de contenido
- **Por versión con feature visible:** 1 posteo (reel) mostrando el caso más vistoso
- **Por 2-3 arreglos chicos:** 1 reel acumulado
- **Promoción pura:** Solo cuando perfil >500 seguidores (y justifique tiempo)

## Enlaces del perfil
- **Bio (link en bio):** app gratis → https://diego-pereyra.github.io/holisticNavigator/
- **Segundo enlace (si la bio lo permite o en el destacado "Apoyar"):** https://ko-fi.com/holisticnavigator — aporte puntual + vitrina (ver `../ENLACES.md`). Si la bio admite un tercero o el destacado lo permite, sumar https://github.com/sponsors/diego-pereyra (recurrente). No usar otras URLs de donación.
- CTA estándar del pie: `link en bio → app gratis`. Si se menciona apoyo: `si te sirve, en la bio está cómo invitarme un café o sostenerlo todos los meses`.

## Calendario
| Fecha | Posteo | Estado | Notas |
|---|---|---|---|
| 2026-10-30 | 2026-10-30-optimizar (demo-07) | PREPARADO (falta publicar Diego) | Optimizar ruta Montevideo→Florianópolis, hoja colapsa, ruta completa visible, scroll waypoints. Paquete en `posteos/2026-10-30-optimizar/` |
| TBD (solo si el reel de demo-07 no rindió) | Post de **imagen simple** con el beat del post de Ko-fi | MATERIA PRIMA lista | No es reel: imagen + pie corto. Misma imagen 2:1 de `../KOFI/post-introduccion-1200x600.png` (beat de demo-07), recomponer a 1080×1350 (4:5) o 1080×1080 sin cortar el texto del card. Ver "Plan B" abajo |
| TBD | demo-06 (ruta propia + click derecho en mapa) | CANDIDATO PRÓXIMO | Siguiente candidato según instrucción |

## Plan B — post de imagen simple (si el reel no rindió)

**Por qué existe:** el post de introducción de Ko-fi ya tiene una imagen 2:1 con el beat de demo-07 (la misma toma que el reel). Si el reel de demo-07 no rinde, **no se gasta otra edición de video**: se publica un post de imagen con esa misma materia prima.

**Disparador (concreto):** a las **48 h** de publicado el reel de `2026-10-30-optimizar`, si tiene **<1.000 vistas** o **<5 % de interacción** (likes+guardados+compartidos / vistas) → se activa el Plan B. Si supera, no se publica (no se repite el mismo beat en dos formatos seguidos).

**Paquete a armar (gestor, ~10 min):**
- `imagen.jpg` — 1080×1350 (4:5) o 1080×1080 (1:1) a partir de `../KOFI/post-introduccion-1200x600.png`; **recomponer, no recortar a ciegas**: el texto del card tiene que quedar completo.
- `pie.txt` — caption corto (3–4 líneas) con el caso de demo-07 + CTA `link en bio → app gratis`. 3–5 hashtags, mismos que el reel.
- `ESTADO.md` — con `Origen: plan B (imagen del post de Ko-fi)` para no contarlo como posteo nuevo de versión.

**Regla de conteo:** el Plan B **no** cuenta como "1 posteo por versión" del calendario; es contenido de relleno entre versiones.

## Métricas perfil (actualizar con datos de Diego)
| Fecha | Seguidores | Alcance | Guardados/Compartidos | Notas |
|---|---|---|---|---|
| ____ | ____ | ____ | ____ | |

## Auto-posteo — FASE 2 (documentado, NO implementado)

**Estado:** solo documentación. Nada de código, nada de credenciales, nada de app review iniciada.
**Decisión de Diego (2026-10-30): NO se pasan credenciales de Instagram al agente ni al repo.**
El posting sigue **manual** (Diego desde el celular) hasta que se cumpla el disparador de abajo.
La llave nunca vive acá: si algún día se automatiza, el token queda fuera del repo y el agente no lo toca.

### Ruta técnica (para cuando toque)
1. **Cuenta IG** → pasar a **Perfil de creador/negocio** (Creator/Business). Requiere vincular a una Página de Facebook.
2. **App en Meta for Developers** (developers.facebook.com) → tipo "Business", agregar el producto **Instagram Graph API**.
3. **Token long-lived** de la app (60 días, **revocable** desde el panel) + Página FB vinculada. Nada embebido en el cliente ni en el repo.
4. **Permiso `instagram_content_publish`** (publicar) — se pide por **App Review**; suma `instagram_basic` y `pages_show_list` según el flujo. El review puede tardar semanas.
5. **Flujo de publicación:** crear *media container* (URL pública de la imagen/video + caption) → esperar el `status_code = FINISHED` → `POST /{ig-user-id}/media_publish`. Rate limits por cuenta (unas ~25 publicaciones/24 h) y límite de containers en paralelo.

### CUÁNDO se activa
- Disparador único: **2+ posteos por semana sostenidos** (2-3 semanas seguidas de calendario cumplido).
- No se activa por seguidores ni por "saldo": se activa cuando el cuello de botella pasa a ser el tiempo de Diego, no la falta de contenido.

### POR QUÉ NO ANTES
- El flujo manual con el paquete del gestor cuesta **~60 segundos por posteo** (abrir Instagram, elegir reel.mp4, elegir portada.jpg, pegar pie.txt, publicar).
- Montar la llave (cuenta business + app + App Review + token rotativo) cuesta horas de setup y mantenimiento, y el review puede tardar semanas.
- Con menos de 2 posteos/semana, **la llave no vale su setup**: automatizás un paso de 60 s con un sistema que hay que cuidar.
- Riesgo de seguridad: un token con `instagram_content_publish` en el repo o en el agente es una credencial de publicación en manos de terceros. No se asume ese riesgo por ahorrar un minuto.

### Criterio de origen (cuándo se revisa)
Revisar esta sección si: (a) se sostienen 2+ posteos/semana, o (b) el calendario empieza a atrasarse **por** el trabajo manual de publicar. Antes de eso, no se toca.
