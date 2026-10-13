// Galería ampliada del catálogo: alta resolución, zoom de un clic, gestos y teclado.
const { assert, abrir, escala } = require('./util.cjs');

const LED = '?categoria=Iluminaci%C3%B3n%20LED%203D';
async function abrirBoxLight(p, tocar = false) {
    const t = p.locator('.catalog-carousel-card', { hasText: 'BOX LIGHT GRANDE' }).first();
    await t.scrollIntoViewIfNeeded();
    await (tocar ? t.locator('.catalog-carousel-image').tap() : t.locator('.catalog-carousel-image').click());
    await p.waitForFunction(() => /Alta resolución/.test(document.getElementById('lightbox-hd').textContent), null, { timeout: 30000 });
    await p.waitForTimeout(300);
}
const traslacion = p => p.evaluate(() => Number(getComputedStyle(document.getElementById('lightbox-img')).transform.split(',')[4]));

module.exports = {
    async 'abre con la versión estándar y sube al original de 3024×4032'({ browser }) {
        const p = await abrir(browser, LED);
        await abrirBoxLight(p);
        assert.match(await p.locator('#lightbox-hd').textContent(), /3024×4032/);
        assert.equal(await p.evaluate(() => document.getElementById('lightbox-img').naturalWidth), 3024);
        await p.contexto.close();
    },
    async 'un clic acerca 3x, la imagen sigue al cursor y otro clic aleja'({ browser }) {
        const p = await abrir(browser, LED);
        await abrirBoxLight(p);
        const caja = await p.locator('#lightbox-img').boundingBox();
        const cx = caja.x + caja.width / 2;
        const cy = caja.y + caja.height / 2;
        await p.mouse.click(cx, cy);
        await p.waitForTimeout(400);
        assert.equal(await escala(p), 3);
        await p.mouse.move(caja.x + caja.width - 4, cy, { steps: 5 });
        await p.waitForTimeout(700);
        const derecha = await traslacion(p);
        await p.mouse.move(caja.x + 4, cy, { steps: 5 });
        await p.waitForTimeout(700);
        const izquierda = await traslacion(p);
        assert.ok(derecha < 0 && izquierda > 0, `la lupa no sigue al cursor (${derecha}, ${izquierda})`);
        await p.mouse.click(cx, cy);
        await p.waitForTimeout(300);
        assert.equal(await escala(p), 1);
        await p.contexto.close();
    },
    async 'un toque en móvil acerca y otro aleja'({ browser }) {
        const p = await abrir(browser, LED, { vp: { width: 390, height: 844 }, touch: true });
        await abrirBoxLight(p, true);
        const caja = await p.locator('#lightbox-img').boundingBox();
        await p.touchscreen.tap(caja.x + caja.width / 2, caja.y + caja.height / 2);
        await p.waitForTimeout(400);
        assert.equal(await escala(p), 3);
        await p.touchscreen.tap(caja.x + caja.width / 2, caja.y + caja.height / 2);
        await p.waitForTimeout(400);
        assert.equal(await escala(p), 1);
        await p.contexto.close();
    },
    async 'flechas cambian de foto, tocar el fondo cierra y el foco vuelve a la tarjeta'({ browser }) {
        const p = await abrir(browser, LED);
        await abrirBoxLight(p);
        const antes = await p.locator('#lightbox-counter').textContent();
        await p.keyboard.press('ArrowRight');
        assert.notEqual(await p.locator('#lightbox-counter').textContent(), antes);
        await p.mouse.click(20, 500);
        await p.waitForTimeout(300);
        assert.ok(!(await p.locator('#lightbox').evaluate(e => e.classList.contains('active'))));
        assert.ok(await p.evaluate(() => document.activeElement.className.includes('catalog-carousel-image')));
        await p.contexto.close();
    },
    async '"Ver ficha completa" lleva a la ficha del producto'({ browser }) {
        const p = await abrir(browser, LED);
        await abrirBoxLight(p);
        assert.equal(await p.locator('#lightbox-detail').getAttribute('href'), 'producto/box-light-grande/');
        await p.locator('#lightbox-detail').click();
        await p.waitForURL('**/producto/box-light-grande/');
        await p.contexto.close();
    }
};
