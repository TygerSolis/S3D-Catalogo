// Portada: hero, tarjetas, orden, novedades, colores y clics.
const { assert, abrir, ruta } = require('./util.cjs');

const CATEGORIA = '?categoria=Mu%C3%B1ecos%20Coleccionables';
const tarjeta = (pagina, nombre) => pagina.locator('.catalog-carousel-card', { hasText: nombre }).first();

module.exports = {
    async 'nombres y colecciones con comillas o < > se muestran como texto y no rompen la tarjeta'({ browser }) {
        const NOMBRE = `Taza "Rosa" <b>de</b> Ana's & co`;
        const COLECCION = `Cosas d'Ana <i>x</i>`;
        const p = await abrir(browser, '', {
            preparar: pagina => pagina.route(/productos\.json/, async ruta => {
                const lista = await (await ruta.fetch()).json();
                lista[0].nombre = NOMBRE;
                lista[0].coleccion = COLECCION;
                lista[0].badge = '<b>Top</b>';
                await ruta.fulfill({ json: lista });
            })
        });
        assert.equal(await p.locator('#main-content b, #main-content i, #hero-products b').count(), 0, 'se interpretó HTML de los datos');
        const t = p.locator('.catalog-carousel-card', { hasText: 'Taza' }).first();
        assert.equal((await t.locator('h3').textContent()).trim(), NOMBRE);
        assert.equal(await t.locator('[data-carousel-main-image]').getAttribute('alt'), NOMBRE);
        assert.equal(await t.locator('.catalog-fav').getAttribute('aria-label'), `Guardar ${NOMBRE} en favoritos`);
        assert.equal((await t.locator('.catalog-card-kicker').textContent()).trim(), COLECCION);
        assert.match(await t.locator('[data-carousel-buy]').getAttribute('href'), /^https:\/\/api\.whatsapp\.com\/send\?phone=\d+&text=/);
        // Los filtros funcionan sin onclick en el HTML
        await p.locator('#category-filters [data-categoria="Muñecos Coleccionables"]').click();
        assert.match(p.url(), /categoria=Mu%C3%B1ecos/);
        assert.ok(await p.locator('.catalog-carousel-card').count() > 1);
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async 'el hero muestra 4 productos y Bart Barbero en grande'({ browser }) {
        const p = await abrir(browser);
        assert.equal(await p.locator('.hero-product').count(), 4);
        assert.match(await p.locator('.hero-product').first().innerText(), /BART BARBERO/);
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async 'las 87 tarjetas cargan miniaturas y ninguna imagen está rota'({ browser }) {
        const p = await abrir(browser);
        await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } });
        await p.waitForTimeout(1500);
        const usos = await p.$$eval('[data-carousel-main-image]', imgs => imgs.filter(i => i.currentSrc.includes('/assets/sm/')).length);
        assert.equal(usos, 87);
        const rotas = await p.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.id !== 'lightbox-img').length);
        assert.equal(rotas, 0);
        await p.contexto.close();
    },
    async 'el orden por precio es creciente y los productos por cotizar quedan al final'({ browser }) {
        const p = await abrir(browser);
        await p.selectOption('#sort-select', 'price-asc');
        const precios = await p.$$eval('.catalog-carousel-meta span:first-child', e => e.map(x => x.textContent.trim()));
        const numeros = precios.filter(x => x.startsWith('S/')).map(x => parseFloat(x.slice(3)));
        assert.deepEqual(numeros, [...numeros].sort((a, b) => a - b));
        assert.equal(precios.at(-1), 'Cotizar');
        await p.contexto.close();
    },
    async 'el filtro Novedades lista los 4 productos recientes'({ browser }) {
        const p = await abrir(browser);
        await p.locator('#category-filters button', { hasText: 'Novedades' }).click();
        const nombres = await p.$$eval('.catalog-carousel-card h3', e => e.map(x => x.textContent.trim()));
        assert.equal(nombres.length, 4);
        assert.ok(nombres.includes('BART BARBERO'));
        await p.contexto.close();
    },
    async 'Novedades desaparece solo cuando los avisos caducan'({ browser }) {
        const p = await abrir(browser, '', { sinReloj: true });
        await p.clock.setFixedTime(new Date('2026-12-01T12:00:00'));
        await p.reload({ waitUntil: 'networkidle' });
        assert.equal(await p.locator('#category-filters button', { hasText: 'Novedades' }).count(), 0);
        assert.equal(await p.locator('.catalog-carousel-card.is-new').count(), 0);
        await p.contexto.close();
    },
    async 'Hello Kitty: el color cambia la foto y el mensaje de WhatsApp'({ browser }) {
        const p = await abrir(browser, CATEGORIA);
        const hk = tarjeta(p, 'HELLO KITTY URBANA');
        assert.equal(await hk.locator('.catalog-carousel-swatch').count(), 4);
        await hk.locator('.catalog-carousel-swatch').nth(2).click();
        assert.match(await hk.locator('[data-carousel-main-image]').getAttribute('src'), /hk-urbana-negro/);
        assert.match(decodeURIComponent(await hk.locator('[data-carousel-buy]').getAttribute('href')), /Color: Negro/);
        await p.contexto.close();
    },
    async 'tarjeta: el precio abre la ficha; imagen y miniaturas no navegan; Comprar abre WhatsApp'({ browser }) {
        let p = await abrir(browser, CATEGORIA);
        await tarjeta(p, 'WOODY').locator('.catalog-carousel-meta span').first().click();
        await p.waitForURL('**/producto/woody/');
        await p.contexto.close();

        p = await abrir(browser, CATEGORIA);
        const snoopy = tarjeta(p, 'SNOOPY PEAKY BLINDERS');
        await snoopy.locator('.catalog-carousel-image').click();
        assert.ok(await p.locator('#lightbox').evaluate(e => e.classList.contains('active')));
        assert.ok(ruta(p).startsWith('/?'));
        await p.keyboard.press('Escape');
        const antes = await snoopy.locator('[data-carousel-main-image]').getAttribute('src');
        await snoopy.locator('.catalog-carousel-thumbnail').nth(1).click();
        assert.notEqual(await snoopy.locator('[data-carousel-main-image]').getAttribute('src'), antes);
        assert.ok(ruta(p).startsWith('/?'));
        assert.match(await snoopy.locator('[data-carousel-buy]').getAttribute('href'), /api\.whatsapp\.com/);
        await p.contexto.close();
    },
    async 'arrastrar para seleccionar texto no abre la ficha'({ browser }) {
        const p = await abrir(browser, CATEGORIA);
        const caja = await tarjeta(p, 'WOODY').locator('.catalog-card-kicker').boundingBox();
        await p.mouse.move(caja.x + 2, caja.y + caja.height / 2);
        await p.mouse.down();
        await p.mouse.move(caja.x + caja.width - 2, caja.y + caja.height / 2, { steps: 8 });
        await p.mouse.up();
        await p.waitForTimeout(300);
        assert.ok(ruta(p).startsWith('/?'));
        await p.contexto.close();
    },
    async 'Ctrl+clic en la tarjeta abre la ficha en otra pestaña'({ browser }) {
        const p = await abrir(browser, CATEGORIA);
        const [nueva] = await Promise.all([p.contexto.waitForEvent('page'), tarjeta(p, 'JESSIE').locator('.catalog-card-kicker').click({ modifiers: ['Control'] })]);
        await nueva.waitForLoadState();
        assert.ok(nueva.url().endsWith('/producto/jessie/'));
        assert.ok(ruta(p).startsWith('/?'));
        await p.contexto.close();
    }
};
