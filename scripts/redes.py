#!/usr/bin/env python3
"""
Kit para publicar productos en redes (Facebook, Instagram y Marketplace).

A partir de la cola de config.json («redes» → «cola»: ids de productos en el orden en que se publicarán) arma, por
cada producto, las fotos limpias (JPG 4:5 en redes/fotos/, las genera scripts/redes_fotos.cjs), el texto para
Facebook, el de Instagram, el anuncio de Marketplace y una respuesta para «¿Está disponible?». Todo se muestra en
redes/index.html: una página privada (sin enlace desde el sitio, noindex y sin analítica) para que el dueño revise,
copie y publique a mano. build_product_pages.py la regenera junto con el resto del sitio.

Uso:  python3 scripts/redes.py faltantes    imprime, una por línea, las fotos de la cola que aún no tienen JPG
"""
import hashlib
import json
import re
import sys
from urllib.parse import quote

import build_product_pages as b

esc = b.esc
CARPETA = b.ROOT / "redes"
FOTOS = CARPETA / "fotos"
REDES = b.CONFIG.get("redes") or {}
assert re.fullmatch(r"(https://script\.google\.com/macros/s/[\w-]+/exec)?", REDES.get("publicarUrl", "")), "redes.publicarUrl inválida en config.json"
COLA = REDES.get("cola") or []
MAX_FOTOS = 10   # máximo de un carrusel de Instagram y de Marketplace

# Primer emoji del texto y hashtags según la categoría (los que no están en la lista usan solo los generales).
EMOJI = {"Navidad": "🎄", "Mascota": "🐾", "Barbería": "💈", "Iluminación LED 3D": "💡", "Llaveros": "🔑"}
# Instagram admite como máximo 5 hashtags por publicación (desde dic. 2025): colección, 2 de la categoría y los generales.
MAX_HASHTAGS = 5
HASHTAGS_BASE = ["#impresion3d", "#lima", "#regalos", "#hechoenperu"]
HASHTAGS = {
    "Navidad": ["#navidad", "#decoracionnavideña", "#regalosnavideños"],
    "Muñecos Coleccionables": ["#coleccionables", "#figuras3d"],
    "Adornos": ["#decoracion", "#decoraciondehogar"],
    "Holders": ["#gamer", "#setup"],
    "Barbería": ["#barberia", "#barbershop"],
    "Mascota": ["#mascotas", "#petlovers"],
    "Llaveros": ["#llaveros", "#llaveropersonalizado"],
    "Line Art": ["#lineart", "#decoracion"],
    "Iluminación LED 3D": ["#lamparas", "#iluminacionled"],
}
# Marketplace no deja escribir la categoría: se sugiere la más parecida de su lista.
CATEGORIA_MARKETPLACE = {
    "Navidad": "Hogar → Decoración (o «Artículos para fiestas y celebraciones»)",
    "Adornos": "Hogar → Decoración",
    "Line Art": "Hogar → Decoración",
    "Iluminación LED 3D": "Hogar → Iluminación",
    "Muñecos Coleccionables": "Pasatiempos → Coleccionables (o «Juguetes y juegos»)",
    "Dummy": "Pasatiempos → Coleccionables",
    "Mascota": "Artículos para mascotas",
    "Barbería": "Salud y belleza",
    "Llaveros": "Ropa y accesorios → Accesorios",
    "Accesorios": "Ropa y accesorios → Accesorios",
    "Holders": "Electrónica → Accesorios",
}
MENORES = {"y", "e", "o", "de", "del", "con", "en", "la", "el", "los", "las", "para", "a", "al", "por", "sin"}


def titulo(nombre: str) -> str:
    """«SNOOPY Y WOODSTOCK EN TRINEO» → «Snoopy y Woodstock en Trineo» (siglas y medidas quedan igual)."""
    palabras = []
    for i, w in enumerate(nombre.split()):
        if any(c.isdigit() for c in w) or w in {"LED", "PLA", "S3D", "3D", "RGB"}:
            palabras.append(w)
        elif i and w.lower() in MENORES:
            palabras.append(w.lower())
        else:
            palabras.append(w[:1].upper() + w[1:].lower())
    return " ".join(palabras)


def nombre_foto(ruta: str) -> str:
    """assets/nav-arboles-1.webp → nav-arboles-1"""
    return ruta.removeprefix("assets/").rsplit(".", 1)[0]


def fotos(p: dict) -> list[str]:
    """Fotos del producto sin repetir: la de cada color y luego las demás (máx. MAX_FOTOS)."""
    rutas = [c["img"] for c in p.get("colores") or []] + p["imagenes"]
    return [nombre_foto(r) for r in dict.fromkeys(rutas)][:MAX_FOTOS]


