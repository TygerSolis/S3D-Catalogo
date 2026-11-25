# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Catálogo web estático de **S3D** (impresión 3D, Perú), publicado en GitHub Pages:
https://tygersolis.github.io/S3D-Catalogo/. No hay servidor ni framework: HTML + JS sin empaquetador,
Tailwind compilado a un CSS estático y scripts Python/Node para generar páginas e imágenes.
El dueño habla español: código, comentarios, commits y documentación van en español.

## Comandos

```bash
npm ci && npx playwright install chromium      # una vez
npm test                                        # todas las pruebas (servidor propio + Chromium headless)
node tests/run.cjs tienda                       # un solo módulo (integridad, catalogo, visor, fichas, tienda,
                                                #   pedidos, buscador, analitica, navegacion, temporada, precios, redes, publicar, meta, seguridad)
python3 scripts/validar_productos.py            # valida productos.json (ids, slugs, precios, imágenes…)
python3 scripts/build_product_pages.py          # regenera páginas, sitemap, ItemList y datos de config.json
npm run build:css                               # recompila tailwind.css (luego subir ?v= en index.html)
node scripts/optimize_images.cjs                # genera AVIF/WebP en 4 tamaños desde fuentes/ (git-ignored)
python3 scripts/hoja_catalogo.py --help         # exportar/importar/faltantes/videos/limpiar (hoja ↔ JSON)
node scripts/redes_fotos.cjs [--catalogo]       # JPG 4:5 para redes / 1:1 para el catálogo de Meta (originales de fuentes/ o R2)
python3 scripts/mas_pedidos.py                  # «Lo más pedido»: trae del registro de pedidos los más pedidos → mas-pedidos.json
```

La CI (`pruebas.yml`) falla si los archivos generados o `tailwind.css` no están al día: tras tocar
`productos.json`, `config.json`, `scripts/chrome/*.html` o clases de Tailwind, ejecuta el generador /
`build:css` y haz commit del resultado.

## Arquitectura

- **Datos**: `productos.json` es la fuente del catálogo, pero **la hoja de Google manda**: el workflow
  `catalogo-desde-hoja.yml` (cada 30 min) importa el CSV de la hoja, trae fotos/videos nuevos de
  Cloudflare R2 (`fuentes/`), valida, borra medios sin uso, regenera y publica. Los cambios de datos se
  hacen en la hoja, no a mano en el JSON (se perderían). Campos y reglas: `docs/guia-catalogo.md`.
- **Generador** (`scripts/build_product_pages.py`): crea `producto/<slug>/index.html` (contenido visible sin
  JS + schema.org), `sitemap.xml`, `404.html`, `privacidad/index.html` y el bloque ItemList de `index.html`.
  Inserta la cabecera/pie/sprite/pagos compartidos desde `scripts/chrome/*.html` entre marcadores
  (`CHROME-TOP`, `CHROME-FOOTER`, `CHROME-PAGOS`, `ITEMLIST`): edita las plantillas, nunca las copias generadas.
  Se niega a generar si `validar_productos.py` encuentra errores.
- **`config.json`** es el único lugar del número de WhatsApp, la URL base y `pedidosUrl`; el generador los
  propaga a todas las páginas y a `tienda.js`. Una prueba falla si el número aparece escrito en otro sitio.
- **Temporada** (`config.json` → `temporada`: id, titulo, desde, hasta, categoria, aviso): el generador escribe
  las fechas en `<html data-temporada-…>` y carga `temporada.js` en `<head>` (sin defer), que pone
  `html.temporada-<id>` solo entre las fechas según el reloj del visitante (lo generado no depende del día).
  `.con-temporada` / `.sin-temporada` muestran u ocultan elementos; `catalogo.js` pone la categoría de temporada
  primero, la usa en el mosaico del hero y marca sus tarjetas; las fichas de esa categoría llevan `pp-temporada`.
- **JS del navegador** (scripts clásicos, sin módulos): `catalogo.js` (portada: carga JSON, filtros por
  `data-categoria`, buscador combobox, tarjetas, visor), `producto.js` (fichas y cotizador), `tienda.js`
  (Mi pedido y favoritos en localStorage, mensaje de WhatsApp, código de pedido `S3D-XXXXX` y registro por
  `sendBeacon` a `PEDIDOS_URL`), `chrome.js` (cabecera/pie), `analytics.js` (Umami sin cookies, eventos
  personalizados, `error_js`). Todo texto de datos se escapa antes de insertarlo en HTML.
