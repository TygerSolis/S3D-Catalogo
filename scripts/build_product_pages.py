#!/usr/bin/env python3
"""Genera las páginas estáticas de producto, el sitemap y el ItemList del índice.

A partir de productos.json crea producto/<slug>/index.html por cada producto
(contenido visible sin JavaScript, metadatos para compartir y datos
estructurados schema.org), actualiza sitemap.xml y el bloque ItemList de
index.html. Añade el campo "slug" a productos.json si falta.

Uso (desde cualquier carpeta):  python3 scripts/build_product_pages.py
Hay que volver a ejecutarlo cada vez que cambie productos.json.
"""
import html
import json
import re
import shutil
import sys
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import quote

from validar_productos import validar

ROOT = Path(__file__).resolve().parents[1]
# Datos de contacto y URL: se editan SOLO en config.json (este script los lleva a todas las páginas,
# a la portada y a tienda.js).
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
BASE_URL = CONFIG["urlBase"]
WHATSAPP = CONFIG["whatsapp"]
WHATSAPP_VISIBLE = CONFIG["whatsappVisible"]
PEDIDOS_URL = CONFIG.get("pedidosUrl", "")
assert PEDIDOS_URL == "" or re.fullmatch(r"https://script\.google\.com/macros/s/[\w-]+/exec", PEDIDOS_URL), "pedidosUrl inválida en config.json"
OUT_DIR = ROOT / "producto"
ITEMLIST_START = "<!-- ITEMLIST:START -->"
ITEMLIST_END = "<!-- ITEMLIST:END -->"

esc = html.escape

CHROME_DIR = ROOT / "scripts" / "chrome"
CHROME_MARCAS = {
    "top": ("<!-- CHROME-TOP:START -->", "<!-- CHROME-TOP:END -->"),
    "pie": ("<!-- CHROME-FOOTER:START -->", "<!-- CHROME-FOOTER:END -->"),
    "pagos": ("<!-- CHROME-PAGOS:START -->", "<!-- CHROME-PAGOS:END -->"),
}


def plantilla(nombre: str, base: str) -> str:
    """Lee scripts/chrome/<nombre>.html y resuelve {{base}} (prefijo relativo a la raíz del sitio) y los datos de contacto."""
    texto = (CHROME_DIR / f"{nombre}.html").read_text(encoding="utf-8")
    return texto.replace("{{base}}", base).replace("{{whatsapp}}", WHATSAPP).replace("{{whatsapp_visible}}", WHATSAPP_VISIBLE)


def chrome_superior(base: str) -> str:
    """Íconos + barra de aviso + navegación, idénticos en la portada y en las fichas."""
    return plantilla("sprite", base) + "\n" + plantilla("header", base)


def chrome_pie(base: str) -> str:
    return plantilla("footer", base)


def sangrar(texto: str, espacios: int = 4) -> str:
    return "\n".join((" " * espacios + linea) if linea.strip() else linea for linea in texto.rstrip("\n").split("\n")) + "\n"


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def url_ruta(ruta: str, prefijo: str = "") -> str:
    """Codifica una ruta de asset (puede contener espacios) para usarla en una URL."""
    return prefijo + quote(ruta, safe="/")


def miniatura(ruta: str) -> str:
    """Ruta del nivel pequeño (assets/sm/) para tarjetas y miniaturas."""
    return re.sub(r"^assets/", "assets/sm/", ruta)


def nivel_medio(ruta: str) -> str:
    """Ruta del nivel intermedio (assets/md/): foto principal de la ficha en pantallas estrechas."""
    return re.sub(r"^assets/", "assets/md/", ruta)


def avif(ruta: str) -> str:
    return re.sub(r"\.(webp|png|jpe?g)$", ".avif", ruta, flags=re.I)


def precio_txt(p: dict) -> str:
    return "Cotizar" if p.get("requiereCotizacion") else f"S/ {p['precio']:.2f}"


# Disponibilidad -> frase del mensaje de WhatsApp, etiqueta visible y valor schema.org (igual que en catalogo.js).
DISPONIBILIDAD = {
    "A pedido": ("Es un producto elaborado a pedido y deseo consultar el costo de envío.", "", "https://schema.org/MadeToOrder"),
    "En stock": ("Figura en stock y deseo consultar el costo de envío.", "En stock", "https://schema.org/InStock"),
    "Agotado": ("Figura como agotado; quisiera saber si pueden elaborarlo y el costo de envío.", "Agotado", "https://schema.org/OutOfStock"),
}