def enlace(p: dict, fuente: str) -> str:
    """URL de la ficha con UTM: Umami muestra de qué red llegó cada visita."""
    campana = b.TEMPORADA["id"] if b.es_de_temporada(p) else "catalogo"
    return f"{b.BASE_URL}producto/{p['slug']}/?utm_source={fuente}&utm_medium=social&utm_campaign={campana}"


def linea_precio(p: dict) -> str:
    if p.get("requiereCotizacion"):
        return "Precio: a cotizar según medida y diseño"
    lista = b.precios(p)
    if len(lista) > 1:
        return f"Precio: desde S/ {lista[0]:.2f} según el color (incluye IGV)"
    return f"Precio: S/ {lista[0]:.2f} (incluye IGV)"


def linea_colores(p: dict) -> str:
    colores = p.get("colores") or []
    if not colores:
        return ""
    if len(b.precios(p)) > 1:
        return "Colores: " + " · ".join(f"{c['nombre']} S/ {b.precio_de(p, c['nombre']):.2f}" for c in colores)
    return "Colores: " + ", ".join(c["nombre"] for c in colores)


def linea_elaboracion(p: dict) -> str:
    material = p.get("material") or "PLA"
    if p.get("disponibilidad") == "En stock":
        return f"En stock, listo para entregar. Impreso en 3D en {material}."
    return f"Hecho a pedido, impreso en 3D en {material}. Medidas y colores personalizables."


def detalles(p: dict) -> list[str]:
    """Líneas de datos comunes a todos los textos."""
    lineas = [f"📏 Medida: {p['medida']}"] if p.get("medida") else []
    if linea_colores(p):
        lineas.append(f"🎨 {linea_colores(p)}")
    lineas.append(f"💰 {linea_precio(p)}")
    lineas.append(f"🛠️ {linea_elaboracion(p)}")
    return lineas


def hashtags(p: dict) -> str:
    coleccion = ["#" + "".join(p["coleccion"].lower().split())] if p.get("coleccion") else []
    etiquetas = coleccion + HASHTAGS.get(p["categoria"], [])[:2] + HASHTAGS_BASE
    return " ".join(list(dict.fromkeys(etiquetas))[:MAX_HASHTAGS])


def cabecera(p: dict) -> str:
    return f"{EMOJI.get(p['categoria'], '✨')} {titulo(p['nombre'])}"


def texto_facebook(p: dict) -> str:
    return "\n".join([
        cabecera(p), "", p["descripcion"].strip(), "", *detalles(p), "",
        f"👉 Más fotos y pedido aquí: {enlace(p, 'facebook')}",
        f"💬 WhatsApp: {b.WHATSAPP_VISIBLE}", "",
        hashtags(p),
    ])


def texto_instagram(p: dict) -> str:
    # En Instagram los enlaces del texto no se pueden pulsar: se remite al WhatsApp y al enlace del perfil.
    return "\n".join([
        cabecera(p), "", p["descripcion"].strip(), "", *detalles(p), "",
        f"💬 Pídelo por WhatsApp al {b.WHATSAPP_VISIBLE}",
        "🔗 Más fotos y precios en el enlace de nuestro perfil.", "",
        hashtags(p),
    ])


def marketplace(p: dict) -> dict:
    """Campos del formulario de Marketplace. Sin enlaces: Marketplace suele limitar anuncios con enlaces externos."""
    lista = b.precios(p)
    descripcion = "\n".join([
        p["descripcion"].strip(), "", *[l.split(" ", 1)[1] for l in detalles(p)], "",
        "Escríbeme por aquí para coordinar tu pedido y el envío (Lima y provincias).",
    ])
    return {
        "titulo": f"{titulo(p['nombre'])} - impreso en 3D"[:100],
        "precio": "" if p.get("requiereCotizacion") else f"{lista[0]:g}",
        "categoria": CATEGORIA_MARKETPLACE.get(p["categoria"], "Hogar → Decoración"),
        "estado": "Nuevo",
        "descripcion": descripcion,
    }


def respuesta_disponible(p: dict) -> str:
    stock = "Sí, lo tenemos en stock" if p.get("disponibilidad") == "En stock" else "Sí, está disponible: lo elaboramos a pedido"
    return (
        f"¡Hola! 😊 {stock}. Aquí puedes ver más fotos, medidas, colores y precios: {enlace(p, 'marketplace')}\n"
        f"Para coordinar tu pedido y el envío, escríbenos al WhatsApp {b.WHATSAPP_VISIBLE} o por aquí mismo."
    )


def cola(productos: list[dict]) -> list[dict]:
    por_id = {p["id"]: p for p in productos}
    faltan = [i for i in COLA if i not in por_id]
    if faltan:
        raise SystemExit(f"config.json «redes.cola»: no existen los productos {faltan}")
    return [por_id[i] for i in dict.fromkeys(COLA) if por_id[i].get("activo", True)]