- **Registro de pedidos**: Google Apps Script en `scripts/apps-script/Pedidos.gs` (se pega a mano en la hoja
  «Pedidos S3D»; ver `docs/guia-pedidos.md`). Si se cambia, hay que redesplegar como nueva versión.
- **Imágenes**: cada imagen existe como `.avif` + `.webp` en `assets/sm/` (800), `assets/md/` (1000),
  `assets/` (1600) y `assets/hd/` (original). Siempre se generan desde los originales; nunca recomprimir
  un webp/avif. Los originales viven en R2 (`fuentes/`), no en git. Videos en `assets/video/` (máx. 25 MB, sin recomprimir).
- **Seguridad (CSP)**: todas las páginas llevan la misma `<meta http-equiv="Content-Security-Policy">`, definida
  solo en `CSP` de `scripts/build_product_pages.py` (el generador la escribe también en `index.html`). Solo se
  ejecuta JS de archivos propios y de `cloud.umami.is`: **no uses `onclick`/`on…=`, `<script>` en línea,
  `javascript:` ni `eval`**; enlaza eventos con `addEventListener` (o atributos `data-*` + delegación, como
  `data-video`). Un servicio externo nuevo (fetch, iframe, imagen) necesita su origen en `CSP`; si no, el
  navegador lo bloquea. `tests/seguridad.cjs` lo comprueba y `util.cjs` registra cada bloqueo en `pagina.violaciones`.
- **Kit para redes** (`scripts/redes.py`, llamado por el generador): la cola sale de la columna `redes` de la hoja
  (número = turno; vacío = automático, de la `fechaAlta` más nueva a la más antigua; `no` = nunca; fuera ocultos y
  agotados; no depende del día) y genera `redes/index.html`, página interna (sin enlace desde el sitio, noindex, sin analítica) con
  fotos limpias, texto para Facebook (enlace con `utm_source=facebook`), Instagram (sin enlace), anuncio de
  Marketplace (sin enlaces) y respuesta para «¿Está disponible?» (`utm_source=marketplace`); `utm_campaign` es el id
  de la temporada o `catalogo`. Las fotos son `redes/fotos/<nombre>.jpg` 1080×1350 con la foto completa sobre la
  misma foto desenfocada (`scripts/redes_fotos.cjs`, desde los originales; si faltan, la página muestra «pendiente» y el
  generador lo avisa); las que salen de la cola se borran solas. Historias `redes/historias/<id>-<huella>.jpg` 1080×1920
  (foto + nombre + precio + WhatsApp en DejaVu Sans; la huella cambia con el texto), `redes_fotos.cjs --historias`.
  Marketplace: marca «ya publicado» en localStorage; los publicados en todo se ocultan.
- **Publicación automática** (`scripts/apps-script/Redes.gs`, vinculado a la hoja del catálogo; guía
  `docs/guia-redes.md`): la página /redes/ llama al Apps Script (`config.json` → `redes.publicarUrl`) con la clave del
  dueño (localStorage); el script lee `redes/publicaciones.json` de la web PRINCIPAL y publica con la Graph API de Meta
  (v27.0, token de página en propiedades del script): Facebook = fotos sin publicar + `/feed` con `attached_media`, o
  `/videos`; Instagram = foto/carrusel o `REELS` (espera `status_code` FINISHED). Anota cada red en la pestaña
  «publicaciones» (la última fila manda; nunca repite una red ya publicada). «Aprobar» = fila «programado»; los
  activadores de `instalar` publican uno a las 11:00 y otro a las 19:00 (Lima). Con las fotos van historias
  (`photo_stories` / `STORIES`); la columna `IdMeta` guarda el id de cada publicación. `informeSemanal` (lunes 8:00)
  reescribe la pestaña «resultados» (IG: reach, views, saved, shares, like_count, comments_count; FB:
  post_total_media_view_unique, post_media_view, reacciones, comentarios, compartidos) y manda un resumen; necesita
  `instagram_manage_insights`, `read_insights` y `pages_read_user_content` (`revisarPermisos` lista los que faltan con
  `debug_token`). Pruebas en `tests/publicar.cjs` (Google y Meta simulados con `vm`).