def texto_disponibilidad(p: dict) -> str:
    return DISPONIBILIDAD[p.get("disponibilidad", "A pedido")][0]


def activos(todos: list[dict]) -> list[dict]:
    """Productos visibles en el catálogo (los ocultos conservan su ficha, pero no se listan)."""
    return [q for q in todos if q.get("activo", True)]


def mensaje_whatsapp(p: dict, color: str | None, enlace: str) -> str:
    col = f" (Color: {color})" if color else ""
    if p.get("requiereCotizacion"):
        base = f"Hola, me interesa cotizar el modelo 3D: {p['nombre']}{col}."
    else:
        base = f"Hola, me interesa el modelo 3D: {p['nombre']}{col} - Precio: S/ {p['precio']:.2f} (incluye IGV)."
    return f"{base} {texto_disponibilidad(p)}\n{enlace}"


def url_whatsapp(p: dict, color: str | None, enlace: str) -> str:
    return f"https://api.whatsapp.com/send?phone={WHATSAPP}&text={quote(mensaje_whatsapp(p, color, enlace), safe='')}"


def imagen_principal(p: dict) -> str:
    return p["colores"][0]["img"] if p.get("colores") else p["imagenes"][0]


def galeria(p: dict) -> list[dict]:
    """Medios de la galería: una entrada por color si hay colores; si no, las imágenes."""
    if p.get("colores"):
        return [{"src": c["img"], "etiqueta": c["nombre"]} for c in p["colores"]]
    return [{"src": s, "etiqueta": f"Foto {i + 1}"} for i, s in enumerate(p["imagenes"])]


def descripcion_meta(p: dict) -> str:
    partes = [p["descripcion"].strip().replace("\n", " ")]
    if not p.get("requiereCotizacion"):
        partes.append(f"Precio S/ {p['precio']:.2f} (incluye IGV).")
    partes.append("Elaborado a pedido en S3D; medidas y colores personalizables.")
    texto = " ".join(partes)
    return texto if len(texto) <= 300 else texto[:297].rstrip() + "…"


def json_ld_producto(p: dict, url: str) -> str:
    imagenes = [BASE_URL + url_ruta(g["src"]) for g in galeria(p)]
    datos = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": p["nombre"],
        "image": imagenes,
        "description": p["descripcion"].strip(),
        "sku": f"S3D-{p['id']}",
        "category": p["categoria"],
        "material": p["material"],
        "brand": {"@type": "Brand", "name": "S3D"},
        "url": url,
    }
    if p.get("medida"):
        datos["size"] = p["medida"]
    if not p.get("requiereCotizacion"):
        datos["offers"] = {
            "@type": "Offer",
            "url": url,
            "priceCurrency": "PEN",
            "price": f"{p['precio']:.2f}",
            "itemCondition": "https://schema.org/NewCondition",
            "availability": DISPONIBILIDAD[p.get("disponibilidad", "A pedido")][2],
            "seller": {"@type": "Organization", "name": "S3D"},
        }
    migas = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Catálogo", "item": BASE_URL},
            {"@type": "ListItem", "position": 2, "name": p["categoria"], "item": f"{BASE_URL}?categoria={quote(p['categoria'])}"},
            {"@type": "ListItem", "position": 3, "name": p["nombre"], "item": url},
        ],
    }
    return "\n".join(
        f'    <script type="application/ld+json">{json.dumps(d, ensure_ascii=False)}</script>' for d in (datos, migas)
    )


def tarjeta_relacionada(p: dict) -> str:
    img = imagen_principal(p)
    return f"""                <a class="pp-related-card" href="../{esc(p['slug'])}/" data-evento="ficha_relacionado" data-producto="{esc(p['nombre'])}">
                    <picture><source srcset="{esc(url_ruta(avif(miniatura(img)), '../../'))}" type="image/avif"><img src="{esc(url_ruta(miniatura(img), '../../'))}" alt="{esc(p['nombre'])}" loading="lazy" decoding="async"></picture>
                    <strong>{esc(p['nombre'])}</strong>
                    <span>{esc(precio_txt(p))}</span>
                </a>"""


