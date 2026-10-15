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
                                                #   pedidos, buscador, analitica, navegacion, seguridad)
python3 scripts/validar_productos.py            # valida productos.json (ids, slugs, precios, imágenes…)
python3 scripts/build_product_pages.py          # regenera páginas, sitemap, ItemList y datos de config.json
npm run build:css                               # recompila tailwind.css (luego subir ?v= en index.html)
node scripts/optimize_images.cjs                # genera AVIF/WebP en 4 tamaños desde fuentes/ (git-ignored)
python3 scripts/hoja_catalogo.py --help         # exportar/importar/faltantes/videos/limpiar (hoja ↔ JSON)
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
| D2 | Videos | No recomprimir: se publican tal cual (máx. 25 MB). |
| D3 | Edición del catálogo | Google Sheets + GitHub Action (la hoja manda). |
| D4 | Campos nuevos | Solo `disponibilidad`, `activo` y `orden` (sin días de elaboración ni variantes con precio). |
| D5 | Registro de pedidos | Apps Script + hoja «Pedidos S3D», aviso a ventas.s3d@gmail.com. |
| D6 | Revisión de cambios | Rama `vista-previa` publicada en `/vista-previa/`; pasa a `main` con «aprobado». |
| D7 | Dominio | Se mantiene `tygersolis.github.io/S3D-Catalogo` (sin dominio propio). |

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

Pendiente (no iniciado): pasar el JS a módulos, unificar las 5 hojas de estilo, una sola plantilla para
tarjeta/ficha; Fase 4 (reseñas, promociones con fecha de fin). Del dueño: fotos nuevas de 35 productos
(`docs/guia-fotos.md`), revisión legal de la privacidad, mensaje opcional a GitHub Support para purgar el
historial antiguo de los `refs/pull`.
