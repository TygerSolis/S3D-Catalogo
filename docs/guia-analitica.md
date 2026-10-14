# Cómo leer la analítica (Umami)

Entra a https://cloud.umami.is y abre el sitio **S3D**. La medición es anónima y sin cookies; solo ves conteos, nunca personas. Abre tu web una vez con `?sin-analitica` al final de la dirección en cada uno de tus dispositivos para que tus visitas no cuenten.

Espera **2 a 4 semanas** de visitas antes de sacar conclusiones: con pocos datos los rankings se mueven por casualidad.

## Dónde mirar cada dato

| Quiero saber… | Dónde | Qué mirar |
|---|---|---|
| Cuánta gente visita y de dónde llega | **Overview** | Visitas, páginas vistas, fuentes (Instagram, TikTok, Google…) y dispositivo (móvil o computadora) |
| Qué productos interesan más | **Events** → `producto_visto` | Pestaña de propiedades: ranking de `producto` |
| Qué productos llevan a comprar | **Events** → `clic_comprar` | Ranking de `producto`: es la señal más fuerte de interés real |
| Qué productos agregan al pedido | **Events** → `pedido_agregar` | Ranking de `producto` y, en `pedido_enviar`, cuántos pedidos se envían |
| Qué se guarda en favoritos | **Events** → `favorito_agregar` | Productos que gustan pero quizá no se compran todavía |
| Qué categorías llaman la atención | **Events** → `categoria` | Ranking de `categoria` (incluye Novedades y Favoritos) |
| Qué buscan y no encuentran | **Events** → `busqueda` y `busqueda_sin_resultados` | Términos más buscados; los "sin resultados" son productos o palabras que faltan en el catálogo |
| Qué fichas se ven más | **Pages** | Las direcciones `/producto/...` más visitadas |
| Si piden personalizados | **Events** → `cotizar_personalizado`, `clic_whatsapp` | Cuántos usan el formulario y desde qué zona del sitio escriben |
| Desde dónde abren las fichas | **Events** → `ficha_tarjeta`, `ficha_galeria`, `ficha_relacionado`, `ficha_buscador` | Qué vía de entrada funciona más |
| Colores preferidos | **Events** → `color_elegido` | Ranking de `eleccion` (por ejemplo, Hello Kitty en negro) |

## Rutina sugerida (10 minutos a la semana)

1. **Overview:** ¿subieron las visitas? ¿de qué fuente?
2. **`clic_comprar` y `pedido_agregar`:** los 5 productos con más interés. Asegúrate de tenerlos con buenas fotos y stock de material.
3. **Ratio de interés:** un producto con muchos `producto_visto` pero pocos `clic_comprar` puede necesitar mejor foto, descripción o precio.
4. **`busqueda_sin_resultados`:** si un término se repite, crea el producto, añade esa palabra a la descripción o ajusta el nombre.
5. **Categorías:** si una categoría casi no se abre, revisa su orden y sus fotos.

## Decisiones que suelen salir de estos datos

- Qué productos destacar en el mosaico de la portada (`heroOrden` en `productos.json`).
- Qué fotos nuevas hacer primero (ver `docs/guia-fotos.md`).
- Qué productos agregar o descontinuar.
- Si conviene reforzar Instagram o TikTok según de dónde llegan las visitas.

## Límites del plan gratuito

Umami Cloud gratuito cuenta hasta **100 000 eventos al mes** (cada visita y cada propiedad de evento cuentan). Si te acercas al límite, el panel te avisa; en ese caso conviene pasar a un plan de pago o reducir eventos poco útiles (como `orden`).