def relacionados(p: dict, todos: list[dict], n: int = 4) -> list[dict]:
    mismos = [q for q in activos(todos) if q["categoria"] == p["categoria"] and q["id"] != p["id"]]
    if not mismos:
        return []
    # Los siguientes del catálogo en la misma categoría, dando la vuelta al final.
    idx = next((i for i, q in enumerate(todos) if q["id"] == p["id"]), 0)
    orden = sorted(mismos, key=lambda q: (todos.index(q) - idx) % len(todos))
    return orden[:n]


def pagina(p: dict, todos: list[dict]) -> str:
    slug = p["slug"]
    url = f"{BASE_URL}producto/{slug}/"
    medios = galeria(p)
    principal = medios[0]["src"]
    og_img = BASE_URL + url_ruta(principal)
    repetido = sum(1 for q in todos if q["nombre"] == p["nombre"]) > 1
    nombre_titulo = f"{p['nombre']} {p['medida']}" if repetido and p.get("medida") else p["nombre"]
    titulo = f"{nombre_titulo} | {p['categoria']} en 3D | S3D"
    desc = descripcion_meta(p)
    tiene_colores = bool(p.get("colores"))

    miniaturas = ""
    if tiene_colores:
        botones = "\n".join(
            f"""                    <button type="button" class="pp-swatch{' is-active' if i == 0 else ''}" data-pp-color="{esc(c['nombre'])}" data-img="{esc(url_ruta(c['img'], '../../'))}" data-wa="{esc(url_whatsapp(p, c['nombre'], url))}" style="background-color:{esc(c['hex'])}" aria-label="Color {esc(c['nombre'])}" aria-pressed="{'true' if i == 0 else 'false'}" title="{esc(c['nombre'])}"></button>"""
            for i, c in enumerate(p["colores"])
        )
        miniaturas = f"""                <div class="pp-colors" role="group" aria-label="Colores disponibles">
                    <p>Color: <strong id="pp-color-name">{esc(p['colores'][0]['nombre'])}</strong></p>
                    <div class="pp-swatches">
{botones}
                    </div>
                </div>"""
    elif len(medios) > 1 or p.get("video"):
        thumbs = "\n".join(
            f"""                    <button type="button" class="pp-thumb{' is-active' if i == 0 else ''}" data-pp-thumb data-src="{esc(url_ruta(m['src'], '../../'))}" aria-label="Ver {esc(m['etiqueta'].lower())}"{' aria-current="true"' if i == 0 else ''}><picture><source srcset="{esc(url_ruta(avif(miniatura(m['src'])), '../../'))}" type="image/avif"><img src="{esc(url_ruta(miniatura(m['src']), '../../'))}" alt="" loading="lazy" decoding="async"></picture></button>"""
            for i, m in enumerate(medios)
        )
        if p.get("video"):
            thumbs += f"""
                    <button type="button" class="pp-thumb pp-thumb-video" data-pp-video aria-label="Ver video del producto"><span aria-hidden="true">▶</span></button>"""
        miniaturas = f"""                <div class="pp-thumbs" aria-label="Miniaturas">
{thumbs}
                </div>"""

    video = (
        f"""                <video id="pp-video" class="pp-video" src="{esc(url_ruta(p['video'], '../../'))}" controls playsinline preload="none" hidden></video>"""
        if p.get("video")
        else ""
    )

    datos = [("Medida publicada", p.get("medida")), ("Material", p.get("material")), ("Tipo", p.get("tipo")), ("Colección", p.get("coleccion"))]
    ficha = "\n".join(
        f"                    <div><dt>{k}</dt><dd>{esc(str(v))}</dd></div>" for k, v in datos if v
    )
    precio_html = (
        '<span class="pp-price-main">Cotizar</span>'
        if p.get("requiereCotizacion")
        else f'<span class="pp-price-main"><small>S/</small> {p["precio"]:.2f}</span><span class="pp-price-note">Incluye IGV · según la medida publicada</span>'
    )
    color0 = p["colores"][0]["nombre"] if tiene_colores else None
    boton = "Cotizar por WhatsApp" if p.get("requiereCotizacion") else "Comprar por WhatsApp"
    rel = relacionados(p, todos)
    bloque_rel = (
        f"""        <section class="pp-related" aria-labelledby="pp-related-title">
            <h2 id="pp-related-title">Más de {esc(p['categoria'])}</h2>
            <div class="pp-related-grid">
{chr(10).join(tarjeta_relacionada(q) for q in rel)}
            </div>
        </section>"""
        if rel
        else ""
    )
    cat_q = quote(p["categoria"])
    opciones_color = "".join(f'<option value="{esc(c["nombre"])}">{esc(c["nombre"])}</option>' for c in p.get("colores", []))
    campo_color = (
        f"""<label for="cq-color">Color</label>
                        <select id="cq-color" name="color"><option value="">Sin preferencia</option>{opciones_color}<option value="__otro">Otro (lo detallo en las notas)</option></select>"""
        if opciones_color
        else """<label for="cq-color">Color o colores</label>
                        <input id="cq-color" name="color" type="text" maxlength="80" placeholder="Ej.: negro con detalles dorados">"""
    )
    abierto = " open" if p.get("requiereCotizacion") or not p.get("precio") else ""
    cotizador = f"""                <details class="pp-cotizador"{abierto}>
                    <summary><svg class="ico" aria-hidden="true"><use href="#i-pencil-ruler"/></svg><span>Personalizar o cambiar la medida</span><svg class="ico pp-flecha" aria-hidden="true"><use href="#i-chevron-down"/></svg></summary>
                    <form id="pp-cotizador" class="pp-form" novalidate>
                        <p class="pp-form-intro">Cuéntanos qué necesitas y te cotizamos por WhatsApp. El precio publicado corresponde a la medida publicada ({esc(p.get('medida') or '—')}).</p>
                        <label for="cq-medida">Medida que necesitas</label>
                        <input id="cq-medida" name="medida" type="text" maxlength="80" placeholder="Ej.: 10 cm más grande">
                        {campo_color}
                        <label for="cq-texto">Nombre o texto a incluir <span>(opcional)</span></label>
                        <input id="cq-texto" name="texto" type="text" maxlength="80" placeholder="Ej.: el nombre de tu mascota">
                        <label for="cq-notas">Otros detalles <span>(opcional)</span></label>
                        <textarea id="cq-notas" name="notas" rows="3" maxlength="400" placeholder="Cuéntanos cualquier otro detalle que quieras agregar"></textarea>
                        <button type="submit" class="pp-form-enviar"><svg class="ico" aria-hidden="true"><use href="#i-send"/></svg>Pedir cotización por WhatsApp</button>
                    </form>
                </details>"""
    fecha_attr = f' data-fecha-alta="{esc(p["fechaAlta"])}"' if p.get("fechaAlta") else ""
    etiqueta = DISPONIBILIDAD[p.get("disponibilidad", "A pedido")][1]
    clase_disp = "pp-disp-stock" if etiqueta == "En stock" else "pp-disp-agotado"
    etiqueta_disp = f'\n                <p class="pp-disp {clase_disp}">{esc(etiqueta)}</p>' if etiqueta else ""
    aviso_pausa = (
        '\n                <p class="pp-pausado" role="status">Este producto no está disponible en el catálogo por ahora. Escríbenos si te interesa o <a href="../../#catalogo">mira el catálogo</a>.</p>'
        if not p.get("activo", True) else ""
    )

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{esc(titulo)}</title>
    <meta name="description" content="{esc(desc)}">
    <link rel="canonical" href="{esc(url)}">
    <meta property="og:type" content="product">
    <meta property="og:locale" content="es_PE">
    <meta property="og:site_name" content="S3D">
    <meta property="og:title" content="{esc(nombre_titulo)} | S3D">
    <meta property="og:description" content="{esc(desc)}">
    <meta property="og:url" content="{esc(url)}">
    <meta property="og:image" content="{esc(og_img)}">
    <meta property="og:image:alt" content="{esc(p['nombre'])}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{esc(nombre_titulo)} | S3D">
    <meta name="twitter:description" content="{esc(desc)}">
    <meta name="twitter:image" content="{esc(og_img)}">
    <meta name="theme-color" content="#002244">
    <link rel="icon" href="../../assets/logo-96.webp" type="image/webp">
    <link rel="apple-touch-icon" href="../../assets/logo-192.png">
    <link rel="preload" href="../../assets/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="../../assets/fonts/spacegrotesk-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="../../fonts.css?v=1">
    <link rel="stylesheet" href="../../chrome.css?v=6">
    <link rel="stylesheet" href="../../producto.css?v=10">
{json_ld_producto(p, url)}
</head>
<body>
{sangrar(chrome_superior("../../"))}

    <main class="pp-main">
        <nav class="pp-breadcrumb" aria-label="Ruta">
            <a href="../../#catalogo">Catálogo</a><span aria-hidden="true">/</span>
            <a href="../../?categoria={cat_q}#catalogo">{esc(p['categoria'])}</a><span aria-hidden="true">/</span>
            <span aria-current="page">{esc(p['nombre'])}</span>
        </nav>

        <article class="pp-product" data-producto="{esc(p['nombre'])}" data-id="{p['id']}" data-slug="{esc(p['slug'])}" data-precio="{'' if p.get('requiereCotizacion') or not p.get('precio') else p['precio']}" data-cotizar="{'1' if p.get('requiereCotizacion') or not p.get('precio') else ''}" data-medida="{esc(p.get('medida') or '')}" data-imagen="{esc(miniatura(imagen_principal(p)))}"{fecha_attr}>
            <div class="pp-gallery">
                <div class="pp-stage" id="pp-stage" role="button" tabindex="0" aria-label="Ampliar imagen en alta resolución">
                    <span class="pp-ribbon" data-new hidden aria-hidden="true"><span>Nuevo</span></span>
                    <picture id="pp-picture"><source data-md media="(max-width: 859px)" srcset="{esc(url_ruta(avif(nivel_medio(principal)), '../../'))}" type="image/avif"><source data-md media="(max-width: 859px)" srcset="{esc(url_ruta(nivel_medio(principal), '../../'))}" type="image/webp"><source id="pp-main-src" srcset="{esc(url_ruta(avif(principal), '../../'))}" type="image/avif"><img id="pp-main-img" src="{esc(url_ruta(principal, '../../'))}" alt="{esc(p['nombre'])}" fetchpriority="high" decoding="async"></picture>
{video}
                </div>
{miniaturas}
            </div>

            <div class="pp-info">
                <p class="pp-new" data-new hidden>Producto nuevo en S3D</p>
                <p class="pp-kicker">{esc(p.get('coleccion') or p['categoria'])}</p>
                <h1>{esc(p['nombre'])}</h1>
                <div class="pp-price">{precio_html}</div>{etiqueta_disp}{aviso_pausa}
                <p class="pp-desc">{esc(p['descripcion'].strip())}</p>
                <dl class="pp-facts">
{ficha}
                </dl>
                <a id="pp-buy" class="pp-buy" data-producto="{esc(p['nombre'])}" href="{esc(url_whatsapp(p, color0, url))}" target="_blank" rel="noopener noreferrer">{boton}</a>
                <div class="pp-acciones">
                    <button type="button" class="pp-add" id="pp-add"><svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg><span>Añadir al pedido</span></button>
                    <button type="button" class="pp-icono" id="pp-fav" aria-pressed="false" aria-label="Guardar en favoritos" title="Guardar en favoritos"><svg class="ico" aria-hidden="true"><use href="#i-heart"/></svg></button>
                    <button type="button" class="pp-icono" id="pp-share" aria-label="Compartir este producto" title="Compartir"><svg class="ico" aria-hidden="true"><use href="#i-share-2"/></svg></button>
                </div>
{sangrar(plantilla("pagos", "../../"), 16)}                <ul class="pp-perks">
                    <li>Todos los productos se elaboran a pedido en nuestro taller</li>
                    <li>El precio corresponde a la medida publicada; si lo quieres más grande o más pequeño, el costo varía</li>
                    <li>Personalizable: medidas, colores y detalles. Escríbenos y lo evaluamos</li>
                    <li>Envíos a todo el Perú, costo según tu ubicación</li>
                </ul>
{cotizador}
            </div>
        </article>

