# Guía: enviar productos a TikTok

En la página de publicaciones (**/redes/**) cada producto tiene un bloque **TikTok** con el botón **Enviar a TikTok**
(fotos como carrusel y, si tiene, el video). El envío llega a tu **bandeja de TikTok**: abres la notificación, tocas
**Sonidos → Recomendados** (TikTok propone sonidos en tendencia según tu contenido; la página también sugiere qué
buscar) y publicas. Queda anotado en la pestaña **publicaciones** de la hoja.

Por qué así: TikTok no permite que un programa ponga música ni que publique directo en una cuenta pública sin una
**auditoría** aparte; el envío a la bandeja sí se permite con la revisión básica de la app.

- **Mantén tu cuenta como personal/creador**: las cuentas de empresa de TikTok solo usan música «comercial», no las
  canciones virales.
- TikTok admite como máximo **5 envíos esperando** en tu bandeja: publícalos o descártalos antes de enviar más.
- El botón pide un segundo toque para confirmar y nunca envía dos veces lo mismo.

## Instalación (una vez)

### Paso 1. Crear la app en TikTok for Developers

1. Entra a **https://developers.tiktok.com** con la cuenta de TikTok de **S3D** → **Manage apps → Connect an app**.
2. Datos de la app:
   - Nombre: `S3D Publicaciones` · Ícono: `Escritorio\S3D\TIKTOK\tiktok-icono.png`
   - Categoría: *Business* (o *Utilities*)
   - Descripción: «Herramienta interna de S3D para enviar fotos y videos de nuestros productos a nuestra propia
     cuenta de TikTok.»
   - **Terms of Service URL**: `https://tygersolis.github.io/S3D-Catalogo/terminos/`
   - **Privacy Policy URL**: `https://tygersolis.github.io/S3D-Catalogo/privacidad/`
   - Plataforma: **Web** · Website URL: `https://tygersolis.github.io/S3D-Catalogo/`
3. **Add products**: **Login Kit** y **Content Posting API** (dentro de este, activa también **Direct Post**: se usa
   tras la auditoría, ver paso 6).
4. En **Login Kit → Redirect URI** pega la URL de tu Apps Script (la que termina en `/exec`).
5. En **Scopes** deben quedar `user.info.basic`, `video.upload` y `video.publish`.

### Paso 2. Verificar la web (para las fotos)

En la app: **URL properties → Add → URL prefix** → `https://tygersolis.github.io/S3D-Catalogo/redes/`.
TikTok te dará un **archivo o código de verificación**: envíamelo, lo publico en la web y luego pulsas **Verify**.
(Los videos no necesitan este paso.)

### Paso 3. Programa en Google

1. Pega la versión nueva de `Redes.gs` y crea una **Nueva versión** de la implementación (Implementar → Gestionar
   implementaciones → lápiz → Nueva versión): esta vez sí hace falta, porque cambió la parte que recibe a TikTok.
2. Propiedades del script:

   | Propiedad | Valor |
   |---|---|
   | `TIKTOK_CLIENT_KEY` | *Client key* de la app (pestaña *App details* o *Sandbox*) |
   | `TIKTOK_CLIENT_SECRET` | *Client secret* de la app |
   | `URL_APP` | la URL de tu Apps Script que termina en `/exec` (la misma del paso 1.4) |

### Paso 4. Conectar tu cuenta (modo de prueba)

1. Mientras TikTok no apruebe la app, usa el **Sandbox**: en la app, **Sandbox → Target users → Add** tu cuenta de
   TikTok de S3D, y usa el *client key/secret* del sandbox en el paso 3.2.
2. En Apps Script ejecuta **conectarTikTok**: el registro muestra un enlace. Ábrelo con tu sesión de TikTok de S3D y
   acepta. Debe aparecer «Listo: TikTok quedó conectado».
3. Prueba **Enviar a TikTok** con un producto: te llega una notificación a la app de TikTok.

### Paso 5. Enviar a revisión

1. Graba un video corto de la pantalla (celular o computadora) mostrando: la página de publicaciones → **Enviar a
   TikTok** → la notificación en TikTok → la publicación en la bandeja.
2. En la app de TikTok for Developers → **Submit for review**, con el video y este texto (los revisores leen inglés):

   > S3D is a small 3D-printing shop in Lima, Peru. This internal tool lets the shop owner send photos and videos of
   > the shop's own products, taken from our product catalog website, to the shop's own TikTok account inbox
   > (video.upload). The owner then adds music in the TikTok app and publishes. Only the shop's own TikTok account
   > is connected; no other users sign in and no user data is collected.

3. Cuando TikTok la apruebe (suele tardar desde unos días hasta algunas semanas), cambia en las propiedades el
   *client key/secret* por los de producción y ejecuta **conectarTikTok** otra vez.

### Paso 6. Auditoría para publicar directo (100 % sin abrir TikTok)

Con la auditoría aprobada, cada producto tiene **Publicar directo en TikTok**: eliges quién puede verlo, si permites
comentarios (y dúo/stitch en videos), si es contenido comercial («Tu marca»), revisas el texto y pulsas **Publicar en
TikTok**: sale al momento, sin abrir la app, y las fotos llevan **música automática** que elige TikTok. TikTok exige
que elijas esas opciones en cada publicación (nada viene marcado de antemano), así que no se programa a una hora.

1. Mientras no hay auditoría, TikTok solo deja publicar directo en una **cuenta privada**: pon la cuenta de S3D en
   **privado** solo mientras grabas (Configuración → Privacidad → Cuenta privada) y vuelve a ponerla pública al terminar.
2. Abre la página de publicaciones con el panel encendido:
   `https://tygersolis.github.io/S3D-Catalogo/redes/?tiktok-directo`
3. Graba la pantalla mostrando, en un producto: **Publicar directo en TikTok** → tu cuenta → elegir **Solo yo** →
   casillas → contenido comercial → editar el texto → la frase de la Confirmación de uso de música → **Publicar en
   TikTok** → el aviso de que tarda unos minutos → la publicación en tu perfil de TikTok.
4. En TikTok for Developers → Content Posting API → **Direct Post → solicitar la auditoría**, con el video y este texto:

   > S3D's internal tool posts photos and videos of the shop's own products to the shop's own TikTok account. Before
   > every post the page shows the creator's nickname (creator_info), the user picks the privacy level from the
   > returned options (no default), interaction toggles (comment, duet, stitch) are off by default and greyed out when
   > disabled in the creator's settings, the commercial content disclosure follows TikTok's rules (Your Brand /
   > Branded Content labels, branded content cannot be private), the caption is editable, the Music Usage
   > Confirmation (and Branded Content Policy when applicable) is shown before the Publish button, and the user is
   > told that processing can take a few minutes. Photo posts use auto_add_music. No watermarks are added.

5. Cuando TikTok apruebe la auditoría, avísame: enciendo el panel para siempre (`config.json` → `redes.tiktokDirecto`).

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| «TikTok no está conectado» / «el permiso de TikTok venció» | Ejecuta **conectarTikTok** (paso 4.2). El permiso se renueva solo; vence si pasan 180 días sin usarlo (el informe de los lunes lo mantiene vivo). |
| «TikTok aún no verificó que la web es tuya» | Paso 2. |
| «tienes 5 envíos esperando en tu bandeja» | Publica o descarta los envíos pendientes en TikTok. |
| «actualiza la app de TikTok» | Actualiza TikTok en tu celular. |
| «falta el permiso video.upload» | Revisa los *Scopes* del paso 1.5 y conecta otra vez. Si TikTok rechaza `video.publish` al conectar (aún no aprobado), agrega la propiedad `TIKTOK_ALCANCES` = `user.info.basic,video.upload`. |
| «la publicación directa necesita la auditoría de TikTok» | Usa «Enviar a TikTok» hasta que aprueben el paso 6. |
