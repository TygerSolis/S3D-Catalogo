// Personalizador «Diseña tu llavero» (/llavero/, D14): vista previa, precios por cantidad, nombre seguro y pedido.
const path = require('path');
const { execFileSync } = require('child_process');
const { assert, RAIZ, leerJson, abrir } = require('./util.cjs');

const URL_PRUEBA = 'https://script.google.com/macros/s/PRUEBA/exec';
const CODIGO = /^Pedido (S3D-[2-9A-HJ-NP-Z]{5})\n/;
const config = () => leerJson('config.json').llavero;
const soporte = () => leerJson('productos.json').find(p => p.id === config().modelos.find(m => m.productoId).productoId);

// Abre /llavero/ con el registro de pedidos ENCENDIDO (tienda.js con una URL de prueba) y captura envíos y WhatsApp.
async function abrirConRegistro(browser, ruta = 'llavero/', opciones = {}) {
    const envios = [];
    const p = await abrir(browser, ruta, {
        ...opciones,
        preparar: async pagina => {
            await pagina.route(/tienda\.js/, async r => {
                const cuerpo = (await (await r.fetch()).text()).replace(/const PEDIDOS_URL = '[^']*';/, `const PEDIDOS_URL = '${URL_PRUEBA}';`);
                await r.fulfill({ contentType: 'text/javascript', body: cuerpo });
            });
            await pagina.context().route('https://script.google.com/**', r => { envios.push(JSON.parse(r.request().postData())); r.fulfill({ json: { ok: true } }); });
            await pagina.context().route('https://api.whatsapp.com/**', r => r.fulfill({ contentType: 'text/html', body: 'wa' }));
        }
    });
    p.envios = envios;
    return p;
}
const cantidad = async (p, n) => { await p.fill('#ll-cantidad', String(n)); await p.dispatchEvent('#ll-cantidad', 'change'); };

