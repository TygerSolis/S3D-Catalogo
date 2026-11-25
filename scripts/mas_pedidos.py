#!/usr/bin/env python3
"""
«Lo más pedido»: trae del registro de pedidos (Apps Script de la hoja «Pedidos S3D», `?ver=mas-pedidos`) los nombres
de los productos con más pedidos distintos de los últimos 30 días y escribe mas-pedidos.json con sus ids, en orden.
El Apps Script solo devuelve nombres (ni cantidades ni datos de clientes). Un nombre que comparten varios productos
(p. ej. DUMMY) no se puede asignar y se omite; uno que ya no existe, también.

build_product_pages.py lee mas-pedidos.json: etiqueta «Lo más pedido» en los primeros, sección en la portada y orden
de la cola de redes. Lo ejecuta el workflow catalogo-desde-hoja.yml antes de regenerar; si el registro no responde,
el archivo se queda como estaba (la web nunca falla por esto).

Uso:  python3 scripts/mas_pedidos.py
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARCHIVO = ROOT / "mas-pedidos.json"


def ids_de(nombres: list[str], productos: list[dict]) -> list[int]:
    """Nombres (en mayúsculas, como los anota el registro) → ids, en el mismo orden, sin ambiguos ni repetidos."""
    por_nombre: dict[str, list[int]] = {}
    for p in productos:
        por_nombre.setdefault(p["nombre"].strip().upper(), []).append(p["id"])
    salida = []
    for nombre in nombres:
        ids = por_nombre.get(str(nombre).strip().upper(), [])
        if len(ids) == 1 and ids[0] not in salida:
            salida.append(ids[0])
    return salida


def traer(url: str) -> list[str]:
    with urllib.request.urlopen(url + "?ver=mas-pedidos", timeout=60) as r:   # el Apps Script redirige (302): urllib lo sigue
        datos = json.loads(r.read().decode("utf-8"))
    nombres = datos.get("productos")
    if not isinstance(nombres, list) or not all(isinstance(n, str) for n in nombres):
        raise ValueError("respuesta inesperada del registro de pedidos")
    return nombres[:50]


def escribir(ids: list[int]) -> bool:
    texto = json.dumps({"ids": ids}) + "\n"
    if ARCHIVO.exists() and ARCHIVO.read_text(encoding="utf-8") == texto:
        return False
    ARCHIVO.write_text(texto, encoding="utf-8")
    return True


def main() -> int:
    url = json.loads((ROOT / "config.json").read_text(encoding="utf-8")).get("pedidosUrl", "")
    if not url:
        print("Sin pedidosUrl en config.json: no se actualiza «Lo más pedido».")
        return 0
    try:
        nombres = traer(url)
    except Exception as error:   # el registro caído no debe frenar la actualización del catálogo
        print(f"::warning::No se pudo leer «Lo más pedido» del registro de pedidos ({error}); se mantiene la lista anterior.")
        return 0
    productos = json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))
    ids = ids_de(nombres, productos)
    print(("«Lo más pedido» actualizado: " if escribir(ids) else "«Lo más pedido» sin cambios: ") + (", ".join(map(str, ids)) or "(vacío)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
