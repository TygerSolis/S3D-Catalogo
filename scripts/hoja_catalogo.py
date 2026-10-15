#!/usr/bin/env python3
"""Convierte el catálogo entre productos.json y la hoja de cálculo (CSV con una fila por producto).

  python3 scripts/hoja_catalogo.py exportar catalogo.csv        productos.json -> CSV (para cargar la hoja)
  python3 scripts/hoja_catalogo.py importar <archivo.csv | URL>  CSV de la hoja -> productos.json
  python3 scripts/hoja_catalogo.py faltantes <archivo.csv | URL> imágenes que la hoja nombra y aún no existen
  python3 scripts/hoja_catalogo.py videos <archivo.csv | URL>    videos que la hoja nombra y aún no existen
  python3 scripts/hoja_catalogo.py limpiar --aplicar             borra fotos y videos que ya no usa ningún producto
                                                                 (sin --aplicar solo los lista)

La hoja manda: «importar» reescribe productos.json entero. Si algún dato no es válido no escribe nada
y lista los errores (fila y motivo). Las imágenes se escriben por su nombre, sin carpeta ni extensión
(p. ej. «ts-woody-1»), separadas por comas; los colores, uno por línea o separados por «;», con el
formato «Nombre #rrggbb imagen».
"""
import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validar_productos import validar  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
JSON = ROOT / "productos.json"

# (columna de la hoja, campo de productos.json). El orden es el de las columnas en la hoja.
COLUMNAS = [
    ("id", "id"),
    ("orden", "orden"),
    ("activo", "activo"),
    ("nombre", "nombre"),
    ("categoria", "categoria"),
    ("coleccion", "coleccion"),
    ("tipo", "tipo"),
    ("medida", "medida"),
    ("material", "material"),
    ("precio", "precio"),
    ("cotizar", "requiereCotizacion"),
    ("disponibilidad", "disponibilidad"),
    ("descripcion", "descripcion"),
    ("imagenes", "imagenes"),
    ("colores", "colores"),
    ("video", "video"),
    ("etiqueta", "badge"),
    ("fechaAlta", "fechaAlta"),
    ("slug", "slug"),
    ("heroOrden", "heroOrden"),
    ("heroFoco", "heroFoco"),
]
# Orden canónico de las claves en productos.json (así exportar -> importar deja el archivo idéntico).
ORDEN_JSON = ["id", "orden", "activo", "categoria", "coleccion", "badge", "nombre", "medida", "material", "tipo",
              "precio", "requiereCotizacion", "disponibilidad", "imagenes", "colores", "video", "descripcion",
              "slug", "heroOrden", "heroFoco", "fechaAlta"]
SI = {"si", "sí", "s", "x", "true", "verdadero", "1", "yes"}
NO = {"no", "n", "false", "falso", "0", ""}


def nombre_imagen(ruta: str) -> str:
    return re.sub(r"\.webp$", "", re.sub(r"^assets/", "", ruta))


def ruta_imagen(nombre: str) -> str:
    nombre = nombre.strip()
    return nombre if nombre.startswith("assets/") else f"assets/{re.sub(r'\.(webp|png|jpe?g|avif)$', '', nombre, flags=re.I)}.webp"


def numero(valor: float) -> str:
    return str(int(valor)) if float(valor).is_integer() else str(valor)


# ---------- productos.json -> filas ----------
def a_fila(p: dict) -> dict:
    fila = {}
    for col, campo in COLUMNAS:
        v = p.get(campo)
        if campo in ("activo", "requiereCotizacion"):
            fila[col] = "sí" if v else "no"
        elif campo == "imagenes":
            fila[col] = ", ".join(nombre_imagen(r) for r in v or [])
        elif campo == "colores":
            fila[col] = "\n".join(f"{c['nombre']} {c['hex']} {nombre_imagen(c['img'])}" for c in v or [])
        elif campo == "video":
            fila[col] = re.sub(r"^assets/video/", "", v or "")
        elif campo in ("precio", "orden", "heroOrden") and v is not None:
            fila[col] = numero(v)
        else:
            fila[col] = "" if v is None else str(v)
    return fila


def exportar(destino: str) -> None:
    productos = json.loads(JSON.read_text(encoding="utf-8"))
    with open(destino, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[c for c, _ in COLUMNAS])
        w.writeheader()
        for p in sorted(productos, key=lambda p: p["orden"]):
            w.writerow(a_fila(p))
    print(f"{len(productos)} productos exportados a {destino}")