{bloque_rel}
    </main>

{sangrar(chrome_pie("../../"))}

    <script src="../../chrome.js?v=1" defer></script>
    <script src="../../tienda.js?v=3" defer></script>
    <script src="../../analytics.js?v=5" defer></script>
    <script src="../../producto.js?v=11" defer></script>
</body>
</html>
"""


def actualizar_chrome_indice() -> None:
    """Mantiene la cabecera y el pie de index.html idénticos a los de las fichas (misma plantilla)."""
    indice = ROOT / "index.html"
    contenido = indice.read_text(encoding="utf-8")
    bloques = {"top": sangrar(chrome_superior("")), "pie": sangrar(chrome_pie("")), "pagos": sangrar(plantilla("pagos", ""), 12)}
    for clave, (inicio, fin) in CHROME_MARCAS.items():
        nuevo = f"    {inicio}\n{bloques[clave]}    {fin}"
        if inicio in contenido:
            contenido = re.sub(re.escape(inicio) + r".*?" + re.escape(fin), lambda _: nuevo.strip(), contenido, flags=re.S)
        elif clave == "pagos":
            continue  # las marcas se colocan una vez a mano en index.html
        else:
            if clave == "top":
                a = contenido.index('    <div class="announcement-bar')
                b = contenido.index("</nav>", a) + len("</nav>\n")
            else:
                a = contenido.index('    <footer id="contacto"')
                b = contenido.index("</footer>", a) + len("</footer>")
            contenido = contenido[:a] + nuevo + ("\n" if clave == "top" else "") + contenido[b:]
    indice.write_text(contenido, encoding="utf-8")


def sincronizar_contacto() -> None:
    """Lleva el número de config.json a las partes que no salen de plantillas: el resto de index.html y tienda.js."""
    indice = ROOT / "index.html"
    texto = re.sub(r"phone=\d+", f"phone={WHATSAPP}", indice.read_text(encoding="utf-8"))
    texto = re.sub(r"\+\d{2} \d{3} \d{3} \d{3}", WHATSAPP_VISIBLE, texto)
    indice.write_text(texto, encoding="utf-8")
    tienda = ROOT / "tienda.js"
    texto = re.sub(r"const WHATSAPP = '\d+';", f"const WHATSAPP = '{WHATSAPP}';", tienda.read_text(encoding="utf-8"))
    texto = re.sub(r"const PEDIDOS_URL = '[^'\n]*';", lambda _: f"const PEDIDOS_URL = '{PEDIDOS_URL}';", texto)
    tienda.write_text(texto, encoding="utf-8")


def actualizar_itemlist(todos: list[dict]) -> None:
    indice = ROOT / "index.html"
    contenido = indice.read_text(encoding="utf-8")
    elementos = [
        {"@type": "ListItem", "position": i + 1, "url": f"{BASE_URL}producto/{p['slug']}/", "name": p["nombre"]}
        for i, p in enumerate(activos(todos))
    ]
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": "Catálogo S3D", "numberOfItems": len(elementos), "itemListElement": elementos}
    bloque = f'{ITEMLIST_START}\n    <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n    {ITEMLIST_END}'
    if ITEMLIST_START in contenido:
        contenido = re.sub(re.escape(ITEMLIST_START) + r".*?" + re.escape(ITEMLIST_END), lambda _: bloque, contenido, flags=re.S)
    else:
        contenido = contenido.replace("    <link rel=\"preload\" href=\"assets/fonts/manrope-latin.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>", f"    {bloque}\n\n    <link rel=\"preload\" href=\"assets/fonts/manrope-latin.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>", 1)
    indice.write_text(contenido, encoding="utf-8")


# Fecha de la política de privacidad: actualizarla a mano cuando cambie el texto (así la generación es reproducible).
FECHA_PRIVACIDAD = "15/10/2026"

ORDEN_CATEGORIAS = ["Muñecos Coleccionables", "Adornos", "Holders", "Barbería", "Mascota", "Llaveros", "Line Art", "Iluminación LED 3D", "Dummy", "Accesorios"]


def pagina_estatica(titulo: str, descripcion: str, base: str, canonical: str | None, cuerpo: str, robots: str | None = None, base_href: str | None = None) -> str:
    """Página informativa con la misma cabecera y pie que el resto del sitio."""
    etiqueta_base = f'    <base href="{esc(base_href)}">\n' if base_href else ""
    meta_robots = f'    <meta name="robots" content="{robots}">\n' if robots else ""
    enlace_canonico = f'    <link rel="canonical" href="{esc(canonical)}">\n' if canonical else ""
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
{etiqueta_base}    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{esc(titulo)}</title>
    <meta name="description" content="{esc(descripcion)}">
{meta_robots}{enlace_canonico}    <meta name="theme-color" content="#002244">
    <link rel="icon" href="{base}assets/logo-96.webp" type="image/webp">
    <link rel="apple-touch-icon" href="{base}assets/logo-192.png">
    <link rel="preload" href="{base}assets/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="{base}assets/fonts/spacegrotesk-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="{base}fonts.css?v=1">
    <link rel="stylesheet" href="{base}chrome.css?v=6">
    <link rel="stylesheet" href="{base}paginas.css?v=1">
</head>
<body>
{sangrar(chrome_superior(base))}
    <main class="pg-main">
{cuerpo}
    </main>

{sangrar(chrome_pie(base))}
    <script src="{base}chrome.js?v=1" defer></script>
    <script src="{base}analytics.js?v=5" defer></script>
</body>
</html>
"""


