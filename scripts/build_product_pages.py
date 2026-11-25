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
# Temporada (p. ej. Navidad): ambientación y categoría destacada entre «desde» y «hasta» (ambas incluidas).
# Las páginas llevan las fechas y temporada.js decide en el navegador, así nada depende del día en que se genera.
# Para quitarla del todo, se borra el bloque «temporada» de config.json y se regenera.
TEMPORADA = CONFIG.get("temporada")
if TEMPORADA:
    assert re.fullmatch(r"[a-z0-9-]+", TEMPORADA["id"]), "temporada.id: solo minúsculas, números y guiones"
    assert date.fromisoformat(TEMPORADA["desde"]) <= date.fromisoformat(TEMPORADA["hasta"]), "temporada: «desde» es posterior a «hasta»"
    assert TEMPORADA["titulo"].strip() and TEMPORADA["categoria"].strip() and TEMPORADA["aviso"].strip(), "temporada: faltan titulo, categoria o aviso"
HAY_PRODUCTOS_TEMPORADA = False   # lo fija main(): el enlace «Ver colección» solo aparece si la categoría tiene productos
# Promesa visible en la portada y las fichas, costos de envío referenciales y rangos de la guía de regalos.
PLAZO = CONFIG["promesa"]["plazo"]
ENVIOS = CONFIG["envios"]
assert ENVIOS["zonas"] and all(z["zona"].strip() and isinstance(z["precio"], (int, float)) and z["precio"] >= 0 for z in ENVIOS["zonas"]), "envios.zonas inválidas en config.json"
RANGOS = CONFIG["rangosPrecio"]
assert all(re.fullmatch(r"[a-z0-9-]+", r["id"]) and r["min"] <= r["max"] for r in RANGOS), "rangosPrecio inválidos en config.json"
assert all(a["max"] < b["min"] for a, b in zip(RANGOS, RANGOS[1:])), "rangosPrecio: los rangos se superponen o no van en orden"
# Píxel de Meta (anuncios): vacío = apagado (sin aviso de cookies ni orígenes de Facebook en la CSP).
META_PIXEL = CONFIG.get("metaPixel", "")
assert re.fullmatch(r"(\d{10,20})?", META_PIXEL), "metaPixel inválido en config.json (solo el número del píxel)"
OUT_DIR = ROOT / "producto"
# Política de seguridad (CSP) de todas las páginas: solo se ejecuta JavaScript de archivos propios y de Umami
# (sin código en línea ni atributos onclick). Si se añade un servicio externo, hay que permitir aquí su origen.
# Con el píxel de Meta encendido se permite además Facebook (solo se carga si el visitante acepta las cookies).
FACEBOOK = " https://connect.facebook.net https://www.facebook.com" if META_PIXEL else ""
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://cloud.umami.is" + (" https://connect.facebook.net" if META_PIXEL else ""),
    "connect-src 'self' https://cloud.umami.is https://gateway.umami.is https://script.google.com https://script.googleusercontent.com" + FACEBOOK,
    "img-src 'self' data:" + (" https://www.facebook.com" if META_PIXEL else ""),
    "media-src 'self'",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",   # hay atributos style y estilos que pone el JavaScript
    "frame-src https://www.google.com https://maps.google.com",   # mapa del taller (se carga al pulsar)
    "object-src 'none'",
    "base-uri 'self' https://tygersolis.github.io",   # 404.html usa <base href> con la URL publicada
    "form-action 'self'",
])
META_CSP = f'<meta http-equiv="Content-Security-Policy" content="{CSP}">'
ITEMLIST_START = "<!-- ITEMLIST:START -->"
ITEMLIST_END = "<!-- ITEMLIST:END -->"

esc = html.escape

CHROME_DIR = ROOT / "scripts" / "chrome"
CHROME_MARCAS = {
    "top": ("<!-- CHROME-TOP:START -->", "<!-- CHROME-TOP:END -->"),
    "pie": ("<!-- CHROME-FOOTER:START -->", "<!-- CHROME-FOOTER:END -->"),
    "pagos": ("<!-- CHROME-PAGOS:START -->", "<!-- CHROME-PAGOS:END -->"),
    "promesa": ("<!-- CHROME-PROMESA:START -->", "<!-- CHROME-PROMESA:END -->"),
    "envios": ("<!-- CHROME-ENVIOS:START -->", "<!-- CHROME-ENVIOS:END -->"),
    "rangos": ("<!-- RANGOS:START -->", "<!-- RANGOS:END -->"),
}


def plantilla(nombre: str, base: str) -> str:
    """Lee scripts/chrome/<nombre>.html y resuelve {{base}} (prefijo relativo a la raíz del sitio) y los datos de contacto."""
    texto = (CHROME_DIR / f"{nombre}.html").read_text(encoding="utf-8")
    texto = texto.replace("{{temporada_aviso}}", aviso_temporada(base))
    return texto.replace("{{base}}", base).replace("{{whatsapp}}", WHATSAPP).replace("{{whatsapp_visible}}", WHATSAPP_VISIBLE)


def aviso_temporada(base: str) -> str:
    """Mensaje de la barra de aviso durante la temporada (temporada.js decide si se ve)."""
    if not TEMPORADA:
        return ""
    aviso = f'\n    <span class="con-temporada aviso-temporada"><svg class="ico" aria-hidden="true"><use href="#i-tree"/></svg>{esc(TEMPORADA["aviso"])}</span>'
    if HAY_PRODUCTOS_TEMPORADA:
        aviso += f'\n    <a class="con-temporada" href="{base}?categoria={quote(TEMPORADA["categoria"])}#catalogo">Ver colección</a>'
    return aviso


