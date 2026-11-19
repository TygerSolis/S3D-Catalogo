#!/usr/bin/env python3
"""
Catálogo para Meta (Administrador de ventas → catálogo de Facebook, conectado al catálogo de WhatsApp Business).

Escribe meta/catalogo.csv (lista de datos programada: Meta la descarga cada día desde la web publicada) con un artículo
por producto activo con precio; si el producto tiene colores, una variante por color (mismo item_group_id, su precio y
su foto). Los productos «Cotizar» no van: Meta exige un precio. Las fotos son meta/fotos/<nombre>.jpg, 1080×1080
(cuadradas, como las muestra WhatsApp), con la foto completa sobre la misma foto desenfocada; las genera
`node scripts/redes_fotos.cjs --catalogo`. Un artículo sin su JPG se omite (y se avisa) hasta que exista.
build_product_pages.py lo regenera junto con el resto del sitio.

Uso:  python3 scripts/catalogo_meta.py faltantes    imprime las fotos que aún no tienen JPG
"""
import csv
import hashlib
import io
import json
import sys
from urllib.parse import quote

import build_product_pages as b
from redes import nombre_foto, titulo

CARPETA = b.ROOT / "meta"
FOTOS = CARPETA / "fotos"
CAMPOS = ["id", "item_group_id", "title", "description", "availability", "condition", "price", "link",
          "image_link", "brand", "color", "custom_label_0"]
DISPONIBILIDAD = {"A pedido": "available for order", "En stock": "in stock", "Agotado": "out of stock"}


def productos(todos: list[dict]) -> list[dict]:
    return [p for p in b.activos(todos) if not p.get("requiereCotizacion")]


def variantes(p: dict) -> list[dict]:
    """Un artículo por color (o uno solo): id estable, color, foto y precio."""
    if not p.get("colores"):
        return [{"id": f"S3D-{p['id']}", "color": "", "foto": nombre_foto(p["imagenes"][0]), "precio": p["precio"]}]
    return [{"id": f"S3D-{p['id']}-{b.slugify(c['nombre'])}", "color": c["nombre"], "foto": nombre_foto(c["img"]),
             "precio": b.precio_de(p, c["nombre"])} for c in p["colores"]]


def fotos_necesarias(todos: list[dict]) -> list[str]:
    return list(dict.fromkeys(v["foto"] for p in productos(todos) for v in variantes(p)))


def faltantes(todos: list[dict]) -> list[str]:
    return [n for n in fotos_necesarias(todos) if not (FOTOS / f"{n}.jpg").exists()]


def foto_url(nombre: str) -> str | None:
    jpg = FOTOS / f"{nombre}.jpg"
    if not jpg.exists():
        return None
    # Meta solo vuelve a descargar una foto si cambia su URL: ?v= cambia cuando cambia la foto.
    return f"{b.BASE_URL}meta/fotos/{quote(nombre)}.jpg?v={hashlib.sha256(jpg.read_bytes()).hexdigest()[:8]}"


def descripcion(p: dict) -> str:
    partes = [p["descripcion"].strip()]
    if p.get("medida"):
        partes.append(f"Medida: {p['medida']}.")
    material = p.get("material") or "PLA"
    partes.append(f"Impreso en 3D en {material}. Hecho a pedido en Lima; medidas y colores personalizables. "
                  "Precio con IGV; envíos a todo el Perú (costo según destino).")
    return " ".join(partes)


def filas(todos: list[dict]) -> list[dict]:
    salida = []
    for p in productos(todos):
        grupo = len(p.get("colores") or []) > 1
        for v in variantes(p):
            imagen = foto_url(v["foto"])
            if not imagen:
                continue
            salida.append({
                "id": v["id"],
                "item_group_id": f"S3D-{p['id']}" if grupo else "",
                "title": f"{titulo(p['nombre'])} - {v['color']}" if v["color"] and grupo else titulo(p["nombre"]),
                "description": descripcion(p),
                "availability": DISPONIBILIDAD[p.get("disponibilidad", "A pedido")],
                "condition": "new",
                "price": f"{v['precio']:.2f} PEN",
                "link": f"{b.BASE_URL}producto/{p['slug']}/?utm_source=meta&utm_medium=catalogo",
                "image_link": imagen,
                "brand": "S3D",
                "color": v["color"],
                "custom_label_0": p["categoria"],
            })
    return salida


def csv_texto(todos: list[dict]) -> str:
    salida = io.StringIO()
    escritor = csv.DictWriter(salida, fieldnames=CAMPOS, lineterminator="\n")
    escritor.writeheader()
    escritor.writerows(filas(todos))
    return salida.getvalue()


def escribir(todos: list[dict]) -> None:
    CARPETA.mkdir(exist_ok=True)
    (CARPETA / "catalogo.csv").write_text(csv_texto(todos), encoding="utf-8")
    usadas = set(fotos_necesarias(todos))
    for jpg in FOTOS.glob("*.jpg"):
        if jpg.stem not in usadas:
            jpg.unlink()
    pendientes = faltantes(todos)
    if pendientes:
        print(f"catálogo de Meta: faltan {len(pendientes)} fotos JPG (node scripts/redes_fotos.cjs --catalogo): {', '.join(pendientes)}")


if __name__ == "__main__":
    if sys.argv[1:] == ["faltantes"]:
        print("\n".join(faltantes(json.loads((b.ROOT / "productos.json").read_text(encoding="utf-8")))))
    else:
        print(__doc__)