# ---------- filas -> productos.json ----------
def leer_csv(origen: str) -> list[dict]:
    if re.match(r"https?://", origen):
        with urllib.request.urlopen(origen, timeout=60) as r:
            texto = r.read().decode("utf-8-sig")
    else:
        texto = Path(origen).read_text(encoding="utf-8-sig")
    lector = csv.DictReader(io.StringIO(texto))
    faltan = [c for c, _ in COLUMNAS if c not in (lector.fieldnames or [])]
    if faltan:
        raise SystemExit(f"La hoja no tiene las columnas: {', '.join(faltan)}. No se cambió nada.")
    # Las filas totalmente vacías (p. ej. al final de la hoja) se ignoran.
    return [f for f in lector if any((v or "").strip() for v in f.values())]


def de_fila(fila: dict, n: int, errores: list[str]) -> dict:
    nombre = (fila.get("nombre") or "").strip() or f"(sin nombre)"
    def error(texto: str) -> None:
        errores.append(f"Fila {n} ({nombre}): {texto}")
    def num(col: str, entero: bool = False):
        bruto = (fila.get(col) or "").strip().replace("S/", "").replace(" ", "")
        if not bruto:
            return None
        bruto = bruto.replace(",", ".") if bruto.count(",") == 1 and "." not in bruto else bruto.replace(",", "")
        try:
            v = float(bruto)
        except ValueError:
            error(f"«{col}» debe ser un número (está «{fila.get(col)}»)")
            return None
        if entero:
            if not v.is_integer():
                error(f"«{col}» debe ser un número entero")
            return int(v)
        return int(v) if v.is_integer() else round(v, 2)
    def booleano(col: str) -> bool:
        bruto = (fila.get(col) or "").strip().lower()
        if bruto in SI:
            return True
        if bruto not in NO:
            error(f"«{col}» debe ser sí o no (está «{fila.get(col)}»)")
        return False

    p: dict = {}
    p["id"] = num("id", entero=True)
    p["orden"] = num("orden")
    p["activo"] = booleano("activo")
    for col, campo in (("categoria", "categoria"), ("coleccion", "coleccion"), ("etiqueta", "badge"), ("nombre", "nombre"),
                       ("medida", "medida"), ("material", "material"), ("tipo", "tipo"), ("disponibilidad", "disponibilidad"),
                       ("descripcion", "descripcion"), ("slug", "slug"), ("heroFoco", "heroFoco"), ("fechaAlta", "fechaAlta")):
        valor = (fila.get(col) or "").strip()
        if valor:
            p[campo] = valor
    cotizar = booleano("cotizar")
    precio = num("precio")
    p["precio"] = precio if precio is not None else 0
    if cotizar:
        p["requiereCotizacion"] = True
    p["imagenes"] = [ruta_imagen(x) for x in re.split(r"[,\n]", fila.get("imagenes") or "") if x.strip()]
    colores = []
    for linea in re.split(r"[;\n]", fila.get("colores") or ""):
        if not linea.strip():
            continue
        m = re.fullmatch(r"\s*(.+?)\s+(#[0-9a-fA-F]{6})\s+(\S.*?)\s*", linea)
        if not m:
            error(f"color «{linea.strip()}» no tiene el formato «Nombre #rrggbb imagen»")
            continue
        colores.append({"nombre": m.group(1), "hex": m.group(2).lower(), "img": ruta_imagen(m.group(3))})
    if colores:
        p["colores"] = colores
    video = (fila.get("video") or "").strip()
    if video:
        p["video"] = video if video.startswith("assets/") else f"assets/video/{video}"
    hero = num("heroOrden", entero=True)
    if hero is not None:
        p["heroOrden"] = hero
    if p.get("id") is None:
        error("falta el id")
    return {k: p[k] for k in ORDEN_JSON if k in p}