def html_temporada() -> str:
    """Atributos de <html> con la temporada; temporada.js los lee para activar la ambientación."""
    if not TEMPORADA:
        return ""
    return "".join(f' data-temporada{sufijo}="{esc(TEMPORADA[clave])}"' for sufijo, clave in
                   (("", "id"), ("-desde", "desde"), ("-hasta", "hasta"), ("-categoria", "categoria"), ("-titulo", "titulo")))


def script_temporada(base: str) -> str:
    """temporada.js va en <head> sin defer: pone la clase de temporada antes de pintar."""
    return f'\n    <script src="{base}temporada.js?v=1"></script>' if TEMPORADA else ""


def es_de_temporada(p: dict) -> bool:
    return bool(TEMPORADA) and p.get("categoria") == TEMPORADA["categoria"]


def chrome_superior(base: str) -> str:
    """Íconos + barra de aviso + navegación, idénticos en la portada y en las fichas."""
    return plantilla("sprite", base) + "\n" + plantilla("header", base)


def chrome_pie(base: str) -> str:
    return plantilla("footer", base)


def bloque_promesa(base: str) -> str:
    """Franja de confianza (portada y fichas): taller propio, plazo, envíos y formas de pago."""
    return f"""<ul class="promesa" aria-label="Por qué comprar en S3D">
    <li><svg class="ico" aria-hidden="true"><use href="#i-printer"/></svg><span><strong>Hecho en Lima</strong> en nuestro propio taller</span></li>
    <li><svg class="ico" aria-hidden="true"><use href="#i-package-check"/></svg><span><strong>{esc(PLAZO)}</strong> elaborado a pedido</span></li>
    <li><svg class="ico" aria-hidden="true"><use href="#i-send"/></svg><span><strong>Envíos a todo el Perú</strong> o recojo gratis</span></li>
    <li><svg class="ico" aria-hidden="true"><use href="#i-smartphone"/></svg><span><strong>Paga con Yape o Plin</strong> transferencia o efectivo</span></li>
</ul>
"""


def precio_envio(zona: dict) -> str:
    return "Gratis" if zona["precio"] == 0 else f"desde S/ {zona['precio']:.2f}"


def tabla_envios() -> str:
    filas = "\n".join(
        f"""        <tr><th scope="row"><strong>{esc(z['zona'])}</strong>{f'<span>{esc(z["detalle"])}</span>' if z.get('detalle') else ''}</th><td>{precio_envio(z)}</td></tr>"""
        for z in ENVIOS["zonas"]
    )
    return f"""<table class="envios-tabla">
    <thead><tr><th scope="col">Entrega</th><th scope="col">Costo</th></tr></thead>
    <tbody>
{filas}
    </tbody>
</table>
<p class="envios-nota">{esc(ENVIOS['nota'])}</p>
"""


def resumen_envios() -> str:
    """«Envío desde S/ 10 · recojo gratis» para el título desplegable de la ficha."""
    pagados = [z["precio"] for z in ENVIOS["zonas"] if z["precio"] > 0]
    partes = [f"desde S/ {min(pagados):.2f}"] if pagados else []
    if any(z["precio"] == 0 for z in ENVIOS["zonas"]):
        partes.append("recojo gratis")
    return " · ".join(partes)


def bloque_envios_portada() -> str:
    return f"""<div class="envios" id="envios">
    <h3 class="envios-titulo"><svg class="ico" aria-hidden="true"><use href="#i-send"/></svg>Costos de envío</h3>
{sangrar(tabla_envios())}</div>
"""


def opciones_rangos() -> str:
    """Opciones del filtro de precio del catálogo (catalogo.js lee data-min/data-max)."""
    return "\n".join(f'<option value="{esc(r["id"])}" data-min="{r["min"]}" data-max="{r["max"]}">{esc(r["titulo"])}</option>' for r in RANGOS) + "\n"


def rango_de(p: dict) -> dict | None:
    """Rango de precio del producto según su precio más bajo (los «a cotizar» no tienen rango)."""
    if p.get("requiereCotizacion") or not p.get("precio"):
        return None
    minimo = precios(p)[0]
    return next((r for r in RANGOS if r["min"] <= minimo <= r["max"]), None)


def medida_cm(medida: str | None) -> float | None:
    """Lado más largo en cm de textos como «25CM», «24,5 cm», «23X23X4CM» o «20/28/16CM» (None si no hay cm)."""
    if not medida or not re.search(r"cm", medida, re.I):
        return None
    numeros = [float(n.replace(",", ".")) for n in re.findall(r"\d+(?:[.,]\d+)?", medida)]
    return max(numeros) if numeros else None


CELULAR_CM = 15


