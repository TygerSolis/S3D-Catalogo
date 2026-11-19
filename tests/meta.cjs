// Catálogo para Meta / WhatsApp Business (meta/catalogo.csv y meta/fotos/): lo descarga Meta cada día.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { assert, RAIZ, leerJson } = require('./util.cjs');

// CSV con comillas (las descripciones llevan comas): se lee con el módulo csv de Python, el mismo que lo escribe.
const leerCsv = () => JSON.parse(execFileSync('python3', ['-c',
    'import csv, json, sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1], encoding="utf-8")))))',
    path.join(RAIZ, 'meta', 'catalogo.csv')], { encoding: 'utf8' }));

module.exports = {
    'catálogo de Meta: todos los productos activos con precio, variantes por color y campos que Meta exige'() {
        const filas = leerCsv();
        const { urlBase } = leerJson('config.json');
        const productos = leerJson('productos.json').filter(p => p.activo !== false && !p.requiereCotizacion);
        const esperadas = productos.reduce((n, p) => n + (p.colores?.length || 1), 0);
        assert.equal(filas.length, esperadas, 'un artículo por producto (o por color)');
        assert.equal(new Set(filas.map(f => f.id)).size, filas.length, 'ids repetidos');
        for (const f of filas) {
            for (const campo of ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand']) {
                assert.ok(f[campo], `${f.id}: falta ${campo}`);
            }
            assert.match(f.price, /^\d+\.\d{2} PEN$/, f.id);
            assert.ok(['in stock', 'out of stock'].includes(f.availability), f.id);   // «available for order» Meta lo marca «Incompleto»
            assert.ok(f.link.startsWith(`${urlBase}producto/`) && f.link.includes('utm_source=meta'), f.id);
            assert.match(f.image_link, new RegExp(`^${urlBase.replace(/[.]/g, '\\.')}meta/fotos/[^?]+\\.jpg\\?v=[0-9a-f]{8}$`), f.id);
            assert.doesNotMatch(f.description, /<|>/, `${f.id}: la descripción no lleva HTML`);
        }
        // Precio por color: el árbol navideño son 2 variantes del mismo grupo, cada una con su precio
        const arbol = filas.filter(f => f.item_group_id === 'S3D-3005');
        assert.deepEqual(arbol.map(f => [f.color, f.price]), [['Blanco con luz LED (28 cm)', '45.00 PEN'], ['Verde (22 cm)', '30.00 PEN']]);
        // «Cotizar» no va (Meta exige precio); disponibilidad según la hoja
        for (const p of leerJson('productos.json').filter(q => q.requiereCotizacion)) {
            assert.ok(!filas.some(f => f.id === `S3D-${p.id}` || f.item_group_id === `S3D-${p.id}`), p.nombre);
        }
        for (const p of productos) {
            const esperado = p.disponibilidad === 'Agotado' ? 'out of stock' : 'in stock';   // «A pedido» se puede comprar
            assert.ok(filas.filter(f => f.id === `S3D-${p.id}` || f.item_group_id === `S3D-${p.id}`).every(f => f.availability === esperado), p.nombre);
        }
    },
    async 'catálogo de Meta: cada foto es una JPG cuadrada (1080×1080) que existe, sin sobrantes'() {
        const filas = leerCsv();
        const { urlBase } = leerJson('config.json');
        const usadas = new Set(filas.map(f => decodeURIComponent(f.image_link.slice(urlBase.length).split('?')[0])));
        const archivos = fs.readdirSync(path.join(RAIZ, 'meta', 'fotos')).map(f => `meta/fotos/${f}`);
        assert.deepEqual([...archivos].sort(), [...usadas].sort());
        for (const ruta of archivos) {
            const m = await sharp(path.join(RAIZ, ruta)).metadata();
            assert.deepEqual([m.format, m.width, m.height], ['jpeg', 1080, 1080], ruta);
        }
    }
};
