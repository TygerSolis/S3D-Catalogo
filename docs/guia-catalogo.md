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
| imagenes | Nombres de las fotos, sin carpeta ni extensión, separados por comas. **Pon tantas como quieras**: la primera es la principal y las miniaturas se crean solas (en la tarjeta del catálogo van en una fila que se desliza). | ts-woody-1, ts-woody-2, ts-woody-3 |
| colores | Opcional. Una línea por color: `Nombre #código foto`. Si un color cuesta distinto, pon su precio al final: `Nombre #código foto precio` (los colores sin precio usan la columna `precio`). La ficha y la tarjeta cambian el precio al elegir el color; donde no se elige, sale «Desde S/ …». Si el producto tiene más fotos o un video, se ven como miniaturas bajo los colores. | Rosa #ff99cc hk-urbana-1 <br> Blanco con luz LED (28 cm) #f4f1ea arbol-1 45 |
| video | Opcional: un video por producto, con su extensión (.mp4 o .webm). Si es nuevo, súbelo a R2 `fuentes/` con ese mismo nombre (máx. 25 MB); aparece como última miniatura con ▶. | taza-rosa-video.mp4 |
| etiqueta | Opcional: `Top Ventas` (sale en el mosaico de portada) o `Personalizable`. | Top Ventas |
| fechaAlta | Fecha de alta `AAAA-MM-DD`. Durante 14 días el producto lleva el aviso «Nuevo». | 2026-10-20 |
| slug | Dirección de la ficha (`producto/<slug>/`). **No la cambies** en productos existentes. En uno nuevo puedes dejarla vacía y se crea sola a partir del nombre. | woody |
| heroOrden | Opcional: 1 = producto grande del mosaico de portada. | 1 |
| heroFoco | Opcional: encuadre de la foto en el mosaico. | center 62% |
| redes | Opcional: turno en la cola de publicaciones de Facebook e Instagram (1 = el primero). Vacío = automático (los más nuevos primero); `no` = nunca se publica. Los ocultos y agotados no entran. | 3 |

## Añadir un producto nuevo

1. **Fotos y video:** súbelos al bucket R2 `s3d`, carpeta `fuentes/` (panel de Cloudflare → R2 → s3d → Upload).
   Fotos: el original de la cámara (PNG o JPG, cuanto más grande mejor), con nombres sin tildes, p. ej.
   `taza-rosa-1.jpg`, `taza-rosa-2.jpg`, `taza-rosa-3.jpg`. Video (opcional): p. ej. `taza-rosa-video.mp4`, hasta 25 MB.
2. **Fila:** añade una fila en la hoja con un `id` nuevo; en `imagenes` los nombres sin extensión en el orden
   en que quieres verlos (`taza-rosa-1, taza-rosa-2, taza-rosa-3`) y en `video` el nombre completo (`taza-rosa-video.mp4`).
3. En la siguiente pasada GitHub descarga las fotos, genera los 4 tamaños (AVIF y WebP), copia el video tal cual
   y publica la ficha. Si falta un archivo en R2 o el video pesa más de 25 MB, no publica nada y te avisa.

Para **añadir o quitar fotos de un producto que ya existe** basta con editar su celda `imagenes`
(y subir a R2 las fotos nuevas). Cambiar el orden de los nombres cambia la foto principal.

Consejo: si quieres preparar un producto sin que se vea todavía, ponlo con `activo` = `no` y actívalo cuando esté listo.

## Colección de temporada (Navidad)

Del **17 de noviembre de 2026 al 6 de enero de 2027** la web se ambienta sola para Navidad: aviso rojo arriba,
luces bajo el menú, nieve en la portada y detalles festivos. El 7 de enero vuelve sola al diseño normal.

Para que un producto forme parte de la **Colección Navideña**, escribe `Navidad` en su columna `categoria`
(con mayúscula inicial, igual en todas las filas). Mientras dure la temporada:

- «Navidad» es el primer filtro y la primera sección del catálogo, con un banner propio.
- La portada muestra hasta 4 productos navideños en lugar de «Más vendidos» (el grande lo eliges con `heroOrden` = 1)
  y un botón rojo «Colección Navideña».
- Sus tarjetas y fichas llevan la marca «Navidad».

Si aún no hay productos con categoría `Navidad`, solo se ve la ambientación y la portada sigue mostrando los más vendidos.
Las fechas, el título y el texto del aviso están en `config.json` → `temporada` (para quitarla antes de tiempo, se borra ese bloque).