def dibujo_tamano(medida: str | None) -> str:
    """Comparación de tamaño (SVG, sin JavaScript): la pieza junto a un celular de ~15 cm, a la misma escala."""
    cm = medida_cm(medida)
    if not cm or cm > 200:
        return ""
    alto = 120                          # alto del dibujo para la mayor de las dos medidas
    escala = alto / max(cm, CELULAR_CM)
    cel_alto, cel_ancho = CELULAR_CM * escala, 7.2 * escala
    pieza_alto, pieza_ancho = cm * escala, max(min(cm * escala * .7, 90), 14)
    base_y = alto + 22
    x_cel, x_pieza = 30, 30 + cel_ancho + 34
    ancho_total = x_pieza + pieza_ancho + 30
    radio = max(min(cel_ancho * .14, 6), 1.5)
    txt = lambda v: f"{v:g}".replace(".", ",")
    etiqueta = f"{txt(cm)} cm"
    return f"""                <figure class="pp-tamano">
                    <svg viewBox="0 0 {ancho_total:.0f} {base_y + 26:.0f}" role="img" aria-label="Referencia de tamaño: la pieza mide {etiqueta} en su lado más largo y un celular mide unos {CELULAR_CM} cm">
                        <line x1="10" y1="{base_y:.1f}" x2="{ancho_total - 10:.0f}" y2="{base_y:.1f}" class="pp-tamano-suelo"/>
                        <rect x="{x_cel}" y="{base_y - cel_alto:.1f}" width="{cel_ancho:.1f}" height="{cel_alto:.1f}" rx="{radio:.1f}" class="pp-tamano-celular"/>
                        <rect x="{x_cel + cel_ancho * .1:.1f}" y="{base_y - cel_alto * .93:.1f}" width="{cel_ancho * .8:.1f}" height="{cel_alto * .86:.1f}" rx="{radio * .5:.1f}" class="pp-tamano-pantalla"/>
                        <rect x="{x_pieza:.1f}" y="{base_y - pieza_alto:.1f}" width="{pieza_ancho:.1f}" height="{pieza_alto:.1f}" rx="{min(6, pieza_ancho / 4):.1f}" class="pp-tamano-pieza"/>
                        <text x="{x_pieza + pieza_ancho / 2:.1f}" y="{base_y - pieza_alto - 6:.1f}" text-anchor="middle" class="pp-tamano-cifra">{etiqueta}</text>
                        <text x="{x_cel + cel_ancho / 2:.1f}" y="{base_y + 17:.1f}" text-anchor="middle" class="pp-tamano-nombre">Celular</text>
                        <text x="{x_pieza + pieza_ancho / 2:.1f}" y="{base_y + 17:.1f}" text-anchor="middle" class="pp-tamano-nombre">Tu pieza</text>
                    </svg>
                    <figcaption>Tamaño real comparado con un celular (~{CELULAR_CM} cm). La pieza mide <strong>{etiqueta}</strong> en su lado más largo.</figcaption>
                </figure>"""


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


def precio_de(p: dict, color: str | None = None) -> float:
    """Precio del producto o, si el color elegido tiene precio propio (p. ej. un árbol con luz LED), el de ese color."""
    c = next((c for c in p.get("colores") or [] if c["nombre"] == color), None)
    return c["precio"] if c and c.get("precio") is not None else p["precio"]


def precios(p: dict) -> list[float]:
    """Precios distintos del producto (más de uno si algún color tiene precio propio), de menor a mayor."""
    return sorted({precio_de(p, c["nombre"]) for c in p.get("colores") or []} or {p["precio"]})


def precio_txt(p: dict) -> str:
    if p.get("requiereCotizacion"):
        return "Cotizar"
    lista = precios(p)
    return f"Desde S/ {lista[0]:.2f}" if len(lista) > 1 else f"S/ {lista[0]:.2f}"


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
        base = f"Hola, me interesa el modelo 3D: {p['nombre']}{col} - Precio: S/ {precio_de(p, color):.2f} (incluye IGV)."
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
        lista = precios(p)
        rango = f"S/ {lista[0]:.2f} a S/ {lista[-1]:.2f} según el color" if len(lista) > 1 else f"S/ {lista[0]:.2f}"
        partes.append(f"Precio {rango} (incluye IGV).")
    partes.append("Elaborado a pedido en S3D; medidas y colores personalizables.")
    texto = " ".join(partes)
    return texto if len(texto) <= 300 else texto[:297].rstrip() + "…"


def fotos_extra(p: dict) -> list[str]:
    """Fotos de un producto con colores que no son la foto de ningún color (se muestran como miniaturas aparte)."""
    if not p.get("colores"):
        return []
    de_color = {c["img"] for c in p["colores"]}
    return [s for s in dict.fromkeys(p["imagenes"]) if s not in de_color]