- **TikTok** (`Redes.gs`, guía `docs/guia-tiktok.md`): «Enviar a TikTok» manda fotos (`content/init`, `PULL_FROM_URL`,
  `MEDIA_UPLOAD`, requiere verificar el prefijo `…/redes/` en TikTok) o el video (`inbox/video/init`, `FILE_UPLOAD` en un
  trozo) a la bandeja del dueño, que elige la música y publica (sin auditoría de TikTok no se puede publicar directo en
  cuentas públicas ni poner música por API). OAuth: `conectarTikTok` → `doGet` con `code`/`state`; permiso de 2 h que
  se renueva con el de renovación (180 días, rota en cada uso; el informe de los lunes lo mantiene vivo). Fila
  `tiktok` = «enviado» (no cancela lo aprobado). La página sugiere el sonido por categoría. Publicación directa
  (`tiktok-info` = creator_info, `tiktok-publicar` = DIRECT_POST; fotos con `auto_add_music`) en un panel que cumple las
  Content Sharing Guidelines (cuenta visible, privacidad sin valor por defecto, interacciones y contenido comercial
  desmarcados, «contenido de marca» no admite «Solo yo», texto editable, aceptación de la música antes del botón);
  apagado hasta la auditoría (`config.json` → `redes.tiktokDirecto`; `?tiktok-directo` lo enciende para la demo).
  No se programa por horario (TikTok exige elegir las opciones en cada publicación). Pruebas en `tests/publicar.cjs`.
- **Términos y condiciones** (`pagina_terminos`, `/terminos/`, enlazada en el pie): los exige TikTok; base a revisar con
  asesoría legal (como la privacidad).
- **Seguridad de /redes/ y del Apps Script** (revisión del 23/11/2026): la clave del dueño vive solo en
  `sessionStorage` (localStorage lo comparten todas las webs de `tygersolis.github.io`, p. ej. VetFast, que carga JS de
  terceros sin versión fija); la página y `chrome.js` se ocultan si están dentro de un marco (clickjacking: GitHub Pages no
  permite `X-Frame-Options` ni `frame-ancestors` en `<meta>`); `MAX_FALLOS_CLAVE` = 200/hora (la clave es de 128 bits; un
  límite bajo dejaría al dueño fuera). La hoja del catálogo es «Lector» con el enlace (necesario para el CSV): sus
  editores podrían leer los permisos de Meta/TikTok del Apps Script vinculado. Recomendado a futuro: dominio propio.
- **Conversión (24/11/2026, D12)** — datos en `config.json` (`promesa.plazo`, `envios`, `rangosPrecio`, `metaPixel`), que el
  generador lleva a las páginas:
  - **Franja de confianza** (`bloque_promesa`): taller en Lima, plazo, envíos/recojo y Yape/Plin, bajo el hero de la portada
    (marca `CHROME-PROMESA`), bajo el precio de cada ficha y en la guía de regalos.
  - **Costos de envío** (`tabla_envios`): montos «desde» referenciales; en la portada `#envios` (marca `CHROME-ENVIOS`, dentro de
    «Cómo comprar») y desplegable en cada ficha. El recojo en el taller es gratis.
  - **Ficha**: dibujo SVG de tamaño junto a un celular de 15 cm (`dibujo_tamano`, desde el lado más largo en cm de «medida»;
    sin cm no sale); barra fija en el celular (`#pp-barra`, `producto.js`: visible mientras «Comprar por WhatsApp» no está
    a la vista; al pulsarla hace clic en ese botón, así conserva el código S3D y la analítica); «También te puede gustar»
    (misma categoría y, si faltan, precios parecidos) y «Vistos recientemente» (`localStorage` `s3d-vistos`, validado y
    pintado con textContent).
  - **Guía de regalos** `/regalos/` (`pagina_regalos`, en el sitemap): productos con precio agrupados por `rangosPrecio`
    según su precio más bajo; el catálogo tiene el mismo filtro (`#price-select`, opciones entre marcas `RANGOS`, parámetro
    `?precio=`). Destino pensado para anuncios.
  - **Píxel de Meta** (`analytics.js`; guía `docs/guia-anuncios.md`): `metaPixel` vacío = apagado (sin aviso ni orígenes de
    Facebook en la CSP). Con número: aviso de cookies y el píxel solo se carga tras «Aceptar» (`localStorage` `s3d-cookies`;
    «Preferencias de cookies» en el pie), nunca en `/vista-previa/` ni fuera de `tygersolis.github.io`; eventos PageView,
    ViewContent (`S3D-<id>`, como el catálogo de Meta), AddToCart, Lead, Contact y Search. La privacidad añade su sección
    solo con el píxel encendido.
    Píxel en uso: conjunto de datos «S3D web» `2186135135325502` (creado por el dueño el 24/11/2026, código manual, sin
    «coincidencias avanzadas automáticas» ni configuración automática de eventos).
  - **Correo diario de pendientes** (`Pedidos.gs` → `resumenDiario`, activador de `instalarResumen` a las 9:00 de Lima):
    pedidos en «Nuevo» con más de 24 h (lista de los últimos 7 días); sin pendientes no envía nada. Prueba en `tests/pedidos.cjs`.