def pagina_privacidad() -> str:
    hoy = FECHA_PRIVACIDAD
    # Solo cuando el registro de pedidos está encendido (config.json «pedidosUrl»).
    registro = """

        <h2>Registro de tus pedidos</h2>
        <p>Cuando pulsas &laquo;Comprar&raquo;, envías tu lista de pedido o pides una cotización, guardamos en una hoja de cálculo de S3D (Google) un <strong>código de pedido</strong> (por ejemplo, S3D-7K4Q2), los productos, cantidades, colores o medidas elegidos, el total referencial, la página desde la que pediste y la fecha. Ese mismo código aparece al inicio de tu mensaje de WhatsApp para que podamos darte seguimiento. <strong>No guardamos tu nombre ni tu teléfono</strong> en ese registro.</p>""" if PEDIDOS_URL else ""
    tercero_google = """
            <li><strong>Google (Apps Script y Hojas de cálculo)</strong>: guarda el registro de pedidos descrito arriba.</li>""" if PEDIDOS_URL else ""
    cuerpo = f"""        <p class="pg-kicker">Transparencia</p>
        <h1>Política de privacidad</h1>
        <p class="pg-actualizado">Última actualización: {hoy}</p>
        <p>En S3D queremos que sepas con claridad qué información se usa cuando visitas este sitio y cuando nos escribes para hacer un pedido.</p>

        <h2>Qué medimos</h2>
        <p>Usamos <strong>Umami</strong>, un servicio de estadísticas pensado para la privacidad, para saber de forma <strong>anónima y agregada</strong> cuántas personas visitan el sitio y qué productos o categorías despiertan más interés (por ejemplo, qué producto se abre más o qué se busca). Esta medición:</p>
        <ul>
            <li>no usa cookies de seguimiento ni de publicidad;</li>
            <li>no identifica a las personas ni guarda tu nombre, correo o teléfono;</li>
            <li>respeta la opción &laquo;No rastrear&raquo; de tu navegador.</li>
        </ul>

        <h2>Qué se guarda solo en tu dispositivo</h2>
        <p>Tu lista de pedido y tus productos favoritos se guardan únicamente en tu navegador (almacenamiento local). No se envían a ningún servidor nuestro y puedes borrarlos cuando quieras limpiando los datos del sitio.</p>

        <h2>Cuando nos escribes por WhatsApp o correo</h2>
        <p>Al pulsar &laquo;Comprar&raquo;, &laquo;Pedir por WhatsApp&raquo; o enviar tu lista de pedido, se abre WhatsApp con un mensaje ya redactado. Desde ese momento la conversación se rige por las condiciones de WhatsApp. Usamos los datos que nos compartas (por ejemplo, tu nombre, tu número y tu dirección de entrega) <strong>solo para atender tu pedido</strong> y no los cedemos a terceros.</p>{registro}

        <h2>Servicios de terceros</h2>
        <ul>
            <li><strong>GitHub Pages</strong>: aloja este sitio.</li>
            <li><strong>Google Maps</strong>: el mapa de nuestra ubicación solo se carga si pulsas «Ver el mapa del taller»; a partir de ese momento Google puede recibir datos técnicos de tu visita.</li>
            <li><strong>Umami</strong>: estadísticas anónimas, como se explica arriba.</li>{tercero_google}
        </ul>

        <h2>Tus derechos y contacto</h2>
        <p>Si quieres consultar, corregir o pedir que eliminemos datos que nos hayas compartido por WhatsApp o correo, escríbenos a <a href="mailto:ventas.s3d@gmail.com">ventas.s3d@gmail.com</a> o por <a href="https://api.whatsapp.com/send?phone={WHATSAPP}" target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>
        <p class="pg-aviso">Este texto es informativo y puede actualizarse. Si el negocio crece o empieza a recopilar más datos, conviene revisarlo con asesoría legal.</p>"""
    return pagina_estatica("Política de privacidad | S3D", "Qué mide S3D en este sitio (estadísticas anónimas, sin cookies), qué se guarda en tu dispositivo y cómo usamos los datos que compartes por WhatsApp.", "../", f"{BASE_URL}privacidad/", cuerpo)


