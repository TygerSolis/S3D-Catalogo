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
                                                #   pedidos, buscador, analitica, navegacion)
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
