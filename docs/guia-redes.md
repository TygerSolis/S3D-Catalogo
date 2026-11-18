# Guía: publicar en Facebook e Instagram con un botón

La página interna **https://tygersolis.github.io/S3D-Catalogo/redes/** tiene, en cada producto:

- **Publicar ahora**: lo publica en ese momento en tu página de Facebook y en tu Instagram (fotos en una sola
  publicación / carrusel). Pide un segundo toque para confirmar.
- **Aprobar**: lo deja en espera y sale solo en el próximo horario libre (**11:00 y 19:00**, hora de Lima; un producto
  por horario). «Quitar de la programación» lo cancela.
- En los productos con video, un bloque aparte para publicar el video como **Reel**.
- **Marketplace** sigue siendo a mano (Meta no permite publicar ahí con un programa): copia los textos y las fotos.

Cada publicación queda anotada en la pestaña **publicaciones** de la hoja del catálogo (fecha, producto, red, enlace o
error). Si una red falla, «Publicar ahora» solo completa la que falló: nunca se publica dos veces lo mismo.

## Cómo funciona (y por qué es seguro)

```
Tu celular (/redes/) ──tu clave──► Apps Script (tu cuenta de Google) ──permiso de la página──► Facebook / Instagram
```

- El **permiso de publicación** de Meta se guarda solo en el Apps Script (propiedades del script), nunca en la web.
- El Apps Script solo obedece si recibe **tu clave**; tras 10 claves erradas en una hora se bloquea una hora.
- Publica únicamente los textos y fotos de la **web principal** (`redes/publicaciones.json`): nadie puede mandarle otro
  contenido. Por eso un producto nuevo de la cola solo se puede publicar después de tu «aprobado».

## Instalación (una sola vez, ~30 minutos)

### Paso 1. Tus cuentas

Tu Instagram debe ser **profesional** (Empresa o Creador) y estar **vinculado a la página de Facebook** de S3D
(Instagram → Editar perfil → Página). Ya lo confirmaste.

### Paso 2. Crear la app de Meta (solo la usarás tú)

1. Entra a **https://developers.facebook.com** con tu Facebook (el que administra la página). Si te lo pide, regístrate
   como desarrollador (gratis; confirma tu correo o teléfono).
2. **Mis apps → Crear app**. Nombre: `S3D Publicaciones`. Correo de contacto: el tuyo.
3. En **casos de uso**, marca:
   - **Administrar todo en tu página** (*Manage everything on your Page*);
   - **Administrar mensajes y contenido en Instagram** (*Manage messaging and content on Instagram*). Si pregunta
     cómo, elige **API con inicio de sesión con Facebook** (*with Facebook Login*).
4. Portafolio comercial: el de S3D si tienes uno; si no, «No quiero conectar un portafolio por ahora». **Crear app**.
5. En el **Panel** de la app, abre cada caso de uso → **Personalizar** y añade estos permisos (botón *Agregar*):
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`, `instagram_basic`,
   `instagram_content_publish` y, si aparece, `publish_video`.
6. La app queda en **modo desarrollo**: está bien. Como eres el administrador, funciona con tu página y tu Instagram
   sin la revisión de Meta.
7. **Configuración de la app → Básica**: deja abierta esta pantalla; necesitarás el **Identificador de la app** y la
   **Clave secreta de la app** (botón *Mostrar*).

### Paso 3. Instalar el programa y conectar el permiso

1. Abre la **hoja del catálogo** → menú **Extensiones → Apps Script**. Si ya hay código, crea un archivo nuevo
   (**+ → Secuencia de comandos**) llamado `Redes`; si está vacío, usa `Código.gs`. Pega todo el contenido de
   [`scripts/apps-script/Redes.gs`](../scripts/apps-script/Redes.gs) y guarda (disquete).
2. **Configuración del proyecto** (engranaje, a la izquierda):
   - **Zona horaria**: `(GMT-05:00) Lima`.
   - **Propiedades del script → Agregar propiedad**: `APP_ID` = Identificador de la app, `APP_SECRET` = Clave secreta.
3. Vuelve al editor, elige la función **generarClave** y pulsa **Ejecutar**. Google pedirá permisos («Revisar permisos»
   → tu cuenta → *Configuración avanzada* → *Ir a … (no seguro)* → **Permitir**; es tu propio programa). En el
   **Registro de ejecución** aparece **tu clave**: cópiala y guárdala (la escribirás en tu celular en el paso 5).
4. Abre el **Explorador de la Graph API**: https://developers.facebook.com/tools/explorer
   - Arriba a la derecha, en **App de Meta**, elige `S3D Publicaciones`.
   - En **Usuario o página**, elige **Token de usuario** (*Get User Access Token*).
   - En **Permisos**, añade los mismos del paso 2.5.
   - Pulsa **Generate Access Token**. En la ventana de Facebook, **marca tu página de S3D y tu Instagram** y acepta.
   - Copia el **token** (el texto largo de arriba).
5. En Apps Script → Configuración del proyecto → Propiedades del script, añade `TOKEN_TEMPORAL` = ese token.
6. En el editor, ejecuta **guardarPermiso**. El registro debe decir `Listo: página «…» e Instagram @…`.
   Ese permiso **no vence** (deja de valer si cambias la contraseña de Facebook o quitas la app: entonces repite 4–6).
7. Ejecuta **probarConexion**: muestra el nombre de tu página y tu Instagram, sin publicar nada.

### Paso 4. Horarios y publicación del programa

1. Ejecuta **instalar**: crea la pestaña **publicaciones** y los horarios de las 11:00 y 19:00.
2. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Descripción: `Publicar en redes`
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario** (igual se necesita tu clave para hacer algo)
   Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
3. **Envíame esa URL.** La pongo en `config.json` y aparecen los botones en la página.

### Paso 5. Tu celular

Abre **/redes/**, escribe tu clave en **Publicación automática → Tu clave** y pulsa **Guardar**. Queda guardada en ese
celular (repite en cada dispositivo que uses). La primera publicación real la hacemos juntos con un producto que elijas.

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| «el permiso de Meta venció o fue revocado» | Repite el paso 3, puntos 4 a 6. |
| «falta un permiso en la app de Meta» | Revisa los permisos del paso 2.5 y genera el token otra vez (paso 3.4–3.6). |
| «Meta no pudo descargar la foto o el video» | La web aún no tiene ese producto publicado; espera unos minutos tras el «aprobado». |
| «no está en la cola de la web principal» | El producto todavía no pasó a la web principal. |
| «Meta pide esperar» | Demasiadas publicaciones seguidas: espera una hora. |
| Una publicación programada falló | Te llega un correo a ventas.s3d@gmail.com; usa «Publicar ahora» para reintentar. |

## Si cambias el programa

Tras pegar una versión nueva de `Redes.gs`: **Implementar → Gestionar implementaciones → editar (lápiz) →
Versión: Nueva versión → Implementar** (así la URL no cambia).
