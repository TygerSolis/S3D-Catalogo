# Guía: S3D en Google Shopping (fichas gratuitas)

Google muestra gratis productos de tiendas en la pestaña **Shopping** y en los resultados de búsqueda («fichas
gratuitas»). En Perú está disponible, con precios en soles. Para aparecer hay que crear una cuenta de **Google Merchant
Center**, verificar la web y darle la lista de productos que la web ya genera sola.

**Lista de productos (se actualiza sola con la hoja):** https://tygersolis.github.io/S3D-Catalogo/google/productos.txt
Son los mismos artículos y fotos del catálogo de Meta, con enlaces `utm_source=google` (en Umami verás cuántas visitas
llegan desde Google Shopping).

## Importante: productos con marcas o personajes

Google suspende cuentas por productos con marcas o personajes ajenos (Toy Story, Snoopy, Hello Kitty, clubes, Nike,
Toyota, Cars…), porque los trata como posibles **falsificaciones**, y esa suspensión es difícil de revertir. Por eso la
lista para Google **deja fuera** los productos cuyo nombre o descripción tienen alguna de las palabras de
`config.json` → `google.excluirMarcas` (hoy van 54 de 95 artículos: jarrones, mascotas, barbería, lámparas, Navidad
sin Snoopy, etc.). Si agregas un producto con otra marca, avísame para sumarla a la lista. Meta y la web no cambian.

## Pasos (una sola vez, desde una computadora, ~30 minutos)

1. Entra a **https://merchants.google.com** con la cuenta de Google de S3D (`ventas.s3d@gmail.com`) y crea la cuenta:
   - Nombre de la empresa: **S3D** · País: **Perú** · Zona horaria: Lima.
   - Dónde venden: **en tu sitio web**. Sitio web: `https://tygersolis.github.io/`.
2. **Verificar el sitio** (Configuración → Información de la empresa → Sitio web):
   - Elige **«Agregar una etiqueta HTML»** o **«Subir un archivo HTML»** y **envíame el nombre del archivo** (algo como
     `google1a2b3c4d5e6f7a8b.html`) o la etiqueta `<meta name="google-site-verification" content="…">`. No son secretos.
   - Yo creo el repositorio `TygerSolis.github.io` (la raíz de tu dominio en GitHub) con ese archivo y te aviso; luego
     pulsas **Verificar** y **Reclamar**.
3. **Envíos** (Configuración → Envío y devoluciones → Envío → Agregar servicio):
   - País: Perú · Moneda: PEN · Nombre: «Delivery y agencias».
   - Tiempo de preparación: **1 a 2 días**; tiempo de tránsito: **1 a 5 días**.
   - Costo: **tarifa fija S/ 15** (el «desde» más alto de la web: así nunca prometes menos de lo que cobras).
4. **Devoluciones** (misma sección → Políticas de devolución): «No se aceptan devoluciones» salvo **productos dañados o
   con defecto de fabricación** (es lo que dicen los términos de la web), con enlace
   `https://tygersolis.github.io/S3D-Catalogo/terminos/`.
5. **Productos** → **Agregar productos** → **Agregar desde un archivo** → **Agregar una URL** (descarga programada):
   - URL: `https://tygersolis.github.io/S3D-Catalogo/google/productos.txt`
   - Frecuencia: **diaria** · País: Perú · Idioma: español · Moneda: PEN.
6. Revisa que en **Crecimiento → Administrar programas** esté activo **Fichas gratuitas** (viene activo).

Google revisa la cuenta y los productos en **3 a 7 días**. Si sale algún aviso en **Productos → Diagnóstico** o la
cuenta queda «en revisión» o «suspendida», mándame una captura: no hagas cambios a ciegas, porque los reintentos
fallidos alargan el bloqueo.

## Qué puede pasar

- Google puede pedir que el sitio tenga **carrito de compras**: la web vende por WhatsApp. Si rechaza la cuenta por eso,
  no hay que hacer nada más: la lista queda lista para cuando haya dominio propio o tienda en línea.
- Un **dominio propio** (`s3d.pe` o similar, D7) haría la verificación más simple y la cuenta más confiable.
