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
                                                #   pedidos, buscador, analitica, navegacion, temporada, precios, redes, publicar, seguridad)
python3 scripts/validar_productos.py            # valida productos.json (ids, slugs, precios, imágenes…)
python3 scripts/build_product_pages.py          # regenera páginas, sitemap, ItemList y datos de config.json
npm run build:css                               # recompila tailwind.css (luego subir ?v= en index.html)
node scripts/optimize_images.cjs                # genera AVIF/WebP en 4 tamaños desde fuentes/ (git-ignored)
python3 scripts/hoja_catalogo.py --help         # exportar/importar/faltantes/videos/limpiar (hoja ↔ JSON)
node scripts/redes_fotos.cjs                    # JPG 4:5 para redes de la cola (originales de fuentes/ o R2)
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
- **Kit para redes** (`scripts/redes.py`, llamado por el generador): `config.json` → `redes.cola` (ids en el orden
  de publicación) genera `redes/index.html`, página interna (sin enlace desde el sitio, noindex, sin analítica) con
  fotos limpias, texto para Facebook (enlace con `utm_source=facebook`), Instagram (sin enlace), anuncio de
  Marketplace (sin enlaces) y respuesta para «¿Está disponible?» (`utm_source=marketplace`); `utm_campaign` es el id
  de la temporada o `catalogo`. Las fotos son `redes/fotos/<nombre>.jpg` 1080×1350 con la foto completa sobre la
  misma foto desenfocada (`scripts/redes_fotos.cjs`, desde los originales; si faltan, la página muestra «pendiente» y el
  generador lo avisa); las que salen de la cola se borran solas. Marketplace: marca «ya publicado» en localStorage.
- **Publicación automática** (`scripts/apps-script/Redes.gs`, vinculado a la hoja del catálogo; guía
  `docs/guia-redes.md`): la página /redes/ llama al Apps Script (`config.json` → `redes.publicarUrl`) con la clave del
  dueño (localStorage); el script lee `redes/publicaciones.json` de la web PRINCIPAL y publica con la Graph API de Meta
  (v27.0, token de página en propiedades del script): Facebook = fotos sin publicar + `/feed` con `attached_media`, o
  `/videos`; Instagram = foto/carrusel o `REELS` (espera `status_code` FINISHED). Anota cada red en la pestaña
  «publicaciones» (la última fila manda; nunca repite una red ya publicada). «Aprobar» = fila «programado»; los
  activadores de `instalar` publican uno a las 11:00 y otro a las 19:00 (Lima). Pruebas en `tests/publicar.cjs`
  (Google y Meta simulados con `vm`).
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
