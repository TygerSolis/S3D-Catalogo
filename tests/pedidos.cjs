// Registro de pedidos (Fase 2): código S3D-XXXXX en el mensaje y envío a la hoja (Apps Script simulado).
const { assert, abrir } = require('./util.cjs');

const URL_PRUEBA = 'https://script.google.com/macros/s/PRUEBA/exec';
const CODIGO = /^Pedido (S3D-[2-9A-HJ-NP-Z]{5})\n/;

// Abre la página con el registro ENCENDIDO: sirve tienda.js con PEDIDOS_URL de prueba y captura los envíos.
async function abrirConRegistro(browser, ruta = '') {
    const envios = [];
    const p = await abrir(browser, ruta, {
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
const textoDe = url => new URL(url).searchParams.get('text');

module.exports = {
    async 'Mi pedido: el mensaje empieza con el código y la hoja recibe productos, cantidades y total'({ browser }) {
        const p = await abrirConRegistro(browser, '?categoria=Mu%C3%B1ecos%20Coleccionables');
        const t = nombre => p.locator('.catalog-carousel-card', { hasText: nombre }).first();
        await t('WOODY').locator('[data-pedido-add]').click();
        await t('WOODY').locator('[data-pedido-add]').click();
        await t('BUZZ').locator('[data-pedido-add]').click();
        await p.click('#s3d-fab');
        const [wa] = await Promise.all([p.contexto.waitForEvent('page'), p.click('.s3d-enviar')]);
        const mensaje = textoDe(wa.url());
        const codigo = mensaje.match(CODIGO)?.[1];
        assert.ok(codigo, mensaje.slice(0, 80));
        assert.match(mensaje, /2 × WOODY/);
        await p.waitForTimeout(300);
        assert.equal(p.envios.length, 1);
        const e = p.envios[0];
        assert.equal(e.codigo, codigo);
        assert.equal(e.tipo, 'pedido');
        assert.deepEqual(e.items.map(i => [i.nombre, i.cantidad]), [['WOODY', 2], ['BUZZ', 1]]);
        assert.equal(e.total, 70 * 2 + e.items[1].precio);
        assert.match(e.pagina, /^http:\/\/localhost:\d+\//);
        assert.equal(Object.keys(e).sort().join(), 'codigo,items,pagina,tipo,total', 'solo viajan datos del pedido');
        assert.match(await p.locator('#s3d-aviso, .s3d-aviso').first().textContent(), new RegExp(codigo));
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async 'Comprar en la tarjeta y en la ficha registra un pedido y antepone el código (un código por clic)'({ browser }) {
        const p = await abrirConRegistro(browser);
        const comprar = p.locator('.catalog-carousel-card', { hasText: 'HELLO KITTY URBANA' }).first();
        await comprar.locator('.catalog-carousel-swatch').nth(1).click();
        const [wa] = await Promise.all([p.contexto.waitForEvent('page'), comprar.locator('[data-carousel-buy]').click()]);
        const m1 = textoDe(wa.url());
        assert.match(m1, CODIGO);
        assert.match(m1, /HELLO KITTY URBANA \(Color: Gris\) - Precio: S\/ 70\.00/);
        assert.equal((m1.match(/Pedido S3D-/g) || []).length, 1);
        const [wa2] = await Promise.all([p.contexto.waitForEvent('page'), comprar.locator('[data-carousel-buy]').click()]);
        const m2 = textoDe(wa2.url());
        assert.equal((m2.match(/Pedido S3D-/g) || []).length, 1, 'el segundo clic no debe acumular códigos');
        assert.notEqual(m1.match(CODIGO)[1], m2.match(CODIGO)[1]);
        await p.waitForTimeout(300);
        assert.equal(p.envios.length, 2);
        assert.deepEqual([p.envios[0].tipo, p.envios[0].items[0].nombre, p.envios[0].items[0].color, p.envios[0].total], ['comprar', 'HELLO KITTY URBANA', 'Gris', 70]);
        await p.goto(p.url().split('?')[0] + 'producto/woody/', { waitUntil: 'networkidle' });
        const [wa3] = await Promise.all([p.contexto.waitForEvent('page'), p.click('#pp-buy')]);
        assert.match(textoDe(wa3.url()), CODIGO);
        await p.waitForTimeout(300);
        assert.equal(p.envios.at(-1).items[0].nombre, 'WOODY');
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async 'Cotizar desde la ficha registra el pedido con medida y color'({ browser }) {
        const p = await abrirConRegistro(browser, 'producto/woody/');
        await p.locator('.pp-cotizador summary').click();
        await p.fill('#cq-medida', '40 cm');
        await p.fill('#cq-color', 'azul');
        const [wa] = await Promise.all([p.contexto.waitForEvent('page'), p.click('.pp-form-enviar')]);
        const mensaje = textoDe(wa.url());
        assert.match(mensaje, CODIGO);
        assert.match(mensaje, /Medida que necesito: 40 cm/);
        await p.waitForTimeout(300);
        const e = p.envios.at(-1);
        assert.deepEqual([e.tipo, e.items[0].nombre, e.items[0].medida, e.items[0].color], ['cotizar', 'WOODY', '40 cm', 'azul']);
        assert.equal(e.codigo, mensaje.match(CODIGO)[1]);
        await p.contexto.close();
    },
    async 'con el registro apagado (pedidosUrl vacío) no hay código ni envíos'({ browser }) {
        const envios = [];
        const p = await abrir(browser, '', { preparar: async pagina => {
            await pagina.route(/tienda\.js/, async r => r.fulfill({ contentType: 'text/javascript', body: (await (await r.fetch()).text()).replace(/const PEDIDOS_URL = '[^']*';/, "const PEDIDOS_URL = '';") }));
            await pagina.context().route('https://script.google.com/**', r => { envios.push(r.request().url()); r.abort(); });
        } });
        await p.context().route('https://api.whatsapp.com/**', r => r.fulfill({ contentType: 'text/html', body: 'wa' }));
        const [wa] = await Promise.all([p.contexto.waitForEvent('page'), p.locator('[data-carousel-buy]').first().click()]);
        assert.doesNotMatch(textoDe(wa.url()), /^Pedido S3D-/);
        await p.waitForTimeout(300);
        assert.deepEqual(envios, []);
        await p.contexto.close();
    },
};
