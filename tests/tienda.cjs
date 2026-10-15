// Pedido de varios productos y favoritos.
const { assert, abrir, ruta, visibles } = require('./util.cjs');

const CATEGORIA = '?categoria=Mu%C3%B1ecos%20Coleccionables';
const tarjeta = (pagina, nombre) => pagina.locator('.catalog-carousel-card', { hasText: nombre }).first();

module.exports = {
    async 'añadir desde las tarjetas: contador, líneas por color, total y mensaje único de WhatsApp'({ browser }) {
        const p = await abrir(browser, CATEGORIA);
        assert.ok(await p.locator('#s3d-fab').isHidden());
        await tarjeta(p, 'WOODY').locator('[data-pedido-add]').click();
        await tarjeta(p, 'WOODY').locator('[data-pedido-add]').click();
        await tarjeta(p, 'HELLO KITTY URBANA').locator('.catalog-carousel-swatch').nth(2).click();
        await tarjeta(p, 'HELLO KITTY URBANA').locator('[data-pedido-add]').click();
        assert.equal(await p.locator('.s3d-fab-cuenta').textContent(), '3');
        assert.ok(ruta(p).startsWith('/?'), 'añadir no debe navegar');
        await p.click('#s3d-fab');
        const filas = await p.$$eval('.s3d-item', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
        assert.equal(filas.length, 2);
        assert.match(filas[0], /WOODY.*S\/ 70\.00 × 2 = S\/ 140\.00/);
        assert.match(filas[1], /HELLO KITTY URBANA.*Color: Negro/);
        assert.equal(await p.locator('.s3d-total-valor').textContent(), 'S/ 210.00');
        await p.locator('.s3d-item').first().locator('[data-delta="1"]').click();
        assert.equal(await p.locator('.s3d-total-valor').textContent(), 'S/ 280.00');
        await p.locator('.s3d-item').nth(1).locator('[data-quitar]').click();
        assert.equal(await p.locator('.s3d-item').count(), 1);
        const mensaje = decodeURIComponent((await p.locator('.s3d-enviar').getAttribute('href')).split('text=')[1]);
        assert.match(mensaje, /3 × WOODY/);
        assert.match(mensaje, /Total referencial: S\/ 210\.00/);
        assert.match(mensaje, /\/producto\/woody\//);
        await p.keyboard.press('Escape');
        assert.ok(await p.locator('#s3d-panel').isHidden());
        await p.contexto.close();
    },
    async 'el pedido se conserva al cambiar de página y se puede ampliar desde la ficha'({ browser }) {
        const p = await abrir(browser, CATEGORIA);
        await tarjeta(p, 'WOODY').locator('[data-pedido-add]').click();
        await p.goto(`${p.url().split('?')[0]}producto/woody/`, { waitUntil: 'networkidle' });
        assert.equal(await p.locator('.s3d-fab-cuenta').textContent(), '1');
        await p.click('#pp-add');
        assert.equal(await p.locator('.s3d-fab-cuenta').textContent(), '2');
        await p.reload({ waitUntil: 'networkidle' });
        assert.equal(await p.locator('.s3d-fab-cuenta').textContent(), '2');
        await p.contexto.close();
    },
    async 'los productos por cotizar no suman al total y se indican en el mensaje'({ browser }) {
        const p = await abrir(browser, 'producto/letrero-led/');
        await p.click('#pp-add');
        await p.click('#s3d-fab');
        assert.equal(await p.locator('.s3d-total-valor').textContent(), 'Por cotizar');
        const mensaje = decodeURIComponent((await p.locator('.s3d-enviar').getAttribute('href')).split('text=')[1]);
        assert.match(mensaje, /LETRERO LED.*por cotizar/);
        assert.match(mensaje, /Todos los productos están por cotizar/);
        await p.contexto.close();
    },
    async 'favoritos: el corazón crea el filtro, lista el producto y vuelve a Todas al quitarlo'({ browser }) {
        const p = await abrir(browser, CATEGORIA);
        assert.equal(await p.locator('#category-filters button', { hasText: 'Favoritos' }).count(), 0);
        await tarjeta(p, 'WOODY').locator('[data-fav]').click();
        assert.equal(await tarjeta(p, 'WOODY').locator('[data-fav]').getAttribute('aria-pressed'), 'true');
        const chip = p.locator('#category-filters button', { hasText: 'Favoritos' });
        assert.match((await chip.textContent()).replace(/\s+/g, ' '), /Favoritos \(1\)/);
        await chip.click();
        assert.deepEqual(await p.$$eval('.catalog-carousel-card h3', e => e.map(x => x.textContent.trim())), ['WOODY']);
        await p.locator('.catalog-carousel-card').first().locator('[data-fav]').click();
        await p.waitForTimeout(300);
        assert.equal(await p.locator('#category-filters button', { hasText: 'Favoritos' }).count(), 0);
        assert.equal(await p.locator('.catalog-carousel-card').count(), visibles());
        await p.contexto.close();
    },
    async 'el favorito de la ficha se refleja en el catálogo'({ browser }) {
        const p = await abrir(browser, 'producto/woody/');
        await p.click('#pp-fav');
        assert.equal(await p.getAttribute('#pp-fav', 'aria-pressed'), 'true');
        await p.goto(p.url().replace(/producto\/woody\/.*/, '?categoria=Favoritos'), { waitUntil: 'networkidle' });
        assert.deepEqual(await p.$$eval('.catalog-carousel-card h3', e => e.map(x => x.textContent.trim())), ['WOODY']);
        await p.contexto.close();
    }
};