def json_ld_producto(p: dict, url: str) -> str:
    imagenes = [BASE_URL + url_ruta(s) for s in dict.fromkeys([g["src"] for g in galeria(p)] + fotos_extra(p))]
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
        lista = precios(p)
        datos["offers"] = {
            "@type": "Offer",
            "url": url,
            "priceCurrency": "PEN",
            "price": f"{lista[0]:.2f}",
            "itemCondition": "https://schema.org/NewCondition",
            "availability": DISPONIBILIDAD[p.get("disponibilidad", "A pedido")][2],
            "seller": {"@type": "Organization", "name": "S3D"},
        }
        if len(lista) > 1:   # precio según el color: rango de precios
            datos["offers"] = {**datos["offers"], "@type": "AggregateOffer", "lowPrice": f"{lista[0]:.2f}",
                               "highPrice": f"{lista[-1]:.2f}", "offerCount": len(p["colores"])}
            del datos["offers"]["price"]
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
    """«También te puede gustar»: los siguientes de la misma categoría (dando la vuelta al final del catálogo) y, si
    no alcanzan, los de otras categorías con el precio más parecido."""
    mismos = [q for q in activos(todos) if q["categoria"] == p["categoria"] and q["id"] != p["id"]]
    idx = next((i for i, q in enumerate(todos) if q["id"] == p["id"]), 0)
    orden = sorted(mismos, key=lambda q: (todos.index(q) - idx) % len(todos))[:n]
    if len(orden) < n:
        ref = precios(p)[0] if p.get("precio") and not p.get("requiereCotizacion") else None
        otros = [q for q in activos(todos) if q["categoria"] != p["categoria"] and q["id"] != p["id"]]
        if ref is not None:
            otros.sort(key=lambda q: abs(precios(q)[0] - ref) if q.get("precio") and not q.get("requiereCotizacion") else float("inf"))
        orden += otros[: n - len(orden)]
    return orden


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
            f"""                    <button type="button" class="pp-swatch{' is-active' if i == 0 else ''}" data-pp-color="{esc(c['nombre'])}" data-img="{esc(url_ruta(c['img'], '../../'))}" data-wa="{esc(url_whatsapp(p, c['nombre'], url))}" data-precio="{'' if p.get('requiereCotizacion') else f"{precio_de(p, c['nombre']):.2f}"}" style="background-color:{esc(c['hex'])}" aria-label="Color {esc(c['nombre'])}" aria-pressed="{'true' if i == 0 else 'false'}" title="{esc(c['nombre'])}"></button>"""
            for i, c in enumerate(p["colores"])
        )
        miniaturas = f"""                <div class="pp-colors" role="group" aria-label="Colores disponibles">
                    <p>Color: <strong id="pp-color-name">{esc(p['colores'][0]['nombre'])}</strong></p>
                    <div class="pp-swatches">
{botones}
                    </div>
                </div>"""
    if tiene_colores:
        # Con colores, las miniaturas solo aparecen si hay fotos extra o video: todas las fotos (la del color primero).
        con_miniaturas = bool(fotos_extra(p) or p.get("video"))
        medios = [{"src": s, "etiqueta": f"Foto {i + 1}"} for i, s in enumerate(dict.fromkeys([p["colores"][0]["img"]] + p["imagenes"]))]
    else:
        con_miniaturas = len(medios) > 1 or bool(p.get("video"))
    if con_miniaturas:
        thumbs = "\n".join(
            f"""                    <button type="button" class="pp-thumb{' is-active' if i == 0 else ''}" data-pp-thumb data-src="{esc(url_ruta(m['src'], '../../'))}" aria-label="Ver {esc(m['etiqueta'].lower())}"{' aria-current="true"' if i == 0 else ''}><picture><source srcset="{esc(url_ruta(avif(miniatura(m['src'])), '../../'))}" type="image/avif"><img src="{esc(url_ruta(miniatura(m['src']), '../../'))}" alt="" loading="lazy" decoding="async"></picture></button>"""
            for i, m in enumerate(medios)
        )
        if p.get("video"):
            thumbs += f"""
                    <button type="button" class="pp-thumb pp-thumb-video" data-pp-video aria-label="Ver video del producto"><span aria-hidden="true">▶</span></button>"""
        miniaturas += f"""{chr(10) if miniaturas else ""}                <div class="pp-thumbs" aria-label="Miniaturas">
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
    color0 = p["colores"][0]["nombre"] if tiene_colores else None
    precio_html = (
        '<span class="pp-price-main">Cotizar</span>'
        if p.get("requiereCotizacion")
        else f'<span class="pp-price-main"><small>S/</small> <span id="pp-price-value">{precio_de(p, color0):.2f}</span></span><span class="pp-price-note">Incluye IGV · {"según el color elegido" if len(precios(p)) > 1 else "según la medida publicada"}</span>'
    )
    boton = "Cotizar por WhatsApp" if p.get("requiereCotizacion") else "Comprar por WhatsApp"
    rel = relacionados(p, todos)
    bloque_rel = (
        f"""        <section class="pp-related" aria-labelledby="pp-related-title">
            <h2 id="pp-related-title">También te puede gustar</h2>
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
    marca_temporada = (
        f'\n                <p class="pp-temporada-tag con-temporada"><svg class="ico" aria-hidden="true"><use href="#i-tree"/></svg>{esc(TEMPORADA["titulo"])}</p>'
        if es_de_temporada(p) else ""
    )
    fecha_attr = f' data-fecha-alta="{esc(p["fechaAlta"])}"' if p.get("fechaAlta") else ""
    tamano = dibujo_tamano(p.get("medida"))
    tamano = tamano + "\n" if tamano else ""
    precio_barra = "A cotizar" if p.get("requiereCotizacion") else f"S/ {precio_de(p, color0):.2f}"
    etiqueta = DISPONIBILIDAD[p.get("disponibilidad", "A pedido")][1]
    clase_disp = "pp-disp-stock" if etiqueta == "En stock" else "pp-disp-agotado"
    etiqueta_disp = f'\n                <p class="pp-disp {clase_disp}">{esc(etiqueta)}</p>' if etiqueta else ""
    aviso_pausa = (
        '\n                <p class="pp-pausado" role="status">Este producto no está disponible en el catálogo por ahora. Escríbenos si te interesa o <a href="../../#catalogo">mira el catálogo</a>.</p>'
        if not p.get("activo", True) else ""
    )

    return f"""<!DOCTYPE html>
<html lang="es"{html_temporada()}>
<head>
    <meta charset="UTF-8">
    {META_CSP}{script_temporada("../../")}
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
    <link rel="stylesheet" href="../../chrome.css?v=9">
    <link rel="stylesheet" href="../../producto.css?v=12">
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

        <article class="pp-product{' pp-temporada' if es_de_temporada(p) else ''}" data-producto="{esc(p['nombre'])}" data-id="{p['id']}" data-slug="{esc(p['slug'])}" data-precio="{'' if p.get('requiereCotizacion') or not p.get('precio') else precio_de(p, color0)}" data-cotizar="{'1' if p.get('requiereCotizacion') or not p.get('precio') else ''}" data-medida="{esc(p.get('medida') or '')}" data-imagen="{esc(miniatura(imagen_principal(p)))}" data-precio-txt="{esc(precio_txt(p))}" data-meta-tipo="{'product_group' if tiene_colores else 'product'}"{fecha_attr}>
            <div class="pp-gallery">
                <div class="pp-stage" id="pp-stage" role="button" tabindex="0" aria-label="Ampliar imagen en alta resolución">
                    <span class="pp-ribbon" data-new hidden aria-hidden="true"><span>Nuevo</span></span>
                    <picture id="pp-picture"><source data-md media="(max-width: 859px)" srcset="{esc(url_ruta(avif(nivel_medio(principal)), '../../'))}" type="image/avif"><source data-md media="(max-width: 859px)" srcset="{esc(url_ruta(nivel_medio(principal), '../../'))}" type="image/webp"><source id="pp-main-src" srcset="{esc(url_ruta(avif(principal), '../../'))}" type="image/avif"><img id="pp-main-img" src="{esc(url_ruta(principal, '../../'))}" alt="{esc(p['nombre'])}" fetchpriority="high" decoding="async"></picture>
{video}
                </div>
{miniaturas}
            </div>

            <div class="pp-info">
                <p class="pp-new" data-new hidden>Producto nuevo en S3D</p>{marca_temporada}
                <p class="pp-kicker">{esc(p.get('coleccion') or p['categoria'])}</p>
                <h1>{esc(p['nombre'])}</h1>
                <div class="pp-price">{precio_html}</div>{etiqueta_disp}{aviso_pausa}
{sangrar(bloque_promesa("../../"), 16)}                <p class="pp-desc">{esc(p['descripcion'].strip())}</p>
                <dl class="pp-facts">
{ficha}
                </dl>
{tamano}                <a id="pp-buy" class="pp-buy" data-producto="{esc(p['nombre'])}" href="{esc(url_whatsapp(p, color0, url))}" target="_blank" rel="noopener noreferrer">{boton}</a>
                <div class="pp-acciones">
                    <button type="button" class="pp-add" id="pp-add"><svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg><span>Añadir al pedido</span></button>
                    <button type="button" class="pp-icono" id="pp-fav" aria-pressed="false" aria-label="Guardar en favoritos" title="Guardar en favoritos"><svg class="ico" aria-hidden="true"><use href="#i-heart"/></svg></button>
                    <button type="button" class="pp-icono" id="pp-share" aria-label="Compartir este producto" title="Compartir"><svg class="ico" aria-hidden="true"><use href="#i-share-2"/></svg></button>
                </div>
{sangrar(plantilla("pagos", "../../"), 16)}                <ul class="pp-perks">
                    <li>Todos los productos se elaboran a pedido en nuestro taller</li>
                    <li>El precio corresponde a la medida publicada; si lo quieres más grande o más pequeño, el costo varía</li>
                    <li>Personalizable: medidas, colores y detalles. Escríbenos y lo evaluamos</li>
                </ul>
                <details class="pp-envios">
                    <summary><svg class="ico" aria-hidden="true"><use href="#i-send"/></svg><span>Costos de envío <small>{esc(resumen_envios())}</small></span><svg class="ico pp-flecha" aria-hidden="true"><use href="#i-chevron-down"/></svg></summary>
{sangrar(tabla_envios(), 20)}                </details>
{cotizador}
            </div>
        </article>

{bloque_rel}
        <section class="pp-related pp-vistos" id="pp-vistos" aria-labelledby="pp-vistos-title" hidden>
            <h2 id="pp-vistos-title">Vistos recientemente</h2>
            <div class="pp-related-grid"></div>
        </section>
    </main>

    <div class="pp-barra no-print" id="pp-barra" hidden>
        <div class="pp-barra-info"><strong>{esc(p['nombre'])}</strong><span id="pp-barra-precio">{esc(precio_barra)}</span></div>
        <button type="button" class="pp-barra-btn" id="pp-barra-btn"><svg class="ico" aria-hidden="true"><use href="#i-whatsapp"/></svg>{"Cotizar" if p.get("requiereCotizacion") else "Pedir"} por WhatsApp</button>
    </div>

{sangrar(chrome_pie("../../"))}

    <script src="../../chrome.js?v=2" defer></script>
    <script src="../../tienda.js?v=3" defer></script>
    <script src="../../analytics.js?v=6" defer></script>
    <script src="../../producto.js?v=13" defer></script>
</body>
</html>
"""