def faltantes(productos: list[dict]) -> list[str]:
    return [n for p in cola(productos) for n in fotos(p) if not (FOTOS / f"{n}.jpg").exists()]


def bloque_texto(id_: str, etiqueta: str, texto: str, filas: bool = True) -> str:
    clase = "rd-texto" if filas else "rd-texto rd-corto"
    return f"""                <div class="rd-campo">
                    <div class="rd-campo-cab"><span>{esc(etiqueta)}</span><button class="rd-copiar" type="button" data-copiar="{id_}">Copiar</button></div>
                    <div class="{clase}" id="{id_}">{esc(texto)}</div>
                </div>"""


def foto_src(nombre: str) -> str | None:
    """Ruta de la JPG (relativa a redes/) con ?v= que cambia cuando cambia la foto (sin versiones viejas en caché)."""
    jpg = FOTOS / f"{nombre}.jpg"
    if not jpg.exists():
        return None
    return f"fotos/{quote(nombre)}.jpg?v={hashlib.sha256(jpg.read_bytes()).hexdigest()[:8]}"


def bloque_auto(tipo: str, titulo_: str) -> str:
    """Botones de publicación automática (los muestra redes.js cuando hay conexión con el Apps Script)."""
    return f"""            <section class="rd-auto" data-tipo="{tipo}" hidden>
                <h3>{titulo_}</h3>
                <ul class="rd-auto-estado" data-auto-estado></ul>
                <div class="rd-auto-botones">
                    <button class="rd-btn" type="button" data-accion="publicar">Publicar ahora</button>
                    <button class="rd-btn rd-btn-sec" type="button" data-accion="aprobar">Aprobar (sale sola en el próximo horario)</button>
                    <button class="rd-btn rd-btn-sec" type="button" data-accion="cancelar" hidden>Quitar de la programación</button>
                </div>
            </section>"""


def articulo(n: int, p: dict) -> str:
    pid = p["id"]
    figuras = []
    for nombre in fotos(p):
        src = foto_src(nombre)
        if src:
            figuras.append(f'                <figure class="rd-foto"><img src="{src}" alt="{esc(titulo(p["nombre"]))}" loading="lazy" decoding="async" width="1080" height="1350">'
                           f'<a class="rd-descargar" href="{src}" download>Descargar</a></figure>')
        else:
            figuras.append(f'                <figure class="rd-foto rd-pendiente"><span>Foto «{esc(nombre)}» pendiente</span></figure>')
    video = ""
    if p.get("video"):
        src = b.url_ruta(p["video"], "../")
        video = f"""
            <div class="rd-video">
                <video src="{esc(src)}" controls preload="none" playsinline></video>
                <a class="rd-descargar" href="{esc(src)}" download>Descargar video</a>
            </div>
{bloque_auto("reel", "Facebook e Instagram: video (Reel)")}"""
    mp = marketplace(p)
    return f"""        <article class="rd-post" id="p-{pid}" data-id="{pid}">
            <header class="rd-post-cab">
                <span class="rd-num">{n}</span>
                <div>
                    <h2>{esc(titulo(p['nombre']))}</h2>
                    <p>{esc(p['categoria'])} · {esc(b.precio_txt(p))} · <a href="../producto/{esc(p['slug'])}/" target="_blank" rel="noopener">Ver ficha</a></p>
                </div>
            </header>
            <div class="rd-fotos">
{chr(10).join(figuras)}
            </div>
{bloque_auto("fotos", "Facebook e Instagram: fotos")}
            <button class="rd-compartir" type="button" data-compartir hidden>Enviar las fotos a otra app</button>{video}
            <details class="rd-red" open>
                <summary>Facebook</summary>
{bloque_texto(f"fb-{pid}", "Texto de la publicación", texto_facebook(p))}
            </details>
            <details class="rd-red">
                <summary>Instagram</summary>
{bloque_texto(f"ig-{pid}", "Texto de la publicación", texto_instagram(p))}
            </details>
            <details class="rd-red">
                <summary>Marketplace (a mano)</summary>
                <label class="rd-marca"><input type="checkbox" data-red="marketplace"> Ya lo publiqué en Marketplace</label>
{bloque_texto(f"mt-{pid}", "Título", mp['titulo'], False)}
{bloque_texto(f"mp-{pid}", "Precio (S/)", mp['precio'] or 'Pon un precio base y aclara en la descripción', False)}
                <p class="rd-nota">Categoría: <strong>{esc(mp['categoria'])}</strong> · Estado: <strong>{mp['estado']}</strong></p>
{bloque_texto(f"md-{pid}", "Descripción", mp['descripcion'])}
{bloque_texto(f"mr-{pid}", "Respuesta para «¿Está disponible?»", respuesta_disponible(p))}
            </details>
        </article>"""


