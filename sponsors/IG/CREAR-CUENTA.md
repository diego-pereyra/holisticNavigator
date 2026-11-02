# Crear la cuenta IG del proyecto — @holisticnavigator.app

> Resuelto 2026-11-02: el handle quedó en **@holisticnavigator.app**
> (`@holisticnavigator` estaba tomado). Alternativas descartadas:
> `holistic.navigator`, `holisticnavigator_uy`.
> Cuenta tipo: **profesional/creatura** (obligatorio para postear videos
> desde la web desktop, donde el gestor ejecuta).

## Lo único que hace Diego (~5 min)

Se hace desde el **celular** (IG exige SMS real; el resto lo puedo llevar yo
después desde la desktop).

1. Descargar/abrir Instagram en el celu (app) → **Crear cuenta nueva**.
   - Si IG no deja tener dos cuentas en la misma sesión: igual se puede,
     IG admite múltiples cuentas por perfil de app (ícono de perfil →
     nombre → **Agregar cuenta** → **Crear cuenta nueva**).
2. Datos a cargar:
   - **Mail:** el de Diego que no sea el de trabajo (o el mismo si no le
     molesta; sugerencia: crear un alias simple tipo
     `holisticnavigator.app@gmail.com` para que el proyecto tenga mail
     propio — útil después para Ko-fi/Sponsors/pitch).
   - **Contraseña:** NUEVA, distinta de las otras. **No compartirla con
     nadie por chat**; cargarla en el cofre de credenciales de
     vibebrowser (Settings → vault) si querés que el agente pueda loguear.
   - **Nombre de usuario:** `holisticnavigator`
   - **Nombre:** `holisticNavigator`
3. Verificar el SMS. Listo lo engorroso.
4. **Pasar a cuenta profesional:** Perfil → Menú (☰) → **Configuración y
   privacidad** → **Tipo de cuenta** → **Cambiar a cuenta profesional** →
   categoría: *Aplicación / Software* (o *Deportes acuáticos* si conviene
   más; queda indiferente para posting).
5. Avisar "cuenta lista" en el chat.

## Lo que hace el gestor apenas exista (sin que Diego termine de configurar)

- Cargar el cofre de credenciales con las claves nuevas (vía Settings de
  vibebrowser; nunca en archivos). **Pendiente**: el vault de vibebrowser
  no está activado aún.
- Login en el browser de Diego, completar perfil:
  - **Bio (cargada y guardada ✅):** `Planificá tu travesía a vela: carta,
    waypoints, clima y la mejor ruta según el viento. 🌊 App web gratis,
    sin registro. Link 👇` (127/150)
  - **Avatar ✅:** logo del repo dibujado 1:1 con PIL (`web/public/icon.svg`
    → PNG 1024 → JPEG 512 → PNG-8 320, 5 KB) y subido exitosamente
    2026-11-02 (medio Meta `18157663945489967`).
  - **Sitio web ❌:** IG web lo bloquea ("Solo puedes editar tus enlaces en
    móviles"). **Lo tiene que cargar Diego desde la app del celu**:
    `https://diego-pereyra.github.io/holisticNavigator/` (~10 s). Sin eso,
    el `Link 👇` de la bio queda sin destino.
- **Follows iniciales (moderado, 10-15):** Yacht Club Uruguayo, Yacht Club
  Punta del Este, Club Náutico Carrasco, escuelas de vela UY (La Náutica,
  Vela Pinta?), marineros locales con swing en el feed. A mano, con
  criterio, sin patrones automáticos.
- Publicar el **primer paquete**: `sponsors/IG/posteos/2026-10-30-optimizar/`
  (reel listo, pie aprobado por HITL) — el estreno de la cuenta.
- Dejar registrado en `sponsors/IG/PLAN.md` la fecha de nacimiento de la
  cuenta y el roadmap de 30 días.

### Receta para subir archivos (avatar / reels) por DOM en IG web

La subida nativa por file chooser no se puede interceptar en el browser de
Diego. Receta verificada que sí funciona (2026-11-02, avatar):

1. Abrir la página en una **pestaña nueva controlada** (las pestañas que no
   abrió la sesión no se pueden scriptear: `tab not authorized`).
2. El `<input type=file>` viene oculto (`x1s85apg`, display:none): por DOM
   se le força `display:block; opacity:1; width/height/position/z-index`.
3. Snapshot a11y → el input aparece como botón con el aria-label puesto →
   `vibe_upload_file` directo a ese uid (CDP `setFileInputFiles`).
4. Para el avatar hubo que ir por el flujo con modal: click en "Cambiar
   foto" → se abre `div[role=dialog]` → hay OTRO input oculto adentro del
   diálogo → mismo truco de exponerlo → subir a ese → IG lo procesa sin
   pasar por el recorte (imagen square 320 ya lista).

Esta misma receta es la que se va a usar para subir el **reel.mp4** desde
"Nueva publicación" (el mp4 es más pesado: si el upload inline supera el
límite de la tool, plan B es alojar el archivo y descargarlo... a definir
en su momento).

## Estado real de la cuenta (2026-11-02)

- Cuenta creada: @holisticnavigator.app, **profesional (Panel visible)**,
  0 posts, 0 seguidores, 8 seguidos.
- Diego la creó con SMS desde el celu y se logueó desde desktop (sesión
  viva; el cofre de credenciales de vibebrowser sigue sin activar).
- Bio guardada, avatar subido. Falta: Sitio web (solo celu), nombre visible
  si hace falta, 2FA por app (recomendado, no urgente), follows iniciales
  y el reel de estreno.

## Notas de seguridad de cuenta

- Activar 2FA por app de autenticación (no SMS únicamente) apenas se cree.
- La cuenta nueva es "fria": IG limita acciones las primeras 1-2 semanas.
  Por eso: posting sí (1 por semana), follows ≤ 15/semana al principio,
  cero DMs masivos.