def actualizar_chrome_indice() -> None:
    """Mantiene la cabecera y el pie de index.html idénticos a los de las fichas (misma plantilla)."""
    indice = ROOT / "index.html"
    contenido = indice.read_text(encoding="utf-8")
    bloques = {"top": sangrar(chrome_superior("")), "pie": sangrar(chrome_pie("")), "pagos": sangrar(plantilla("pagos", ""), 12),
               "promesa": sangrar(f'<div class="promesa-portada no-print">\n{sangrar(bloque_promesa(""))}</div>\n'),
               "envios": sangrar(bloque_envios_portada(), 12), "rangos": sangrar(opciones_rangos(), 28)}
    for clave, (inicio, fin) in CHROME_MARCAS.items():
        nuevo = f"    {inicio}\n{bloques[clave]}    {fin}"
        if inicio in contenido:
            contenido = re.sub(re.escape(inicio) + r".*?" + re.escape(fin), lambda _: nuevo.strip(), contenido, flags=re.S)
        elif clave not in ("top", "pie"):
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


def actualizar_csp_indice() -> None:
    """Escribe (o actualiza) la política CSP en index.html, la misma que llevan las páginas generadas."""
    indice = ROOT / "index.html"
    contenido = indice.read_text(encoding="utf-8")
    if 'http-equiv="Content-Security-Policy"' in contenido:
        contenido = re.sub(r'<meta http-equiv="Content-Security-Policy" content="[^"]*">', lambda _: META_CSP, contenido, count=1)
    else:
        contenido = contenido.replace('<meta charset="UTF-8">\n', f'<meta charset="UTF-8">\n    {META_CSP}\n', 1)
    indice.write_text(contenido, encoding="utf-8")