- **Fase 2 de conversión (24/11/2026, D13)**:
  - **«Lo más pedido»**: `Pedidos.gs` → `doGet(?ver=mas-pedidos)` devuelve solo NOMBRES (pedidos distintos de 30 días,
    mínimo 2, todos los estados, máx. 12; caché 1 h). `scripts/mas_pedidos.py` (paso del workflow de la hoja) los pasa a
    ids en `mas-pedidos.json` (omite nombres repetidos como DUMMY; si el registro falla, deja el archivo). El generador
    (`leer_mas_pedidos`, `MAS_PEDIDOS`): etiqueta `pp-mas-pedido` en los 6 primeros, sección `#mas-pedidos` en la portada
    (marcas `MAS-PEDIDOS`, `data-ids` que `catalogo.js` usa para la etiqueta de las tarjetas) y primeros en la cola
    automática de redes (`redes.cola`). Vacía = sin sección ni etiquetas.
  - **Comentarios**: `Redes.gs` → `responderComentarios` (activador de `instalarComentarios`, cada 15 min) responde EN
    PÚBLICO (3 textos que rotan) a comentarios de ≤ 7 días con `PALABRAS_CLAVE`, salvo propios o ya respondidos por la
    cuenta; el privado lo manda la automatización de Meta Business Suite (sin API: mensajes a no-roles piden revisión de
    Meta). Permisos `pages_manage_engagement` e `instagram_manage_comments` (guía de redes, paso 7).
  - **Google Shopping** (`docs/guia-google.md`): `catalogo_meta.py` escribe también `google/productos.txt` (TSV, mismos
    artículos, `utm_source=google`, `identifier_exists=no`) SIN los productos con marcas/personajes ajenos
    (`config.json` → `google.excluirMarcas`; Google los suspende como falsificación). La verificación de
    `tygersolis.github.io` necesita un repo `TygerSolis.github.io` con el archivo de Google (pendiente del código).
  - **Reseñas**: `config.json` → `resenasGoogle` (`g.page/r/…/review`); `/resena/` (noindex, fuera del sitemap) redirige
    al formulario; enlace «Déjanos tu reseña» en el pie; textos `/gracias` y `/resena` en `docs/guia-whatsapp.md`.
- **Formas de pago** (`scripts/chrome/pagos.html` y el pie en `footer.html`): Yape y Plin con su logo oficial en
  `assets/pagos/` (96 px WebP; Yape = ícono de su app en el App Store, publicado por el BCP; Plin = ícono de plin.pe),
  servidos desde el sitio por la CSP; Transferencia y Efectivo con íconos del sprite.
- **Catálogo de Meta / WhatsApp** (`scripts/catalogo_meta.py`, llamado por el generador; guía `docs/guia-whatsapp.md`):
  `meta/catalogo.csv` (lista de datos programada en el Administrador de ventas, conectada al catálogo de WhatsApp
  Business): un artículo por producto activo con precio (sin «Cotizar»), una variante por color (`item_group_id`,
  precio del color), precio `145.00 PEN`, disponibilidad `in stock` (también «A pedido»: Meta marca `available for order` como «Incompleto» y WhatsApp lo oculta) u `out of stock`, enlace con
  `utm_source=meta`. Fotos `meta/fotos/<nombre>.jpg` 1080×1080 (`redes_fotos.cjs --catalogo`), con `?v=` porque Meta
  solo relee una foto si cambia su URL. `catalogo-desde-hoja.yml` genera las JPG que falten (redes y catálogo) sin
  fallar si falta un original. Pruebas en `tests/meta.cjs`.
