// Comprobaciones de datos y archivos (sin navegador).
const fs = require('fs');
const path = require('path');
const { assert, RAIZ, leerJson } = require('./util.cjs');

const existe = ruta => fs.existsSync(path.join(RAIZ, ruta));
const productos = () => leerJson('productos.json');
const rutasImagen = p => [...p.imagenes, ...(p.colores || []).map(c => c.img)];

module.exports = {
    'no quedan fotos ni videos publicados que no use ningún producto ni página'() {
        const { execFileSync } = require('child_process');
        const salida = execFileSync('python3', ['scripts/hoja_catalogo.py', 'limpiar', 'listar'], { cwd: RAIZ, encoding: 'utf8' });
        assert.equal(salida.trim(), '', `archivos sin uso:\n${salida}`);
    },
    'la hoja de cálculo: exportar e importar deja productos.json idéntico y los errores se explican por fila'() {
        const { execFileSync } = require('child_process');
        const os = require('os');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3d-hoja-'));
        const copia = path.join(dir, 'productos.json');
        const original = fs.readFileSync(path.join(RAIZ, 'productos.json'), 'utf8');
        const py = (...args) => execFileSync('python3', ['-c', `import sys, pathlib; sys.path.insert(0, 'scripts'); import hoja_catalogo as h
h.JSON = pathlib.Path(sys.argv[1]); getattr(h, sys.argv[2])(sys.argv[3])`, ...args], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        try {
            fs.writeFileSync(copia, original);
            py(copia, 'exportar', path.join(dir, 'hoja.csv'));
            assert.match(py(copia, 'importar', path.join(dir, 'hoja.csv')), /Sin cambios/);
            assert.equal(fs.readFileSync(copia, 'utf8'), original);
            // Una hoja con errores no toca el archivo y dice fila y motivo
            const csv = fs.readFileSync(path.join(dir, 'hoja.csv'), 'utf8').split('\n');
            csv[1] = csv[1].replace(',A pedido,', ',Pronto,').replace(/^1,10,sí,/, '1,10,quizá,');
            fs.writeFileSync(path.join(dir, 'mala.csv'), csv.join('\n'));
            let salida = '';
            try { py(copia, 'importar', path.join(dir, 'mala.csv')); } catch (error) { salida = error.stdout; }
            assert.match(salida, /Fila 2 \(WOODY\): «activo» debe ser sí o no/);
            assert.equal(fs.readFileSync(copia, 'utf8'), original);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
    'productos.json pasa el validador y el validador detecta datos erróneos'() {
        const { execFileSync } = require('child_process');
        const py = codigo => execFileSync('python3', ['-c', codigo], { cwd: path.join(RAIZ, 'scripts'), encoding: 'utf8' });
        assert.equal(py("import json; from validar_productos import validar; print(len(validar(json.load(open('../productos.json')))))").trim(), '0');
        const errores = JSON.parse(py(`import json; from validar_productos import validar
p = json.load(open('../productos.json'))
p[0]['disponibilidad'] = 'Mañana'; p[1]['imagenes'] = ['assets/no-existe.webp']; p[2]['id'] = p[3]['id']; p[4]['colores'] = [{'nombre': 'Rojo', 'hex': 'rojo', 'img': p[4]['imagenes'][0]}]; p[5]['activo'] = 'si'
print(json.dumps(validar(p)))`));
        for (const texto of ['disponibilidad «Mañana»', 'no existe la imagen «assets/no-existe.webp»', 'se repite', 'código inválido «rojo»', '«activo» debe ser sí o no']) {
            assert.ok(errores.some(e => e.includes(texto)), `el validador no detectó: ${texto}`);
        }
    },
    'la ficha refleja disponibilidad y producto oculto'() {
        const { execFileSync } = require('child_process');
        const html = execFileSync('python3', ['-c', `import json, build_product_pages as b
p = json.load(open('../productos.json'))
x = dict(p[0], disponibilidad='En stock', activo=False)
print(b.pagina(x, p))`], { cwd: path.join(RAIZ, 'scripts'), encoding: 'utf8' });
        assert.ok(html.includes('<p class="pp-disp pp-disp-stock">En stock</p>'));
        assert.ok(html.includes('class="pp-pausado"'));
        assert.ok(html.includes('"availability": "https://schema.org/InStock"'));
        assert.ok(decodeURIComponent(html.match(/id="pp-buy"[^>]*href="([^"]+)"/)[1]).includes('Figura en stock'));
    },
    'el número de WhatsApp sale solo de config.json'() {
        const { whatsapp, whatsappVisible } = leerJson('config.json');
        const leer = ruta => fs.readFileSync(path.join(RAIZ, ruta), 'utf8');
        // Las fuentes no lo escriben a mano: usan {{whatsapp}}, window.S3D.urlWhatsApp o config.json.
        for (const ruta of ['catalogo.js', 'producto.js', 'scripts/build_product_pages.py', 'scripts/chrome/header.html', 'scripts/chrome/footer.html']) {
            assert.ok(!/phone=\d|(?<!\d)51 ?9\d{2} ?\d{3} ?\d{3}(?!\d)/.test(leer(ruta)), `${ruta} tiene un número escrito a mano`);
        }
        // Todo lo generado usa el número de config.json.
        const fichas = fs.readdirSync(path.join(RAIZ, 'producto')).map(slug => `producto/${slug}/index.html`);
        for (const ruta of ['index.html', '404.html', 'privacidad/index.html', 'tienda.js', ...fichas]) {
            const texto = leer(ruta);
            for (const m of texto.matchAll(/phone=(\d+)/g)) assert.equal(m[1], whatsapp, `${ruta}: enlace a otro número`);
            for (const m of texto.matchAll(/\+\d{2} \d{3} \d{3} \d{3}/g)) assert.equal(m[0], whatsappVisible, `${ruta}: número visible distinto`);
        }
        assert.ok(leer('tienda.js').includes(`const WHATSAPP = '${whatsapp}';`));
    },
    'productos.json: ids y slugs únicos, campos obligatorios y fechas válidas'() {
        const lista = productos();
        assert.ok(lista.length > 0);
        assert.equal(new Set(lista.map(p => p.id)).size, lista.length, 'ids repetidos');
        assert.equal(new Set(lista.map(p => p.slug)).size, lista.length, 'slugs repetidos');
        for (const p of lista) {
            assert.ok(p.nombre && p.categoria && p.material && Array.isArray(p.imagenes) && p.imagenes.length, `incompleto: ${p.id}`);
            assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.fechaAlta || ''), `fechaAlta inválida en ${p.nombre}`);
            assert.ok(p.requiereCotizacion || p.precio > 0, `sin precio: ${p.nombre}`);
        }
    },
    'cada producto tiene su descripción propia (sin duplicados)'() {
        const textos = productos().map(p => p.descripcion);
        assert.ok(textos.every(t => t && t.length > 20));
        assert.equal(new Set(textos).size, textos.length, 'hay descripciones repetidas');
    },
    'todas las imágenes existen en los tres niveles y en WebP y AVIF'() {
        for (const p of productos()) {
            for (const ruta of rutasImagen(p)) {
                for (const nivel of ['', 'sm/', 'md/']) {
                    for (const extension of ['webp', 'avif']) {
                        const destino = ruta.replace(/^assets\//, `assets/${nivel}`).replace(/\.webp$/, `.${extension}`);
                        assert.ok(existe(destino), `falta ${destino} (${p.nombre})`);
                    }
                }
            }
            if (p.video) assert.ok(existe(p.video), `falta el video ${p.video}`);
        }
    },
    'el índice de alta resolución coincide con los archivos de assets/hd'() {
        const indice = leerJson('assets/hd/index.json');
        assert.ok(Object.keys(indice).length > 0);
        for (const nombre of Object.keys(indice)) {
            assert.ok(existe(`assets/hd/${nombre}.webp`) && existe(`assets/hd/${nombre}.avif`), `falta el original de ${nombre}`);
        }
    },
    'todas las fichas, la 404 y la privacidad existen y sus datos estructurados son JSON válido'() {
        const lista = productos();
        const titulos = new Set();
        for (const p of lista) {
            const archivo = `producto/${p.slug}/index.html`;
            assert.ok(existe(archivo), `falta ${archivo}`);
            const html = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
            for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
            const titulo = html.match(/<title>(.*?)<\/title>/)[1];
            assert.ok(!titulos.has(titulo), `título repetido: ${titulo}`);
            titulos.add(titulo);
            assert.ok(html.includes(`data-id="${p.id}"`) && html.includes('id="pp-cotizador"') && html.includes('Formas de pago'));
        }
        assert.ok(existe('404.html') && existe('privacidad/index.html'));
        const indice = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
        for (const m of indice.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
    },
    'todas las rutas locales de las páginas generadas existen'() {
        const rotas = [];
        const revisar = archivo => {
            const dir = path.dirname(archivo);
            const html = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
            for (const m of html.matchAll(/(?:src|href|srcset)="([^"]+)"/g)) {
                const valor = m[1].replace(/&amp;/g, '&');
                if (/^(https?:|mailto:|#|data:)/.test(valor)) continue;
                const limpio = decodeURIComponent(valor.split('?')[0].split('#')[0]);
                if (!limpio) continue;
                if (!fs.existsSync(path.join(RAIZ, dir, limpio))) rotas.push(`${archivo} -> ${valor}`);
            }
        };
        revisar('index.html');
        revisar('privacidad/index.html');
        productos().forEach(p => revisar(`producto/${p.slug}/index.html`));
        assert.deepEqual(rotas.slice(0, 5), [], `${rotas.length} referencias rotas`);
    },
    'el sitemap lista la portada, la privacidad y todas las fichas'() {
        const xml = fs.readFileSync(path.join(RAIZ, 'sitemap.xml'), 'utf8');
        assert.equal((xml.match(/<loc>/g) || []).length, productos().length + 2);
    }
};