def actualizar_temporada_indice() -> None:
    """Pone en index.html los atributos de temporada en <html> y temporada.js en <head> (o los quita)."""
    indice = ROOT / "index.html"
    contenido = re.sub(r'<html lang="es"[^>]*>', lambda _: f'<html lang="es"{html_temporada()}>', indice.read_text(encoding="utf-8"), count=1)
    contenido = re.sub(r'\n *<script src="temporada\.js[^"]*"></script>', "", contenido)
    contenido = contenido.replace(META_CSP, META_CSP + script_temporada(""), 1)
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
    analitica = ROOT / "analytics.js"
    analitica.write_text(re.sub(r"pixelId: '\d*'", f"pixelId: '{META_PIXEL}'", analitica.read_text(encoding="utf-8")), encoding="utf-8")


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
FECHA_PRIVACIDAD = "24/11/2026"
FECHA_TERMINOS = "21/11/2026"

ORDEN_CATEGORIAS = ["Muñecos Coleccionables", "Adornos", "Holders", "Barbería", "Mascota", "Llaveros", "Line Art", "Iluminación LED 3D", "Dummy", "Accesorios"]


def pagina_estatica(titulo: str, descripcion: str, base: str, canonical: str | None, cuerpo: str, robots: str | None = None, base_href: str | None = None) -> str:
    """Página informativa con la misma cabecera y pie que el resto del sitio."""
    etiqueta_base = f'    <base href="{esc(base_href)}">\n' if base_href else ""
    meta_robots = f'    <meta name="robots" content="{robots}">\n' if robots else ""
    enlace_canonico = f'    <link rel="canonical" href="{esc(canonical)}">\n' if canonical else ""
    return f"""<!DOCTYPE html>
<html lang="es"{html_temporada()}>
<head>
    <meta charset="UTF-8">
    {META_CSP}{script_temporada(base)}
{etiqueta_base}    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{esc(titulo)}</title>
    <meta name="description" content="{esc(descripcion)}">
{meta_robots}{enlace_canonico}    <meta name="theme-color" content="#002244">
    <link rel="icon" href="{base}assets/logo-96.webp" type="image/webp">
    <link rel="apple-touch-icon" href="{base}assets/logo-192.png">
    <link rel="preload" href="{base}assets/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="{base}assets/fonts/spacegrotesk-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="{base}fonts.css?v=1">
    <link rel="stylesheet" href="{base}chrome.css?v=9">
    <link rel="stylesheet" href="{base}paginas.css?v=2">
</head>
<body>
{sangrar(chrome_superior(base))}
    <main class="pg-main">
{cuerpo}
    </main>

{sangrar(chrome_pie(base))}
    <script src="{base}chrome.js?v=2" defer></script>
    <script src="{base}analytics.js?v=6" defer></script>
</body>
</html>
"""