def importar(origen: str) -> None:
    filas = leer_csv(origen)
    errores: list[str] = []
    productos = [de_fila(f, n, errores) for n, f in enumerate(filas, start=2)]
    if not errores:
        usados = {p["id"] for p in productos if isinstance(p.get("id"), int)}
        errores = validar(productos)
        if any("falta «id»" in e for e in errores):
            errores.append(f"El siguiente id libre es {max(usados or {0}) + 1}.")
    if errores:
        print("No se actualizó el catálogo; corrige en la hoja:")
        for e in errores:
            print(f"  ✗ {e}")
        sys.exit(1)
    nuevo = json.dumps(productos, ensure_ascii=False, indent=2) + "\n"
    anterior = JSON.read_text(encoding="utf-8")
    if nuevo == anterior:
        print(f"Sin cambios ({len(productos)} productos).")
        return
    JSON.write_text(nuevo, encoding="utf-8")
    print(f"productos.json actualizado: {len(productos)} productos.")


def faltantes(origen: str) -> None:
    """Imprime, una por línea, las imágenes que nombra la hoja y no existen aún en assets/."""
    nombres = set()
    for f in leer_csv(origen):
        nombres |= {nombre_imagen(ruta_imagen(x)) for x in re.split(r"[,\n]", f.get("imagenes") or "") if x.strip()}
        for linea in re.split(r"[;\n]", f.get("colores") or ""):
            m = re.fullmatch(r"\s*(.+?)\s+(#[0-9a-fA-F]{6})\s+(\S.*?)\s*", linea)
            if m:
                nombres.add(nombre_imagen(ruta_imagen(m.group(3))))
    for n in sorted(nombres):
        if not (ROOT / "assets" / f"{n}.webp").exists():
            print(n)


def videos(origen: str) -> None:
    """Imprime, uno por línea, los videos que nombra la hoja y no existen aún en assets/video/."""
    for nombre in sorted({(f.get("video") or "").strip() for f in leer_csv(origen)} - {""}):
        nombre = re.sub(r"^assets/video/", "", nombre)
        if not (ROOT / "assets" / "video" / nombre).exists():
            print(nombre)


# Archivos fuente que pueden nombrar imágenes o videos fuera de productos.json (logo, póster, video de portada...).
FUENTES_WEB = ["index.html", "catalogo.js", "producto.js", "tienda.js", "chrome.js", "analytics.js", "styles.css",
               "chrome.css", "producto.css", "paginas.css", "fonts.css", "scripts/build_product_pages.py"]


def limpiar(modo: str) -> None:
    """Quita del sitio las imágenes (4 niveles, WebP y AVIF) y los videos que no usa ningún producto ni ninguna página."""
    productos = json.loads(JSON.read_text(encoding="utf-8"))
    usadas = {Path(r).stem for p in productos for r in list(p["imagenes"]) + [c["img"] for c in p.get("colores") or []]}
    videos = {Path(p["video"]).name for p in productos if p.get("video")}
    textos = "".join((ROOT / f).read_text(encoding="utf-8", errors="ignore") for f in FUENTES_WEB if (ROOT / f).exists())
    textos += "".join(f.read_text(encoding="utf-8") for f in (ROOT / "scripts" / "chrome").glob("*.html"))
    nombrada = lambda n: re.search(re.escape(n) + r"\.(webp|avif|png|jpe?g)", textos)   # nombre + extensión, no una palabra suelta
    sobran = sorted(f.stem for f in (ROOT / "assets").glob("*.webp") if f.stem not in usadas and not nombrada(f.stem))
    videos_sobran = sorted(f.name for f in (ROOT / "assets" / "video").iterdir() if f.name not in videos and f.name not in textos)
    for n in sobran:
        print(f"imagen sin uso: {n}")
    for n in videos_sobran:
        print(f"video sin uso: {n}")
    if modo != "--aplicar":
        return
    for n in sobran:
        for nivel in ("", "sm/", "md/", "hd/"):
            for ext in ("webp", "avif"):
                (ROOT / "assets" / f"{nivel}{n}.{ext}").unlink(missing_ok=True)
    for n in videos_sobran:
        (ROOT / "assets" / "video" / n).unlink()
    indice_ruta = ROOT / "assets" / "hd" / "index.json"
    indice = json.loads(indice_ruta.read_text(encoding="utf-8"))
    if any(n in indice for n in sobran):
        indice = {k: v for k, v in indice.items() if k not in sobran}
        indice_ruta.write_text(json.dumps(indice, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    comandos = {"exportar": exportar, "importar": importar, "faltantes": faltantes, "videos": videos, "limpiar": limpiar}
    if len(sys.argv) != 3 or sys.argv[1] not in comandos:
        print(__doc__)
        sys.exit(2)
    comandos[sys.argv[1]](sys.argv[2])