module.exports = {
    async 'la página muestra los modelos con sus precios y la vista previa dibuja el nombre'({ browser }) {
        const p = await abrir(browser, 'llavero/');
        assert.equal(await p.locator('h1').innerText(), 'Diseña tu llavero con nombre');
        const modelos = await p.locator('input[name="modelo"]').evaluateAll(rs => rs.map(r => [r.value, JSON.parse(r.dataset.escalas)]));
        const nombre = config().modelos.find(m => m.id === 'nombre');
        assert.deepEqual(modelos[0], ['nombre', [[1, nombre.precio], ...nombre.escalas.map(e => [e.desde, e.precio])]]);
        assert.equal(modelos[1][0], 'soporte');
        assert.equal(modelos[1][1][0][1], soporte().precio, 'el soporte toma su precio de la hoja');
        // Forma: solo para el llavero con nombre.
        assert.equal(await p.locator('#ll-formas').isVisible(), true);
        await p.check('input[name="modelo"][value="soporte"]');
        assert.equal(await p.locator('#ll-formas').isVisible(), false);
        await p.check('input[name="modelo"][value="nombre"]');
        // Vista previa: el nombre llega como texto; el viewBox se ajusta al dibujo.
        const antes = await p.getAttribute('#ll-svg', 'viewBox');
        await p.fill('#ll-nombre', 'Judith');
        const textos = await p.locator('#ll-dibujo text').allTextContents();
        assert.ok(textos.length >= 3 && textos.every(t => t === 'Judith'), textos.join('|'));
        assert.notEqual(await p.getAttribute('#ll-svg', 'viewBox'), antes);
        assert.equal(await p.locator('#ll-cuenta').innerText(), '6/12');
        // Colores: el de las letras se aplica al texto de encima; mismo color en base y letras avisa.
        await p.check('input[name="letras"][value="Rojo"]', { force: true });
        assert.equal(await p.locator('#ll-dibujo > text').last().getAttribute('fill'), config().colores.find(c => c.nombre === 'Rojo').hex);
        await p.check(`input[name="base"][value="Rojo"]`, { force: true });
        assert.equal(await p.locator('#ll-contraste').isVisible(), true);
        // Las 3 formas de dibujo funcionan sin errores.
        await p.check('input[name="forma"][value="placa"]', { force: true });
        await p.check('input[name="letra"][value="manuscrita"]', { force: true });
        await p.check('input[name="modelo"][value="soporte"]', { force: true });
        assert.ok(await p.locator('#ll-dibujo rect').count() >= 2);
        assert.deepEqual(p.errores, []);
        assert.deepEqual(p.violaciones, []);
        await p.contexto.close();
    },
    async 'el nombre solo admite letras, números y pocos signos, hasta 12 caracteres (nunca HTML)'({ browser }) {
        const p = await abrir(browser, 'llavero/');
        await p.fill('#ll-nombre', '<b>Ñandú</b>');
        assert.equal(await p.inputValue('#ll-nombre'), 'bÑandúb');
        assert.equal(await p.locator('#ll-error').isVisible(), true);
        assert.equal(await p.locator('#ll-svg b').count(), 0);
        // Aunque llegue más largo (pegado o autocompletado), se recorta a 12.
        await p.evaluate(() => { const i = document.getElementById('ll-nombre'); i.value = 'ABCDEFGHIJKLMNOP'; i.dispatchEvent(new Event('input')); });
        assert.equal(await p.inputValue('#ll-nombre'), 'ABCDEFGHIJKL');
        await p.fill('#ll-nombre', 'María José & Co.-123');
        assert.equal(await p.inputValue('#ll-nombre'), 'María José &');
        assert.equal(await p.locator('#ll-error').isVisible(), false);
        assert.equal(await p.locator('#ll-dibujo text').first().textContent(), 'María José &');
        await p.contexto.close();
    },
    async 'el precio por unidad baja por cantidad y el total se actualiza'({ browser }) {
        const p = await abrir(browser, 'llavero/');
        const casos = [[1, 'S/ 10.00', '1 × S/ 10.00'], [11, 'S/ 110.00', '11 × S/ 10.00'], [12, 'S/ 102.00', '12 × S/ 8.50'], [50, 'S/ 375.00', '50 × S/ 7.50'], [5000, 'S/ 7492.50', '999 × S/ 7.50']];
        for (const [n, total, detalle] of casos) {
            await cantidad(p, n);
            assert.equal(await p.locator('#ll-total').innerText(), total, `cantidad ${n}`);
            assert.equal(await p.locator('#ll-unitario').innerText(), detalle);
        }
        assert.equal(await p.locator('.ll-escalas:not([hidden]) li.ll-activa').innerText(), '50 o más: S/ 7.50');
        await cantidad(p, 1);
        await p.click('[data-delta="1"]');
        await p.click('[data-delta="1"]');
        assert.equal(await p.inputValue('#ll-cantidad'), '3');
        await p.click('[data-delta="-1"]');
        assert.equal(await p.locator('#ll-total').innerText(), 'S/ 20.00');
        await p.contexto.close();
        // ?modelo=soporte (enlace de la ficha) lo deja elegido, con su escala.
        const s = await abrir(browser, 'llavero/?modelo=soporte');
        assert.equal(await s.isChecked('input[name="modelo"][value="soporte"]'), true);
        await cantidad(s, 12);
        assert.equal(await s.locator('#ll-unitario').innerText(), '12 × S/ 10.00');
        assert.equal(await s.locator('.ll-escalas[data-modelo="nombre"]').isVisible(), false);
        await s.contexto.close();
    },
    async 'Pedir por WhatsApp: sin nombre avisa; con nombre registra el pedido y manda todo el diseño'({ browser }) {
        const p = await abrirConRegistro(browser);
        await p.click('#ll-pedir');
        await p.waitForTimeout(200);
        assert.equal(p.contexto.pages().length, 1, 'sin nombre no abre WhatsApp');
        assert.equal(await p.locator('#ll-error').innerText(), 'Escribe el nombre que llevará el llavero.');
        assert.equal(p.envios.length, 0);
        await p.fill('#ll-nombre', 'Judith');
        await p.check('input[name="forma"][value="placa"]', { force: true });
        await p.check('input[name="letra"][value="bloque"]', { force: true });
        await p.check('input[name="base"][value="Negro"]', { force: true });
        await p.check('input[name="letras"][value="Amarillo"]', { force: true });
        await cantidad(p, 12);
        const [wa] = await Promise.all([p.contexto.waitForEvent('page'), p.click('#ll-pedir')]);
        const mensaje = new URL(wa.url()).searchParams.get('text');
        const codigo = mensaje.match(CODIGO)?.[1];
        assert.ok(codigo, mensaje.slice(0, 80));
        for (const linea of ['• Modelo: Llavero con nombre — Placa rectangular', '• Nombre: Judith', '• Letra: Bloque', '• Colores: base Negro, letras Amarillo', '• Cantidad: 12 × S/ 8.50 = S/ 102.00 (incluye IGV)']) {
            assert.ok(mensaje.includes(linea), `falta «${linea}» en:\n${mensaje}`);
        }
        assert.match(mensaje, /llavero\/$/);
        await p.waitForTimeout(300);
        assert.equal(p.envios.length, 1);
        const e = p.envios[0];
        assert.equal(e.codigo, codigo);
        assert.equal(e.tipo, 'comprar');
        assert.deepEqual(e.items, [{ nombre: 'LLAVERO CON NOMBRE', cantidad: 12, precio: 8.5, color: 'base Negro, letras Amarillo', medida: 'Judith, Bloque, Placa rectangular' }]);
        assert.equal(e.total, 102);
        const eventos = p.eventos.filter(ev => ev.nombre === 'llavero_pedir');
        assert.deepEqual(eventos.map(ev => ev.datos), [{ modelo: 'nombre', forma: 'placa', cantidad: 12 }]);
        // El soporte se registra con el nombre del producto de la hoja (así cuenta para «Lo más pedido»).
        await p.check('input[name="modelo"][value="soporte"]', { force: true });
        const [wa2] = await Promise.all([p.contexto.waitForEvent('page'), p.click('#ll-pedir')]);
        assert.ok(new URL(wa2.url()).searchParams.get('text').includes('• Modelo: Soporte para celular\n'));
        await p.waitForTimeout(300);
        assert.equal(p.envios[1].items[0].nombre, soporte().nombre);
        assert.equal(p.envios[1].items[0].medida, 'Judith, Bloque');
        assert.deepEqual(p.errores, []);
        assert.deepEqual(p.violaciones, []);
        await p.contexto.close();
    },
    async 'se llega desde el catálogo (Llaveros), la ficha del soporte, la guía de regalos y el pie'({ browser }) {
        const portada = await abrir(browser, '?categoria=Llaveros');
        assert.equal(await portada.locator('a.llavero-banner[href="llavero/"]').count(), 1);
        assert.equal(await portada.locator('.site-footer a[href="llavero/"]').count(), 1);
        await portada.click('a.llavero-banner');
        await portada.waitForURL(/\/llavero\/$/);
        assert.deepEqual(portada.eventos.filter(e => e.nombre === 'llavero_desde_catalogo').length, 1);
        await portada.contexto.close();
        const ficha = await abrir(browser, `producto/${soporte().slug}/`);
        await ficha.click('a.pp-disena');
        await ficha.waitForURL(/\/llavero\/\?modelo=soporte$/);
        assert.equal(await ficha.isChecked('input[name="modelo"][value="soporte"]'), true);
        await ficha.contexto.close();
        const otra = await abrir(browser, 'producto/woody/');
        assert.equal(await otra.locator('a.pp-disena').count(), 0, 'solo los productos del personalizador llevan el enlace');
        await otra.contexto.close();
        const regalos = await abrir(browser, 'regalos/');
        assert.equal(await regalos.locator('a.pg-destacado[href="../llavero/"]').count(), 1);
        await regalos.contexto.close();
    },
    'generador: el soporte oculto no se ofrece y una escala que no baja el precio se ignora'() {
        const salida = JSON.parse(execFileSync('python3', ['-c', `import json, contextlib, io, build_product_pages as b
p = json.load(open('../productos.json'))
for x in p: x.setdefault('slug', b.slugify(x['nombre']))
normal = [m['id'] for m in b.modelos_llavero(p)]
sop = next(m for m in b.LLAVERO['modelos'] if 'productoId' in m)
for x in p:
    if x['id'] == sop['productoId']: x['activo'] = False
aviso = io.StringIO()
with contextlib.redirect_stdout(aviso): sin_soporte = [m['id'] for m in b.modelos_llavero(p)]
b.LLAVERO['modelos'][0]['escalas'] = [{'desde': 12, 'precio': 8.5}, {'desde': 30, 'precio': 9}, {'desde': 50, 'precio': 7.5}]
with contextlib.redirect_stdout(io.StringIO()): escalas = b.modelos_llavero(p)[0]['escalas']
print(json.dumps({'normal': normal, 'sin': sin_soporte, 'aviso': aviso.getvalue(), 'escalas': escalas, 'texto': b.texto_escalas(escalas)}))`], { cwd: path.join(RAIZ, 'scripts'), encoding: 'utf8' }));
        assert.deepEqual(salida.normal, ['nombre', 'soporte']);
        assert.deepEqual(salida.sin, ['nombre']);
        assert.match(salida.aviso, /no se ofrece/);
        assert.deepEqual(salida.escalas, [[1, 10], [12, 8.5], [50, 7.5]]);
        assert.deepEqual(salida.texto, ['1 a 11: S/ 10.00', '12 a 49: S/ 8.50', '50 o más: S/ 7.50']);
    }
};