def pagina_privacidad() -> str:
    hoy = FECHA_PRIVACIDAD
    # Solo cuando el registro de pedidos está encendido (config.json «pedidosUrl»).
    registro = """

        <h2>Registro de tus pedidos</h2>
        <p>Cuando pulsas &laquo;Comprar&raquo;, envías tu lista de pedido o pides una cotización, guardamos en una hoja de cálculo de S3D (Google) un <strong>código de pedido</strong> (por ejemplo, S3D-7K4Q2), los productos, cantidades, colores o medidas elegidos, el total referencial, la página desde la que pediste y la fecha. Ese mismo código aparece al inicio de tu mensaje de WhatsApp para que podamos darte seguimiento. <strong>No guardamos tu nombre ni tu teléfono</strong> en ese registro.</p>""" if PEDIDOS_URL else ""
    # Solo con el píxel de Meta encendido (config.json «metaPixel»): se carga únicamente si el visitante acepta.
    pixel = """

        <h2>Cookies de Meta para nuestros anuncios</h2>
        <p>Anunciamos S3D en Facebook e Instagram. Para saber si esos anuncios funcionan y mostrarlos a personas a quienes puedan interesar, usamos el <strong>píxel de Meta</strong>, que guarda cookies en tu navegador y envía a Meta qué páginas y productos ves y cuándo pulsas &laquo;Comprar&raquo;, &laquo;Añadir al pedido&raquo; o escribes por WhatsApp. <strong>Solo se activa si pulsas &laquo;Aceptar&raquo;</strong> en el aviso de cookies; si lo rechazas, el sitio funciona igual. Puedes cambiar tu decisión cuando quieras con &laquo;Preferencias de cookies&raquo; al pie de cada página. Meta trata esos datos según su propia <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">política de privacidad</a>.</p>""" if META_PIXEL else ""
    tercero_meta = """
            <li><strong>Meta (Facebook e Instagram)</strong>: el píxel de anuncios, solo si lo aceptas.</li>""" if META_PIXEL else ""
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
        <p>Tu lista de pedido, tus productos favoritos, los últimos productos que viste{" y tu decisión sobre las cookies" if META_PIXEL else ""} se guardan únicamente en tu navegador (almacenamiento local). No se envían a ningún servidor nuestro y puedes borrarlos cuando quieras limpiando los datos del sitio.</p>

        <h2>Cuando nos escribes por WhatsApp o correo</h2>
        <p>Al pulsar &laquo;Comprar&raquo;, &laquo;Pedir por WhatsApp&raquo; o enviar tu lista de pedido, se abre WhatsApp con un mensaje ya redactado. Desde ese momento la conversación se rige por las condiciones de WhatsApp. Usamos los datos que nos compartas (por ejemplo, tu nombre, tu número y tu dirección de entrega) <strong>solo para atender tu pedido</strong> y no los cedemos a terceros.</p>{registro}{pixel}

        <h2>Servicios de terceros</h2>
        <ul>
            <li><strong>GitHub Pages</strong>: aloja este sitio.</li>
            <li><strong>Google Maps</strong>: el mapa de nuestra ubicación solo se carga si pulsas «Ver el mapa del taller»; a partir de ese momento Google puede recibir datos técnicos de tu visita.</li>
            <li><strong>Umami</strong>: estadísticas anónimas, como se explica arriba.</li>{tercero_google}{tercero_meta}
        </ul>

        <h2>Nuestras redes sociales</h2>
        <p>S3D publica sus productos en sus propias cuentas de Facebook, Instagram y TikTok mediante las herramientas oficiales de cada plataforma. Esas conexiones solo sirven para publicar nuestro contenido en nuestras cuentas: no leen ni guardan datos de quienes visitan este sitio ni de sus cuentas.</p>

        <h2>Tus derechos y contacto</h2>
        <p>Si quieres consultar, corregir o pedir que eliminemos datos que nos hayas compartido por WhatsApp o correo, escríbenos a <a href="mailto:ventas.s3d@gmail.com">ventas.s3d@gmail.com</a> o por <a href="https://api.whatsapp.com/send?phone={WHATSAPP}" target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>
        <p class="pg-aviso">Este texto es informativo y puede actualizarse. Si el negocio crece o empieza a recopilar más datos, conviene revisarlo con asesoría legal.</p>"""
    return pagina_estatica("Política de privacidad | S3D", "Qué mide S3D en este sitio (estadísticas anónimas" + (" y, si lo aceptas, el píxel de Meta" if META_PIXEL else ", sin cookies") + "), qué se guarda en tu dispositivo y cómo usamos los datos que compartes por WhatsApp.", "../", f"{BASE_URL}privacidad/", cuerpo)


def pagina_terminos() -> str:
    """Términos y condiciones (los exige TikTok para aprobar la app de publicación). Base a revisar con asesoría legal."""
    wa = f"https://api.whatsapp.com/send?phone={WHATSAPP}"
    cuerpo = f"""        <p class="pg-kicker">Condiciones de compra</p>
        <h1>Términos y condiciones</h1>
        <p class="pg-actualizado">Última actualización: {FECHA_TERMINOS}</p>
        <p>Estos términos explican cómo funcionan los pedidos en <strong>S3D</strong>, taller de impresión 3D en Lima, Perú. Al hacer un pedido aceptas estas condiciones. Si tienes dudas, escríbenos antes de comprar.</p>

        <h2>Este sitio</h2>
        <p>Este sitio es un catálogo: muestra nuestros productos, precios y medidas. Los pedidos se hacen y se confirman por <a href="{wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a> ({esc(WHATSAPP_VISIBLE)}) o por correo a <a href="mailto:ventas.s3d@gmail.com">ventas.s3d@gmail.com</a>. Un pedido queda confirmado cuando acordamos contigo el producto, el precio, la entrega y el pago.</p>

        <h2>Productos a pedido y personalización</h2>
        <ul>
            <li>Elaboramos cada pieza a pedido en nuestro taller. Las fotos son referenciales: por el proceso de impresión 3D, los colores, texturas y acabados pueden variar ligeramente.</li>
            <li>Las medidas publicadas corresponden al precio indicado. Otras medidas, colores, nombres o diseños se cotizan aparte.</li>
            <li>Antes de fabricar un pedido personalizado te confirmamos los detalles por WhatsApp.</li>
        </ul>

        <h2>Precios y pagos</h2>
        <ul>
            <li>Los precios están en soles (S/) e incluyen IGV. El costo de envío no está incluido y se cotiza según tu distrito o provincia.</li>
            <li>Aceptamos Yape, Plin, transferencia bancaria y efectivo. Las condiciones de pago (por ejemplo, si se requiere un adelanto) se acuerdan al confirmar el pedido.</li>
            <li>Los precios pueden cambiar; el que vale es el que acordamos al confirmar tu pedido.</li>
        </ul>

        <h2>Tiempos y entregas</h2>
        <ul>
            <li>El tiempo habitual de elaboración es de un día para otro, según el modelo y la carga de trabajo. Te confirmamos la fecha al hacer el pedido.</li>
            <li>Enviamos a todo el Perú mediante agencias de transporte o coordinamos la entrega en Lima.</li>
        </ul>

        <h2>Cambios, defectos y reclamos</h2>
        <p>Si tu pedido llega dañado o con un defecto de fabricación, escríbenos lo antes posible con fotos del producto. Lo revisamos y, si corresponde, lo reparamos, lo reponemos o te devolvemos el importe. Esto no limita los derechos que te reconoce el Código de Protección y Defensa del Consumidor (Ley 29571). Para cualquier reclamo, escríbenos a <a href="mailto:ventas.s3d@gmail.com">ventas.s3d@gmail.com</a> o por WhatsApp.</p>

        <h2>Marcas y contenido</h2>
        <p>Las fotos y textos de este sitio son de S3D. Los nombres de marcas, personajes o equipos mencionados pertenecen a sus respectivos titulares y se usan solo para describir el producto.</p>

        <h2>Redes sociales</h2>
        <p>Publicamos nuestros productos en nuestras cuentas de Facebook, Instagram y TikTok con las herramientas oficiales de cada plataforma. Al usar esas plataformas también aplican sus propias condiciones. Más detalles en nuestra <a href="../privacidad/">política de privacidad</a>.</p>

        <h2>Cambios a estos términos</h2>
        <p>Podemos actualizar estos términos; la fecha de arriba indica la última versión. Se rigen por las leyes del Perú.</p>
        <p class="pg-aviso">Este texto es informativo y conviene revisarlo con asesoría legal.</p>"""
    return pagina_estatica("Términos y condiciones | S3D", "Cómo funcionan los pedidos en S3D: productos a pedido, precios con IGV, pagos, envíos a todo el Perú y reclamos.", "../", f"{BASE_URL}terminos/", cuerpo)


def tarjeta_pagina(p: dict, base: str) -> str:
    img = miniatura(imagen_principal(p))
    marca = '<em class="pg-card-temporada con-temporada">' + esc(TEMPORADA["titulo"]) + "</em>" if es_de_temporada(p) else ""
    return f"""            <a class="pg-card" href="{base}producto/{esc(p['slug'])}/" data-evento="ficha_regalos" data-producto="{esc(p['nombre'])}">
                <picture><source srcset="{esc(url_ruta(avif(img), base))}" type="image/avif"><img src="{esc(url_ruta(img, base))}" alt="" loading="lazy" decoding="async"></picture>
                {marca}<strong>{esc(p['nombre'])}</strong>
                <span>{esc(precio_txt(p))}</span>
            </a>"""


def pagina_regalos(todos: list[dict]) -> str:
    """Guía de regalos por rango de precio (destino de anuncios). Dentro de cada rango, de menor a mayor precio;
    durante la temporada sus productos llevan la marca (temporada.js decide si se ve)."""
    grupos = [(r, sorted((p for p in activos(todos) if rango_de(p) is r), key=lambda p: (precios(p)[0], p["orden"]))) for r in RANGOS]
    grupos = [(r, ps) for r, ps in grupos if ps]
    chips = "\n".join(f'            <a class="pg-chip" href="#{esc(r["id"])}">{esc(r["titulo"])} <small>({len(ps)})</small></a>' for r, ps in grupos)
    secciones = "\n\n".join(
        f"""        <section class="pg-rango" id="{esc(r['id'])}" aria-labelledby="t-{esc(r['id'])}">
            <div class="pg-rango-cab">
                <h2 id="t-{esc(r['id'])}">{esc(r['titulo'])}</h2>
                <a href="../?precio={quote(r['id'])}#catalogo">Ver en el catálogo</a>
            </div>
            <div class="pg-grid">
{chr(10).join(tarjeta_pagina(p, "../") for p in ps)}
            </div>
        </section>"""
        for r, ps in grupos
    )
    wa = f"https://api.whatsapp.com/send?phone={WHATSAPP}&text={quote('Hola, estoy buscando un regalo impreso en 3D y quisiera una recomendación.', safe='')}"
    cuerpo = f"""        <p class="pg-kicker">Guía de regalos</p>
        <h1>Regalos impresos en 3D por precio</h1>
        <p>Elige tu presupuesto y encuentra el regalo ideal. Todo se fabrica a pedido en nuestro taller de Lima; muchos modelos se pueden personalizar con nombres, colores o medidas.</p>
{sangrar(bloque_promesa("../"), 8)}        <nav class="pg-chips" aria-label="Rangos de precio">
{chips}
        </nav>

