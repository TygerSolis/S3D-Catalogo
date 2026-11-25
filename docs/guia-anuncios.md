# Guía: píxel de Meta para los anuncios

El píxel le cuenta a Meta qué hacen en la web las personas que llegan desde tus anuncios (qué producto ven, si
añaden algo a «Mi pedido» y si pulsan «Comprar» por WhatsApp). Con eso Meta muestra los anuncios a gente con más
probabilidad de comprar y puedes ver cuántos pedidos trajo cada anuncio.

**Cómo funciona en la web**: mientras `config.json` → `metaPixel` esté vacío, no hay nada de Meta. Con el número, cada
visitante ve un aviso de cookies; el píxel **solo se carga si pulsa «Aceptar»** (ley peruana de datos personales,
Ley 29733). Si rechaza, la web funciona igual. La decisión se puede cambiar con «Preferencias de cookies», al pie de
cada página. La vista previa nunca carga el píxel.

Eventos que recibe Meta:

| Evento de Meta | Cuándo |
|---|---|
| PageView | cada página vista |
| ViewContent | se abre una ficha de producto (con su id `S3D-…`, igual que en el catálogo de Meta, y su precio) |
| AddToCart | «Añadir al pedido» |
| Lead | «Comprar por WhatsApp», enviar «Mi pedido» o pedir una cotización |
| Contact | cualquier otro botón de WhatsApp |
| Search | búsquedas en el catálogo |

## Crear el píxel (una vez)

1. Entra a **https://business.facebook.com** con la cuenta que administra la página de S3D →
   **Administrador de eventos** (menú ☰ → *Administrador de eventos*).
2. **Conectar orígenes de datos** (o el botón **+**) → **Web** → nombre: `S3D web` → **Crear**.
3. Si pregunta cómo instalarlo, elige **instalar el código manualmente** y cierra esa ventana: lo instalo yo.
4. Copia el **identificador del conjunto de datos / del píxel** (un número de 15–16 dígitos; está en la pestaña
   *Configuración*). **Es público** (va dentro de la web): puedes enviármelo por el chat.
5. En *Configuración* → **Cuentas publicitarias conectadas**, conecta la cuenta con la que pagarás los anuncios.

Cuando lo tenga, lo pongo en `config.json` (`metaPixel`) y lo publico en la vista previa (sin píxel) y luego en la web.

## Comprobar que funciona

1. En el Administrador de eventos → tu píxel → **Probar eventos** → escribe `https://tygersolis.github.io/S3D-Catalogo/`
   → **Abrir sitio web**.
2. En la web que se abre pulsa **Aceptar** en el aviso de cookies, entra a un producto y pulsa «Comprar por WhatsApp».
3. En *Probar eventos* deben aparecer PageView, ViewContent y Lead en uno o dos minutos.

Meta también puede pedir **verificar el dominio** (Configuración del negocio → Seguridad de la marca → Dominios):
elige la opción de **etiqueta meta**, envíame la etiqueta y la agrego a la portada.

## Al crear los anuncios

- Objetivo **Ventas** o **Clientes potenciales** con el píxel `S3D web` y el evento **Lead** como conversión.
- Destino: la ficha del producto que anuncias o la **guía de regalos** (`https://tygersolis.github.io/S3D-Catalogo/regalos/`,
  o un rango concreto: `…/regalos/#menos-30`). Agrega al enlace `?utm_source=meta&utm_medium=anuncio&utm_campaign=<nombre>`
  para verlo también en Umami.
- Para anuncios de catálogo (los productos se eligen solos) usa el catálogo de Meta que ya se llena desde la web.
