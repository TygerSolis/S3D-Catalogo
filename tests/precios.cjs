// Precio por color (p. ej. árbol navideño blanco con luz LED / verde): hoja, ficha, tarjeta, buscador, pedido y WhatsApp.
const { execFileSync } = require('child_process');
const path = require('path');
const { assert, abrir, RAIZ } = require('./util.cjs');

const NOMBRE = 'HELLO KITTY URBANA';
const CATEGORIA = '?categoria=Mu%C3%B1ecos%20Coleccionables';
// Hello Kitty Urbana con precio propio en dos colores (Gris 80, Amarillo 65; Rosa y Negro usan el precio, 70),
// una foto extra que no es de ningún color y un video.
const PREPARAR_PY = `x = next(q for q in p if q['nombre'] == '${NOMBRE}')
x['colores'][1]['precio'] = 80; x['colores'][3]['precio'] = 65
x['imagenes'] = x['imagenes'] + [next(q for q in p if q['nombre'] == 'WOODY')['imagenes'][0]]
x['video'] = 'assets/video/barber-bart-video.mp4'`;
const py = codigo => execFileSync('python3', ['-c', `import json, build_product_pages as b, hoja_catalogo as h
from validar_productos import validar
p = json.load(open('../productos.json'))
${PREPARAR_PY}
${codigo}`], { cwd: path.join(RAIZ, 'scripts'), encoding: 'utf8' });

const conPrecios = pagina => pagina.route(/productos\.json/, async ruta => {
    const lista = await (await ruta.fetch()).json();
    const x = lista.find(q => q.nombre === NOMBRE);
    x.colores[1].precio = 80;
    x.colores[3].precio = 65;
    x.imagenes = [...x.imagenes, lista.find(q => q.nombre === 'WOODY').imagenes[0]];
    x.video = 'assets/video/barber-bart-video.mp4';
    await ruta.fulfill({ json: lista });
});
const tarjeta = pagina => pagina.locator('.catalog-carousel-card', { hasText: NOMBRE }).first();
const mensaje = async enlace => decodeURIComponent((await enlace.getAttribute('href')).split('text=')[1]);

module.exports = {
    'la hoja acepta el precio al final de la línea del color y lo conserva al exportar'() {
        const r = JSON.parse(py(`fila = h.a_fila(x)
errores = []
vuelta = h.de_fila(fila, 2, errores)
m = h.COLOR_RE.fullmatch('Verde (22 cm) #2f6b3a arbol-1 S/ 30,50')
malo = dict(x, colores=[dict(x['colores'][0], precio=0)])
print(json.dumps({'celda': fila['colores'], 'igual': vuelta == x, 'errores': errores, 'm': m.groups(), 'validar': validar([malo], comprobar_archivos=False)}))`));
        assert.match(r.celda, /^Gris #[0-9a-f]{6} \S+ 80$/m);
        assert.match(r.celda, /^Rosa #[0-9a-f]{6} \S+$/m);
        assert.ok(r.igual, 'exportar e importar debe dejar el producto idéntico');
        assert.deepEqual(r.errores, []);
        assert.deepEqual(r.m, ['Verde (22 cm)', '#2f6b3a', 'arbol-1', '30,50']);
        assert.ok(r.validar.some(e => e.includes('precio inválido')));
    },
    async 'ficha: el color cambia precio, WhatsApp y pedido; las fotos extra y el video siguen visibles'({ browser }) {
        const html = py('print(b.pagina(x, p))');
        const p = await abrir(browser, 'producto/hello-kitty-urbana/', {
            preparar: pagina => pagina.route(/producto\/hello-kitty-urbana\/$/, ruta => ruta.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }))
        });
        const oferta = JSON.parse(await p.locator('script[type="application/ld+json"]').first().textContent()).offers;
        assert.deepEqual([oferta['@type'], oferta.lowPrice, oferta.highPrice], ['AggregateOffer', '65.00', '80.00']);
        assert.equal(await p.locator('#pp-price-value').textContent(), '70.00');
        assert.match(await p.locator('.pp-price-note').textContent(), /según el color elegido/);
        // Miniaturas bajo los colores: la foto del primer color + la extra, y el video
        assert.equal(await p.locator('[data-pp-thumb]').count(), 2);
        assert.equal(await p.locator('[data-pp-video]').count(), 1);
        await p.locator('[data-pp-thumb]').nth(1).click();
        assert.match(await p.locator('#pp-main-img').getAttribute('src'), /ts-woody|woody/i);
        await p.locator('.pp-swatch').nth(1).click();
        assert.equal(await p.locator('#pp-price-value').textContent(), '80.00');
        assert.match(await p.locator('#pp-main-img').getAttribute('src'), /hk-urbana-gris/);
        assert.match(await mensaje(p.locator('#pp-buy')), /Color: Gris\) - Precio: S\/ 80\.00/);
        await p.click('#pp-add');
        await p.locator('.pp-swatch').nth(3).click();
        assert.equal(await p.locator('#pp-price-value').textContent(), '65.00');
        await p.click('#pp-add');
        await p.click('#s3d-fab');
        assert.equal(await p.locator('.s3d-total-valor').textContent(), 'S/ 145.00');
        assert.deepEqual(p.errores, []);
        assert.deepEqual(p.violaciones, []);
        await p.contexto.close();
    },
    async 'catálogo: la tarjeta muestra el precio del color elegido; el buscador dice «Desde»'({ browser }) {
        const p = await abrir(browser, CATEGORIA, { preparar: conPrecios });
        const hk = tarjeta(p);
        const precio = hk.locator('[data-precio-label]');
        assert.equal(await precio.textContent(), 'S/ 70.00');
        await hk.locator('.catalog-carousel-swatch').nth(1).click();
        assert.equal(await precio.textContent(), 'S/ 80.00');
        assert.match(await mensaje(hk.locator('[data-carousel-buy]')), /Color: Gris\) - Precio: S\/ 80\.00/);
        await hk.locator('[data-pedido-add]').click();
        await p.click('#s3d-fab');
        assert.equal(await p.locator('.s3d-total-valor').textContent(), 'S/ 80.00');
        await p.keyboard.press('Escape');
        // El visor incluye la foto extra y el video además de los 4 colores
        await hk.locator('.catalog-carousel-image').click();
        assert.equal(await p.locator('#lightbox-thumbs [data-lightbox-thumb]').count(), 6);
        await p.keyboard.press('Escape');
        await p.fill('#search-input', 'urbana');
        const opciones = await p.$$eval('#search-suggest [role=option]', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
        assert.ok(opciones.some(o => o.includes(NOMBRE) && o.includes('Desde S/ 65.00')), opciones.join(' | '));
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    }
};