{secciones}

        <p class="pg-aviso">¿No sabes qué regalar? <a href="{esc(wa)}" target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a>: te recomendamos según la persona y tu presupuesto. Los precios incluyen IGV; el envío se cotiza aparte (<a href="../#envios">ver costos de envío</a>).</p>"""
    return pagina_estatica("Regalos impresos en 3D por precio | S3D", "Guía de regalos de S3D: figuras, adornos, llaveros y más, impresos en 3D en Lima y ordenados por precio. Envíos a todo el Perú.", "../", f"{BASE_URL}regalos/", cuerpo)


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
    filas.append(f"  <url>\n    <loc>{BASE_URL}terminos/</loc>\n    <priority>0.3</priority>\n  </url>")
    filas.append(f"  <url>\n    <loc>{BASE_URL}regalos/</loc>\n    <priority>0.8</priority>\n  </url>")
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
    global HAY_PRODUCTOS_TEMPORADA
    HAY_PRODUCTOS_TEMPORADA = any(es_de_temporada(p) for p in activos(productos))
    ruta_json.write_text(json.dumps(productos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    for p in productos:
        carpeta = OUT_DIR / p["slug"]
        carpeta.mkdir(parents=True)
        (carpeta / "index.html").write_text(pagina(p, productos), encoding="utf-8")

    (ROOT / "privacidad").mkdir(exist_ok=True)
    (ROOT / "privacidad" / "index.html").write_text(pagina_privacidad(), encoding="utf-8")
    (ROOT / "terminos").mkdir(exist_ok=True)
    (ROOT / "terminos" / "index.html").write_text(pagina_terminos(), encoding="utf-8")
    (ROOT / "regalos").mkdir(exist_ok=True)
    (ROOT / "regalos" / "index.html").write_text(pagina_regalos(productos), encoding="utf-8")
    (ROOT / "404.html").write_text(pagina_404(productos), encoding="utf-8")

    actualizar_itemlist(productos)
    actualizar_chrome_indice()
    actualizar_csp_indice()
    actualizar_temporada_indice()
    sincronizar_contacto()
    escribir_sitemap(productos)
    import redes, catalogo_meta   # aquí y no arriba: ambos importan este módulo
    redes.escribir(productos)
    catalogo_meta.escribir(productos)
    print(f"{len(productos)} páginas generadas en {OUT_DIR.relative_to(ROOT)}/, sitemap.xml e ItemList actualizados")


if __name__ == "__main__":
    main()