def pagina_404(todos: list[dict]) -> str:
    destacados = sorted([p for p in activos(todos) if p.get("badge") == "Top Ventas"], key=lambda p: p.get("heroOrden", 10**6))[:4]
    cats = "\n".join(f'            <a class="pg-chip" href="./?categoria={quote(c)}#catalogo">{esc(c)}</a>' for c in ORDEN_CATEGORIAS)
    tarjetas = "\n".join(
        f"""            <a class="pg-card" href="producto/{esc(p['slug'])}/">
                <picture><source srcset="{esc(url_ruta(avif(miniatura(imagen_principal(p)))))}" type="image/avif"><img src="{esc(url_ruta(miniatura(imagen_principal(p))))}" alt="" loading="lazy" decoding="async"></picture>
                <strong>{esc(p['nombre'])}</strong>
                <span>{esc(precio_txt(p))}</span>
            </a>"""
        for p in destacados
    )
    wa = f"https://api.whatsapp.com/send?phone={WHATSAPP}&text={quote('Hola, no encontré lo que buscaba en la web de S3D y quisiera consultar.', safe='')}"
    cuerpo = f"""        <p class="pg-kicker">Error 404</p>
        <h1>Esta página no existe</h1>
        <p>El enlace puede estar mal escrito o el producto ya no está disponible. Prueba buscando lo que necesitas:</p>
        <form class="pg-buscar" action="./" method="get" role="search">
            <input type="search" name="buscar" placeholder="Buscar modelo, colección..." aria-label="Buscar productos">
            <button class="pg-btn" type="submit">Buscar</button>
        </form>

        <h2>Explora por categoría</h2>
        <div class="pg-chips">
{cats}
        </div>

        <h2>Lo más vendido</h2>
        <div class="pg-grid">
{tarjetas}
        </div>

        <p style="margin-top:2rem">¿No encuentras lo que buscas? <a href="{esc(wa)}" target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a> y te ayudamos.</p>"""
    # Se sirve en cualquier ruta inexistente: <base> hace que las rutas relativas apunten siempre a la raíz del sitio.
    return pagina_estatica("Página no encontrada | S3D", "La página que buscas no existe. Explora el catálogo de S3D.", "", None, cuerpo, robots="noindex", base_href=BASE_URL)


