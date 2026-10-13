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
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://tygersolis.github.io/S3D-Catalogo/"
WHATSAPP = "51955107609"
OUT_DIR = ROOT / "producto"
ITEMLIST_START = "<!-- ITEMLIST:START -->"
ITEMLIST_END = "<!-- ITEMLIST:END -->"

esc = html.escape

CHROME_DIR = ROOT / "scripts" / "chrome"
CHROME_MARCAS = {
    "top": ("<!-- CHROME-TOP:START -->", "<!-- CHROME-TOP:END -->"),
    "pie": ("<!-- CHROME-FOOTER:START -->", "<!-- CHROME-FOOTER:END -->"),
}


def plantilla(nombre: str, base: str) -> str:
    """Lee scripts/chrome/<nombre>.html y resuelve {{base}} (prefijo relativo a la raíz del sitio)."""
    return (CHROME_DIR / f"{nombre}.html").read_text(encoding="utf-8").replace("{{base}}", base)


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


def avif(ruta: str) -> str:
    return re.sub(r"\.(webp|png|jpe?g)$", ".avif", ruta, flags=re.I)


def precio_txt(p: dict) -> str:
    return "Cotizar" if p.get("requiereCotizacion") else f"S/ {p['precio']:.2f}"


def mensaje_whatsapp(p: dict, color: str | None, enlace: str) -> str:
    col = f" (Color: {color})" if color else ""
    if p.get("requiereCotizacion"):
        base = f"Hola, me interesa cotizar el modelo 3D: {p['nombre']}{col}."
    else:
        base = f"Hola, me interesa el modelo 3D: {p['nombre']}{col} - Precio: S/ {p['precio']:.2f} (incluye IGV)."
    return f"{base} Es un producto elaborado a pedido y deseo consultar el costo de envío.\n{enlace}"


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
    mismos = [q for q in todos if q["categoria"] == p["categoria"] and q["id"] != p["id"]]
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
    fecha_attr = f' data-fecha-alta="{esc(p["fechaAlta"])}"' if p.get("fechaAlta") else ""

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
    <link rel="stylesheet" href="../../chrome.css?v=3">
    <link rel="stylesheet" href="../../producto.css?v=8">
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

        <article class="pp-product" data-producto="{esc(p['nombre'])}"{fecha_attr}>
            <div class="pp-gallery">
                <div class="pp-stage" id="pp-stage" role="button" tabindex="0" aria-label="Ampliar imagen en alta resolución">
                    <span class="pp-ribbon" data-new hidden aria-hidden="true"><span>Nuevo</span></span>
                    <picture id="pp-picture"><source id="pp-main-src" srcset="{esc(url_ruta(avif(principal), '../../'))}" type="image/avif"><img id="pp-main-img" src="{esc(url_ruta(principal, '../../'))}" alt="{esc(p['nombre'])}" fetchpriority="high" decoding="async"></picture>
{video}
                </div>
{miniaturas}
            </div>

            <div class="pp-info">
                <p class="pp-new" data-new hidden>Producto nuevo en S3D</p>
                <p class="pp-kicker">{esc(p.get('coleccion') or p['categoria'])}</p>
                <h1>{esc(p['nombre'])}</h1>
                <div class="pp-price">{precio_html}</div>
                <p class="pp-desc">{esc(p['descripcion'].strip())}</p>
                <dl class="pp-facts">
{ficha}
                </dl>
                <a id="pp-buy" class="pp-buy" data-producto="{esc(p['nombre'])}" href="{esc(url_whatsapp(p, color0, url))}" target="_blank" rel="noopener noreferrer">{boton}</a>
                <ul class="pp-perks">
                    <li>Todos los productos se elaboran a pedido en nuestro taller</li>
                    <li>El precio corresponde a la medida publicada; si lo quieres más grande o más pequeño, el costo varía</li>
                    <li>Personalizable: medidas, colores y detalles. Escríbenos y lo evaluamos</li>
                    <li>Envíos a todo el Perú, costo según tu ubicación</li>
                </ul>
            </div>
        </article>

{bloque_rel}
    </main>

{sangrar(chrome_pie("../../"))}

    <script src="../../chrome.js?v=1" defer></script>
    <script src="../../analytics.js?v=3" defer></script>
    <script src="../../producto.js?v=7" defer></script>
</body>
</html>
"""


def actualizar_chrome_indice() -> None:
    """Mantiene la cabecera y el pie de index.html idénticos a los de las fichas (misma plantilla)."""
    indice = ROOT / "index.html"
    contenido = indice.read_text(encoding="utf-8")
    bloques = {"top": sangrar(chrome_superior("")), "pie": sangrar(chrome_pie(""))}
    for clave, (inicio, fin) in CHROME_MARCAS.items():
        nuevo = f"    {inicio}\n{bloques[clave]}    {fin}"
        if inicio in contenido:
            contenido = re.sub(re.escape(inicio) + r".*?" + re.escape(fin), lambda _: nuevo.strip(), contenido, flags=re.S)
        else:
            if clave == "top":
                a = contenido.index('    <div class="announcement-bar')
                b = contenido.index("</nav>", a) + len("</nav>\n")
            else:
                a = contenido.index('    <footer id="contacto"')
                b = contenido.index("</footer>", a) + len("</footer>")
            contenido = contenido[:a] + nuevo + ("\n" if clave == "top" else "") + contenido[b:]
    indice.write_text(contenido, encoding="utf-8")


def actualizar_itemlist(todos: list[dict]) -> None:
    indice = ROOT / "index.html"
    contenido = indice.read_text(encoding="utf-8")
    elementos = [
        {"@type": "ListItem", "position": i + 1, "url": f"{BASE_URL}producto/{p['slug']}/", "name": p["nombre"]}
        for i, p in enumerate(todos)
    ]
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": "Catálogo S3D", "numberOfItems": len(elementos), "itemListElement": elementos}
    bloque = f'{ITEMLIST_START}\n    <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n    {ITEMLIST_END}'
    if ITEMLIST_START in contenido:
        contenido = re.sub(re.escape(ITEMLIST_START) + r".*?" + re.escape(ITEMLIST_END), lambda _: bloque, contenido, flags=re.S)
    else:
        contenido = contenido.replace("    <link rel=\"preload\" href=\"assets/fonts/manrope-latin.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>", f"    {bloque}\n\n    <link rel=\"preload\" href=\"assets/fonts/manrope-latin.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>", 1)
    indice.write_text(contenido, encoding="utf-8")


def escribir_sitemap(todos: list[dict]) -> None:
    hoy = date.today().isoformat()
    filas = [f"  <url>\n    <loc>{BASE_URL}</loc>\n    <lastmod>{hoy}</lastmod>\n    <priority>1.0</priority>\n  </url>"]
    filas += [f"  <url>\n    <loc>{BASE_URL}producto/{p['slug']}/</loc>\n    <lastmod>{hoy}</lastmod>\n    <priority>0.7</priority>\n  </url>" for p in todos]
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
    slugs = [p["slug"] for p in productos]
    assert len(set(slugs)) == len(slugs), "slugs duplicados"
    ruta_json.write_text(json.dumps(productos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    for p in productos:
        carpeta = OUT_DIR / p["slug"]
        carpeta.mkdir(parents=True)
        (carpeta / "index.html").write_text(pagina(p, productos), encoding="utf-8")

    actualizar_itemlist(productos)
    actualizar_chrome_indice()
    escribir_sitemap(productos)
    print(f"{len(productos)} páginas generadas en {OUT_DIR.relative_to(ROOT)}/, sitemap.xml e ItemList actualizados")


if __name__ == "__main__":
    main()
