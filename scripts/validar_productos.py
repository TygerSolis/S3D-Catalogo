#!/usr/bin/env python3
"""Valida productos.json (o una lista ya cargada) y devuelve los errores en lenguaje claro.

Lo usan el generador de páginas y la sincronización desde la hoja de cálculo: si hay un error,
no se publica nada. Uso directo:  python3 scripts/validar_productos.py
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISPONIBILIDAD = ("A pedido", "En stock", "Agotado")
OBLIGATORIOS = ("id", "nombre", "categoria", "medida", "material", "tipo", "descripcion", "fechaAlta", "imagenes", "disponibilidad", "activo", "orden")


def _existe_imagen(ruta: str) -> bool:
    """Una imagen publicada existe en los tres niveles (estándar, md, sm) y en WebP y AVIF."""
    if not ruta.startswith("assets/") or not ruta.endswith(".webp"):
        return False
    for nivel in ("", "md/", "sm/"):
        base = ROOT / ruta.replace("assets/", f"assets/{nivel}", 1)
        if not base.exists() or not base.with_suffix(".avif").exists():
            return False
    return True


def validar(productos: list, comprobar_archivos: bool = True) -> list[str]:
    errores: list[str] = []
    if not isinstance(productos, list) or not productos:
        return ["La lista de productos está vacía."]
    vistos_id, vistos_slug = {}, {}
    for n, p in enumerate(productos, start=1):
        nombre = str(p.get("nombre") or f"fila {n}")
        def error(texto: str) -> None:
            errores.append(f"{nombre}: {texto}")
        for campo in OBLIGATORIOS:
            if p.get(campo) in (None, "", []):
                error(f"falta «{campo}»")
        if not isinstance(p.get("id"), int) or p.get("id", 0) <= 0:
            error("el id debe ser un número entero positivo")
        elif p["id"] in vistos_id:
            error(f"el id {p['id']} se repite con {vistos_id[p['id']]}")
        else:
            vistos_id[p["id"]] = nombre
        slug = p.get("slug")
        if slug is not None:
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(slug)):
                error(f"slug inválido «{slug}» (solo minúsculas, números y guiones)")
            elif slug in vistos_slug:
                error(f"el slug «{slug}» se repite con {vistos_slug[slug]}")
            else:
                vistos_slug[slug] = nombre
        cotizar = bool(p.get("requiereCotizacion"))
        precio = p.get("precio")
        if not cotizar and not (isinstance(precio, (int, float)) and precio > 0):
            error("necesita un precio mayor que 0 o marcar «requiereCotizacion»")
        if p.get("disponibilidad") not in DISPONIBILIDAD:
            error(f"disponibilidad «{p.get('disponibilidad')}» no válida (usa: {', '.join(DISPONIBILIDAD)})")
        if not isinstance(p.get("activo"), bool):
            error("«activo» debe ser sí o no")
        if not isinstance(p.get("orden"), (int, float)):
            error("«orden» debe ser un número")
        try:
            date.fromisoformat(str(p.get("fechaAlta")))
        except ValueError:
            error(f"fechaAlta «{p.get('fechaAlta')}» no es una fecha AAAA-MM-DD")
        for c in p.get("colores") or []:
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", str(c.get("hex", ""))):
                error(f"el color «{c.get('nombre')}» tiene un código inválido «{c.get('hex')}» (ej.: #ff99cc)")
            if not c.get("nombre"):
                error("hay un color sin nombre")
        if comprobar_archivos:
            rutas = list(p.get("imagenes") or []) + [c.get("img", "") for c in p.get("colores") or []]
            for ruta in rutas:
                if not _existe_imagen(ruta):
                    error(f"no existe la imagen «{ruta}» (súbela a R2 fuentes/ o revisa el nombre)")
            if p.get("video") and not (ROOT / p["video"]).exists():
                error(f"no existe el video «{p['video']}»")
    return errores


if __name__ == "__main__":
    lista = json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))
    errores = validar(lista)
    for e in errores:
        print(f"✗ {e}")
    print(f"{len(lista)} productos, {len(errores)} errores")
    sys.exit(1 if errores else 0)
