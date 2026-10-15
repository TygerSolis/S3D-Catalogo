# Guía: editar el catálogo desde la hoja de cálculo

El catálogo de la web sale de la hoja **[Catálogo S3D](https://docs.google.com/spreadsheets/d/1syqB0cJ9Y4VqATos0FX4CQqZgXMAV053uymQiMXQOQQ/edit)**.
Cada 30 minutos GitHub la lee, comprueba los datos y, si todo está bien, publica los cambios en la web.
Para publicar al instante: GitHub → pestaña **Actions** → **Catálogo desde la hoja** → **Run workflow**.

> La hoja manda: cualquier cambio hecho a mano en `productos.json` se pierde en la siguiente sincronización.
> Si un dato está mal, **no se publica nada** y GitHub te envía un correo; el resumen de la ejecución
> (Actions → la ejecución en rojo) dice la fila y el motivo. Corrige la hoja y espera la siguiente pasada.

## Columnas

| Columna | Qué poner | Ejemplo |
| --- | --- | --- |
| id | Número único del producto. **No lo cambies** en productos existentes (los pedidos y favoritos lo usan). Para uno nuevo, usa uno que no exista. | 88 |
| orden | Posición en el catálogo (de menor a mayor). Las categorías aparecen en el orden de su primer producto. Deja huecos (10, 20, 30…) para intercalar. | 15 |
| activo | `sí` = visible. `no` = oculto del catálogo y del buscador; su página sigue existiendo con un aviso. | no |
| nombre | Nombre visible. | WOODY |
| categoria | Categoría. Si escribes una nueva, aparece sola como filtro. | Muñecos Coleccionables |
| coleccion | Opcional: línea pequeña sobre el nombre. | Toy Story |
| tipo | Tipo de producto. | Figura 3D |
| medida | Medida publicada. | 23CM |
| material | Material. | PLA Premium |
| precio | Precio en soles, sin «S/». Vale `70`, `74.9` o `74,9`. | 74.9 |
| cotizar | `sí` si no tiene precio publicado (muestra «Cotizar»). | no |
| disponibilidad | `A pedido`, `En stock` o `Agotado`. Las dos últimas muestran una etiqueta; el producto se puede pedir igual. | En stock |
| descripcion | Texto de la ficha. | … |
| imagenes | Nombres de las fotos, sin carpeta ni extensión, separados por comas. La primera es la principal. | ts-woody-1, ts-woody-2 |
| colores | Opcional. Una línea por color: `Nombre #código foto`. | Rosa #ff99cc hk-urbana-1 |
| video | Opcional: archivo de video ya subido al sitio. | sn-peaky-video.mp4 |
| etiqueta | Opcional: `Top Ventas` (sale en el mosaico de portada) o `Personalizable`. | Top Ventas |
| fechaAlta | Fecha de alta `AAAA-MM-DD`. Durante 14 días el producto lleva el aviso «Nuevo». | 2026-10-20 |
| slug | Dirección de la ficha (`producto/<slug>/`). **No la cambies** en productos existentes. En uno nuevo puedes dejarla vacía y se crea sola a partir del nombre. | woody |
| heroOrden | Opcional: 1 = producto grande del mosaico de portada. | 1 |
| heroFoco | Opcional: encuadre de la foto en el mosaico. | center 62% |

## Añadir un producto nuevo

1. **Fotos:** súbelas al bucket R2 `s3d`, carpeta `fuentes/` (panel de Cloudflare → R2 → s3d → Upload).
   Usa el original de la cámara (PNG o JPG, cuanto más grande mejor) y un nombre sin tildes, p. ej. `taza-rosa-1.jpg`.
2. **Fila:** añade una fila en la hoja con un `id` nuevo, `activo` = `sí` y en `imagenes` el nombre sin extensión: `taza-rosa-1`.
3. En la siguiente pasada GitHub descarga la foto, genera los 4 tamaños (AVIF y WebP) y publica la ficha.

Consejo: si quieres preparar un producto sin que se vea todavía, ponlo con `activo` = `no` y actívalo cuando esté listo.
