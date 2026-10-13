// Eventos de analítica (con Umami simulado).
const { assert, abrir, nombresEventos } = require('./util.cjs');

const CATEGORIA = '?categoria=Mu%C3%B1ecos%20Coleccionables';
const propiedades = (p, nombre) => p.eventos.filter(e => e.nombre === nombre).map(e => e.datos);

module.exports = {
    async 'abrir la galería registra producto_visto y comprar registra clic_comprar con el producto'({ browser }) {
        const p = await abrir(browser, CATEGORIA);
        await p.locator('.catalog-carousel-card', { hasText: 'BUZZ' }).first().locator('.catalog-carousel-image').click();
        assert.deepEqual(propiedades(p, 'producto_visto'), [{ producto: 'BUZZ' }]);
        await p.evaluate(() => document.getElementById('lightbox-buy').addEventListener('click', e => e.preventDefault(), { once: true }));
        await p.click('#lightbox-buy');
        assert.deepEqual(propiedades(p, 'clic_comprar'), [{ producto: 'BUZZ' }]);
        await p.contexto.close();
    },
    async 'las fichas registran un solo evento por cada vía de entrada'({ browser }) {
        let p = await abrir(browser, CATEGORIA);
        await p.locator('.catalog-card-link', { hasText: 'WOODY' }).click();
        await p.waitForLoadState('networkidle');
        assert.deepEqual(propiedades(p, 'ficha_tarjeta'), [{ producto: 'WOODY' }]);
        await p.contexto.close();

        p = await abrir(browser, CATEGORIA);
        await p.locator('.catalog-carousel-card', { hasText: 'JESSIE' }).first().locator('.catalog-carousel-meta span').first().click();
        await p.waitForLoadState('networkidle');
        assert.deepEqual(propiedades(p, 'ficha_tarjeta'), [{ producto: 'JESSIE' }]);
        await p.contexto.close();

        p = await abrir(browser, CATEGORIA);
        await p.locator('.catalog-carousel-card', { hasText: 'BUZZ' }).first().locator('.catalog-carousel-image').click();
        await p.locator('#lightbox-detail').click();
        await p.waitForLoadState('networkidle');
        assert.deepEqual(propiedades(p, 'ficha_galeria'), [{ producto: 'BUZZ' }]);
        await p.contexto.close();
    },
    async 'en la ficha: ampliar y producto relacionado'({ browser }) {
        const p = await abrir(browser, 'producto/woody/');
        await p.locator('#pp-stage').click();
        await p.keyboard.press('Escape');
        await p.locator('.pp-related-card').first().click();
        await p.waitForLoadState('networkidle');
        assert.deepEqual(propiedades(p, 'ficha_ampliar'), [{ producto: 'WOODY' }]);
        assert.equal(propiedades(p, 'ficha_relacionado').length, 1);
        await p.contexto.close();
    },
    async 'pedido, favoritos y cotizador registran sus eventos'({ browser }) {
        const p = await abrir(browser, CATEGORIA);
        await p.locator('.catalog-carousel-card', { hasText: 'WOODY' }).first().locator('[data-pedido-add]').click();
        await p.locator('.catalog-carousel-card', { hasText: 'WOODY' }).first().locator('[data-fav]').click();
        assert.deepEqual(propiedades(p, 'pedido_agregar'), [{ producto: 'WOODY' }]);
        assert.deepEqual(propiedades(p, 'favorito_agregar'), [{ producto: 'WOODY' }]);
        await p.click('#s3d-fab');
        await p.evaluate(() => document.querySelector('.s3d-enviar').addEventListener('click', e => e.preventDefault(), { once: true }));
        await p.click('.s3d-enviar');
        assert.deepEqual(propiedades(p, 'pedido_enviar'), [{ unidades: 1 }]);
        await p.contexto.close();
    },
    async 'los enlaces a WhatsApp de la página se agrupan por zona'({ browser }) {
        const p = await abrir(browser);
        await p.evaluate(() => document.querySelectorAll('a[href*="api.whatsapp.com"]').forEach(a => a.addEventListener('click', e => e.preventDefault())));
        await p.click('.site-cta');
        await p.click('.catalog-notice a');
        assert.deepEqual(propiedades(p, 'clic_whatsapp'), [{ zona: 'cabecera' }, { zona: 'aviso-catalogo' }]);
        await p.contexto.close();
    }
};
