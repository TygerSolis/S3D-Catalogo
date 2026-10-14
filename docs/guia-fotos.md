# Guía de fotos para el catálogo

La nitidez al ampliar depende de la **resolución real de la foto original**: ninguna compresión puede añadir detalle que la foto no tiene. Hoy **35 productos** tienen su mejor foto por debajo de 1400 px de lado largo, y **39 de 87** tienen una sola foto.

## Cómo fotografiar cada producto

**Meta mínima:** 1600 px de lado largo (ideal: foto de celular a máxima resolución, unos 3000 × 4000 px). Sin filtros ni recortes previos.

Tomas recomendadas (3 como mínimo):
1. **Principal:** el producto entero, de frente o en 3/4, centrado, con margen alrededor.
2. **Detalle:** un acercamiento donde se vean el acabado, las capas y los colores.
3. **Escala o uso:** el producto junto a una mano o una moneda, o en uso (en el escritorio, en la pared, con las llaves…).
4. *(Si aplica)* **Video corto** girando la pieza: ya se admite en las fichas.

Consejos para una foto nítida:
- Luz natural suave junto a una ventana (evita el flash y el contraluz).
- Fondo liso y neutro (blanco, gris claro o madera clara) y el mismo en todo el catálogo.
- Apoya el celular o usa trípode, y enfoca tocando el producto antes de disparar.
- Limpia la pieza y las lentes de la cámara.
- Orientación vertical (4:5 o 3:4): es la que mejor llena las tarjetas.

## Cómo integrarlas

1. Guarda los originales **sin comprimir** (PNG o JPEG) en la carpeta local `fuentes/` con el nombre que ya usa cada imagen, por ejemplo `ts-woody-1.jpg`, `ts-woody-2.jpg` (el nombre se ve en `productos.json`).
2. La primera vez ejecuta `npm ci`; después `node scripts/optimize_images.cjs` (genera los cuatro niveles: miniatura, intermedio, estándar y original en WebP y AVIF).
3. Si es una foto nueva de un producto, añade su ruta a `imagenes` en `productos.json` con extensión `.webp` (por ejemplo `assets/ts-woody-2.webp`) y ejecuta `python3 scripts/build_product_pages.py`.
4. Prueba con `npm test` y publica.

O pásame las fotos y lo hago yo.

## Productos a fotografiar primero

Prioridad **Alta**: los más vendidos, los nuevos y los destacados en la portada. **Media**: precio alto, barbería y muñecos. **Baja**: el resto.

| Prioridad | Producto | Categoría | Mejor foto actual | Fotos hoy |
|---|---|---|---|---|
| Alta | CALENDARIO PERPETUO | Adornos | 1059 px | 2 |
| Alta | TORRE EIFFEL | Adornos | 1054 px | 1 |
| Alta | BART BARBERO | Barbería | 1195 px | 2 |
| Alta | HELLO KITTY URBANA | Muñecos Coleccionables | 1236 px | 1 |
| Alta | SNOOPY PEAKY BLINDERS SET | Muñecos Coleccionables | 1374 px | 2 |
| Media | FRAMELUZ | Barbería | 1280 px | 2 |
| Media | BUZZ | Muñecos Coleccionables | 1195 px | 2 |
| Media | HELLO KITTY FASHION | Muñecos Coleccionables | 611 px | 1 |
| Media | JESSIE | Muñecos Coleccionables | 1195 px | 2 |
| Media | SNOOPY | Muñecos Coleccionables | 1047 px | 1 |
| Media | SNOOPY PEAKY BLINDERS | Muñecos Coleccionables | 1195 px | 2 |
| Media | SNOOPY SALUDOS | Muñecos Coleccionables | 1049 px | 2 |
| Media | SNOOPY SMOOTH CRIMINAL | Muñecos Coleccionables | 1374 px | 2 |
| Media | SNOOPY ZZZ | Muñecos Coleccionables | 1053 px | 2 |
| Media | WOODY | Muñecos Coleccionables | 1195 px | 1 |
| Baja | LLAVERO SOPORTE PARA CELULAR | Accesorios | 1267 px | 2 |
| Baja | CORAZÓN EN CORAZÓN | Adornos | 841 px | 1 |
| Baja | JARRÓN ESPIRAL B | Adornos | 885 px | 1 |
| Baja | JARRÓN ESPIRAL D | Adornos | 973 px | 1 |
| Baja | JARRÓN LUNA | Adornos | 746 px | 1 |
| Baja | JARRÓN TEXTURIZADOS | Adornos | 997 px | 1 |
| Baja | JARRÓN TWISTING ELEG | Adornos | 975 px | 1 |
| Baja | MADRE E HIJO | Adornos | 978 px | 1 |
| Baja | OSO CON CORAZÓN | Adornos | 992 px | 1 |
| Baja | TULIPÁN | Adornos | 744 px | 1 |
| Baja | HOLDER ALIANZA LIMA | Holders | 1195 px | 2 |
| Baja | HOLDER BARCELONA | Holders | 1101 px | 1 |
| Baja | HOLDER CIENCIANO | Holders | 1052 px | 2 |
| Baja | HOLDER JIU JITSU | Holders | 1050 px | 2 |
| Baja | HOLDER KNICKS BASQUETBOL | Holders | 1029 px | 2 |
| Baja | HOLDER PSG | Holders | 1114 px | 1 |
| Baja | HOLDER REAL MADRID | Holders | 1312 px | 2 |
| Baja | HOLDER SPORT BOYS | Holders | 1182 px | 2 |
| Baja | HOLDER UNIVERSITARIO | Holders | 1114 px | 3 |
| Baja | HUESO XA NARANJA | Mascota | 1024 px | 1 |