- **Pruebas** (`tests/`): runner propio `run.cjs` + Playwright; `util.cjs` fija el reloj (la etiqueta
  «Nuevo» depende de `fechaAlta`), simula Umami y bloquea `script.google.com`. Cuentan productos desde los
  datos (`visibles()`), no con números fijos.

## Publicación y ramas

- `publicar.yml` despliega por GitHub Actions: `main` → raíz del sitio; `vista-previa` → `/vista-previa/`
  (solo si tiene commits que no están en `main`; con noindex, aviso visible, sin analítica ni registro de
  pedidos). Excluye del sitio `tests/`, `scripts/`, `docs/`, `config.json`, README y este archivo.
- Flujo del dueño: los cambios de código van a la rama `vista-previa`; el dueño los revisa en
  https://tygersolis.github.io/S3D-Catalogo/vista-previa/ y, cuando dice «aprobado», se hace fast-forward
  de `main`. Los cambios de infraestructura (workflows) van directo a `main`.
- Un push hecho con `GITHUB_TOKEN` no dispara otros workflows: por eso `catalogo-desde-hoja.yml` llama a
  `publicar.yml` como workflow reutilizable.

## Registro de decisiones e implementación

Decisiones del dueño (auditoría del 14/10/2026; documento «Auditoría full stack del catálogo S3D» en Claude Docs):

| # | Tema | Decisión |
|---|---|---|
| D1 | Almacenamiento de medios | Cloudflare R2 (bucket `s3d`) solo como respaldo y origen de originales (`fuentes/`); la web se sirve desde GitHub Pages. |
| D2 | Videos | No recomprimir: se publican tal cual (máx. 25 MB). Excepción (17/11/2026): un video en HEVC/H.265 se convierte a H.264 solo por compatibilidad con los navegadores; el original queda en R2. |
| D3 | Edición del catálogo | Google Sheets + GitHub Action (la hoja manda). |
| D4 | Campos nuevos | Solo `disponibilidad`, `activo` y `orden` (sin días de elaboración ni variantes con precio). Cambio (17/11/2026): un color puede tener precio propio (árboles navideños); los sets se publican como productos aparte. |
| D5 | Registro de pedidos | Apps Script + hoja «Pedidos S3D», aviso a ventas.s3d@gmail.com. |
| D6 | Revisión de cambios | Rama `vista-previa` publicada en `/vista-previa/`; pasa a `main` con «aprobado». |
| D7 | Dominio | Se mantiene `tygersolis.github.io/S3D-Catalogo` (sin dominio propio). |
| D8 | Colección navideña (17/11/2026) | Productos marcados con categoría `Navidad` en la hoja; ambientación moderada activa del 17/11/2026 al 06/01/2027 (sola por fechas). |
| D9 | Redes sociales (18/11/2026) | Kit para publicar cada producto en Marketplace (perfil personal, a mano: Meta no tiene API para vendedores), Facebook e Instagram; el dueño aprueba cada publicación; foto limpia (datos solo en el texto) y completa, con relleno de la misma foto desenfocada; orden: Navidad y luego los más vendidos (lista del dueño). Botones «Publicar ahora» y «Aprobar» (2 por día: 11:00 y 19:00); videos como Reel aparte; Instagram vinculado a la página de Facebook (confirmado). |
| D10 | WhatsApp Business (18/11/2026) | Mismo número de la web (+51 955 107 609) en WhatsApp Business en el celular del dueño; atención 24 h (sin mensaje de ausencia); perfil y respuestas rápidas a mano (la app no tiene API); catálogo desde un catálogo de Meta que se llena solo desde la web. |
| D11 | TikTok (21/11/2026) | Cuenta personal/creador (para usar música viral). Etapa 1: «Enviar a TikTok» a la bandeja (el dueño elige la música y publica). En paralelo, publicación directa «un toque por producto» con música automática en fotos, lista para la auditoría (demo con la cuenta de S3D en privado un rato). Página de términos creada. |
| D12 | Conversión antes de los anuncios (24/11/2026) | Tras comparar con tiendas 3D de Lima: franja de confianza («Listo en 24–48 h»), barra fija en el celular, envíos «desde» (recojo gratis S/ 0, Lima S/ 10, periferia/Callao S/ 15, provincias por Shalom o la agencia del cliente S/ 12, montos referenciales), guía de regalos (<30, 30–60, 60–100, >100) + filtro de precio, dibujo de tamaño, relacionados + vistos, píxel de Meta con aviso de cookies (el dueño lo eligió frente a «solo clic a WhatsApp») y correo diario de pedidos sin cerrar. Fase 2: «Lo más pedido» desde el registro de pedidos, respuestas automáticas a comentarios, Google Shopping, textos de WhatsApp y enlace de reseñas de Google. Fase 3: personalizador de llaveros. Pendiente: «Clientes felices». Descartado: «Precio especial». |
| D13 | Fase 2 de conversión (24/11/2026) | «Lo más pedido» por pedidos distintos (30 días, mínimo 2; etiqueta en los 6 primeros, sección en la portada y orden de la cola de redes). Comentarios: mensaje privado con la automatización de Meta Business Suite + respuesta pública automática desde `Redes.gs`. Google Shopping: «probar ya» (repo `TygerSolis.github.io` solo para verificar), sin productos con marcas ajenas. Reseñas: enlace del perfil de Google, atajo `/resena/`. |