def escribir_sitemap(todos: list[dict]) -> None:
    """Sitemap sin <lastmod>: es opcional y una fecha inexacta es peor que no ponerla; así la generación es reproducible."""
    filas = [f"  <url>\n    <loc>{BASE_URL}</loc>\n    <priority>1.0</priority>\n  </url>"]
    filas.append(f"  <url>\n    <loc>{BASE_URL}privacidad/</loc>\n    <priority>0.3</priority>\n  </url>")
    filas += [f"  <url>\n    <loc>{BASE_URL}producto/{p['slug']}/</loc>\n    <priority>0.7</priority>\n  </url>" for p in todos]
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(filas) + "\n</urlset>\n",
        encoding="utf-8",
    )


def main() -> None:
    ruta_json = ROOT / "productos.json"
    productos = json.loads(ruta_json.read_text(encoding="utf-8"))

    base = [slugify(p["nombre"]) for p in productos]
    for p, b in zip(productos, base):
        # Los nombres repetidos (p. ej. DUMMY) se distinguen con el id.
        p["slug"] = p.get("slug") or (b if base.count(b) == 1 else f"{b}-{p['id']}")
    errores = validar(productos)
    if errores:
        print("No se generó nada; corrige estos datos:\n" + "\n".join(f"  ✗ {e}" for e in errores))
        sys.exit(1)
    productos.sort(key=lambda p: p["orden"])   # sort estable: a igual orden, se respeta el orden del archivo
    ruta_json.write_text(json.dumps(productos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    for p in productos:
        carpeta = OUT_DIR / p["slug"]
        carpeta.mkdir(parents=True)
        (carpeta / "index.html").write_text(pagina(p, productos), encoding="utf-8")

    (ROOT / "privacidad").mkdir(exist_ok=True)
    (ROOT / "privacidad" / "index.html").write_text(pagina_privacidad(), encoding="utf-8")
    (ROOT / "404.html").write_text(pagina_404(productos), encoding="utf-8")

    actualizar_itemlist(productos)
    actualizar_chrome_indice()
    sincronizar_contacto()
    escribir_sitemap(productos)
    print(f"{len(productos)} páginas generadas en {OUT_DIR.relative_to(ROOT)}/, sitemap.xml e ItemList actualizados")


if __name__ == "__main__":
    main()