def pagina(productos: list[dict]) -> str:
    lista = cola(productos)
    articulos = "\n".join(articulo(n, p) for n, p in enumerate(lista, 1)) or '        <p class="rd-vacio">La cola de publicaciones está vacía.</p>'
    bio = f"{b.BASE_URL}?utm_source=instagram&utm_medium=bio"
    api = REDES.get("publicarUrl", "")
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    {b.META_CSP}
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Publicaciones para redes | S3D</title>
    <meta name="theme-color" content="#002244">
    <link rel="icon" href="../assets/logo-96.webp" type="image/webp">
    <link rel="stylesheet" href="../fonts.css?v=1">
    <link rel="stylesheet" href="redes.css?v=2">
</head>
<body>
    <main class="rd-main" data-api="{esc(api)}">
        <p class="rd-kicker">Uso interno · no aparece en la web</p>
        <h1>Publicaciones para redes</h1>
        <p class="rd-progreso" aria-live="polite">Facebook e Instagram: <strong data-progreso="redes">–</strong> de {len(lista)} ·
            Marketplace: <strong data-progreso="marketplace">0</strong> de {len(lista)}</p>
        <section class="rd-conexion" data-conexion>
            <h2>Publicación automática</h2>
            <p class="rd-conexion-estado" data-conexion-estado>{'Conectando…' if api else 'Aún no está conectada con Facebook e Instagram (falta instalar el Apps Script: docs/guia-redes.md).'}</p>
            <form class="rd-clave" data-clave-form{'' if api else ' hidden'}>
                <label for="rd-clave">Tu clave</label>
                <input id="rd-clave" type="password" autocomplete="current-password" required minlength="20">
                <button class="rd-btn" type="submit">Guardar</button>
            </form>
            <p class="rd-nota">Horarios automáticos: 11:00 y 19:00 (hora de Lima), un producto aprobado en cada uno.</p>
        </section>
        <details class="rd-ayuda">
            <summary>Cómo usar esta página</summary>
            <ol>
                <li>Revisa las fotos y los textos de cada producto. Si algo no te convence, avísame y lo corrijo.</li>
                <li>Facebook e Instagram: pulsa «Publicar ahora» (sale en ese momento) o «Aprobar» (sale sola a las 11:00 o
                    19:00, un producto por horario). Si una red falla, «Publicar ahora» solo completa la que falló.</li>
                <li>Marketplace se publica a mano: descarga las fotos (o mantén pulsada una foto), copia los textos y marca
                    «Ya lo publiqué». Esa marca se guarda solo en este celular o computadora.</li>
                <li>Marketplace: publica de 3 a 5 productos por día; si subes muchos de golpe, Facebook puede frenar tu perfil.
                    Cuando te pregunten «¿Está disponible?», responde con el texto de abajo (incluye el enlace de la ficha).</li>
                <li>Instagram: pon en tu perfil el enlace <span class="rd-url">{esc(bio)}</span> para medir las visitas que llegan desde ahí.</li>
            </ol>
        </details>
{articulos}
    </main>
    <script src="redes.js?v=3" defer></script>
</body>
</html>
"""


def publicaciones(productos: list[dict]) -> dict:
    """redes/publicaciones.json: lo que el Apps Script publica (solo lee la web principal, nunca datos del navegador)."""
    datos = {}
    for p in cola(productos):
        srcs = [s for s in (foto_src(n) for n in fotos(p)) if s]
        datos[str(p["id"])] = {
            "nombre": titulo(p["nombre"]),
            "facebook": texto_facebook(p),
            "instagram": texto_instagram(p),
            "fotos": [f"{b.BASE_URL}redes/{s}" for s in srcs],
            "video": b.url_ruta(p["video"], b.BASE_URL) if p.get("video") else None,
        }
    return {"productos": datos}


def escribir(productos: list[dict]) -> None:
    CARPETA.mkdir(exist_ok=True)
    (CARPETA / "index.html").write_text(pagina(productos), encoding="utf-8")
    (CARPETA / "publicaciones.json").write_text(json.dumps(publicaciones(productos), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Las fotos de productos que ya no están en la cola se borran (se pueden volver a generar desde R2).
    usadas = {n for p in cola(productos) for n in fotos(p)}
    for jpg in FOTOS.glob("*.jpg"):
        if jpg.stem not in usadas:
            jpg.unlink()
    pendientes = faltantes(productos)
    if pendientes:
        print(f"redes: faltan {len(pendientes)} fotos JPG (node scripts/redes_fotos.cjs): {', '.join(pendientes)}")


if __name__ == "__main__":
    if sys.argv[1:] == ["faltantes"]:
        print("\n".join(faltantes(json.loads((b.ROOT / "productos.json").read_text(encoding="utf-8")))))
    else:
        print(__doc__)