Implementado (octubre de 2026):

- **Fase 0 — saneamiento**: historial de git limpiado (885 → 192 MB; respaldos fuera del repo y en R2);
  `config.json` único para contacto/URL; escapado HTML de datos en `catalogo.js`; `assets/sin-foto.svg` local;
  mapa de Google que se carga al pulsar; eliminados los flujos de recompresión de medios.
- **Fase 1 — catálogo desde la hoja**: campos `disponibilidad`/`activo`/`orden`, categorías derivadas de los
  datos, `validar_productos.py`, `hoja_catalogo.py` y el workflow `catalogo-desde-hoja.yml` (fotos/videos desde
  R2, limpieza de medios sin uso). Guía para el dueño: `docs/guia-catalogo.md`.
- **Fase 2 — registro de pedidos**: código `S3D-XXXXX` (sin 0/O/1/I) al inicio del mensaje de WhatsApp en Mi
  pedido, Comprar y Cotizar; envío por `sendBeacon` al Apps Script (validación, duplicados, freno de ráfagas,
  anti-fórmulas, correo). La página de privacidad describe el registro. Guía: `docs/guia-pedidos.md`.
- **Fase 3 — calidad y seguridad**: publicación por GitHub Actions con vista previa (Settings → Pages →
  Source: GitHub Actions; el despliegue antiguo «pages build and deployment» ya no corre); errores de JS de
  los visitantes como evento Umami `error_js` (máx. 3 por visita); sin atributos `onclick` y con CSP en todas
  las páginas.

Retomado el 17/11/2026:

- **Temporada navideña** (D8): `temporada.js` + bloque `temporada` de `config.json`; aviso rojo, guirnalda de luces
  bajo el menú, nieve en el hero, categoría «Navidad» primero con banner, mosaico y botón del hero, marca en
  tarjetas y fichas; mosaico del hero adaptable a 1–3 productos. Pruebas en `tests/temporada.cjs`; guía en
  `docs/guia-catalogo.md`.
- **Precio por color** (D4): en la hoja, `Nombre #rrggbb foto precio`; `color.precio` en productos.json. La ficha, la
  tarjeta, el visor, Mi pedido y WhatsApp usan el precio del color elegido; sin color elegido, «Desde S/ …»;
  schema.org `AggregateOffer`. Con colores, las fotos extra y el video salen como miniaturas bajo los colores.
  Pruebas en `tests/precios.cjs`.

- **Kit para redes** (D9, etapa 1): `redes/index.html` y fotos JPG; cola con los 10 productos navideños. Siguientes
  etapas: catálogo de Meta (feed) y respuestas automáticas en Meta Business Suite. Pruebas en `tests/redes.cjs`.
- **Publicación automática FB+IG** (D9): `Redes.gs` + botones en /redes/. Pendiente del dueño: crear la app de Meta,
  instalar el script y enviar la URL (`docs/guia-redes.md`).

Pendiente (no iniciado): pasar el JS a módulos, unificar las 5 hojas de estilo, una sola plantilla para
tarjeta/ficha; Fase 4 (reseñas, promociones con fecha de fin). Del dueño: fotos nuevas de 35 productos
(`docs/guia-fotos.md`), revisión legal de la privacidad, mensaje opcional a GitHub Support para purgar el
historial antiguo de los `refs/pull`.
