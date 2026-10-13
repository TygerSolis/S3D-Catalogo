// Fichas de producto: cabecera/pie compartidos, visor, fotos por tamaño, colores, cotizador y avisos.
const { assert, abrir } = require('./util.cjs');

const textoNormalizado = async (pagina, selector) => (await pagina.locator(selector).first().innerText()).replace(/\s+/g, ' ').trim();

module.exports = {
    async 'cabecera y pie de la ficha tienen el mismo contenido que los de la portada'({ browser }) {
        const portada = await abrir(browser);
        const ficha = await abrir(browser, 'producto/woody/');
        for (const selector of ['.announcement-bar', '.site-nav', '.site-footer']) {
            assert.equal(await textoNormalizado(ficha, selector), await textoNormalizado(portada, selector), `difiere ${selector}`);
        }
        assert.equal(await ficha.locator('.site-links a').count(), 6);
        assert.equal(await ficha.locator('.site-footer h3').count(), 4);
        await portada.contexto.close();
        await ficha.contexto.close();
    },
    async 'la ficha muestra las formas de pago y el aviso de pedido a medida'({ browser }) {
        const p = await abrir(browser, 'producto/woody/');
        const pagos = (await p.locator('.pp-info .pagos-lista').innerText()).replace(/\s+/g, ' ');
        for (const metodo of ['Yape', 'Plin', 'Transferencia', 'Efectivo']) assert.ok(pagos.includes(metodo), `falta ${metodo}`);
        assert.match(await p.locator('.pp-perks').innerText(), /elaboran a pedido/);
        await p.contexto.close();
    },
    async 'visor de la ficha: imagen completa sin barras, original de 3024 px y zoom de 3x con lupa'({ browser }) {
        const p = await abrir(browser, 'producto/box-light-grande/');
        await p.locator('#pp-stage').click();
        await p.waitForFunction(() => /Alta resolución/.test(document.querySelector('.pp-viewer-info').textContent), null, { timeout: 30000 });
        await p.waitForTimeout(300);
        const caja = await p.locator('.pp-viewer img').boundingBox();
        const vp = p.viewportSize();
        assert.ok(caja.x >= 0 && caja.y >= 0 && caja.x + caja.width <= vp.width + 1 && caja.y + caja.height <= vp.height + 1, 'la imagen no cabe completa');
        assert.equal(await p.evaluate(() => document.querySelector('.pp-viewer img').naturalWidth), 3024);
        const escalaVisor = () => p.evaluate(() => { const m = getComputedStyle(document.querySelector('.pp-viewer img')).transform; return m === 'none' ? 1 : Math.round(Number(m.match(/matrix\(([^,]+)/)[1]) * 100) / 100; });
        const x = () => p.evaluate(() => Number(getComputedStyle(document.querySelector('.pp-viewer img')).transform.split(',')[4]));
        await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
        await p.waitForTimeout(400);
        assert.equal(await escalaVisor(), 3);
        await p.mouse.move(caja.x + caja.width - 4, caja.y + caja.height / 2, { steps: 5 });
        await p.waitForTimeout(700);
        const derecha = await x();
        await p.mouse.move(caja.x + 4, caja.y + caja.height / 2, { steps: 5 });
        await p.waitForTimeout(700);
        assert.ok(derecha < (await x()), 'la lupa no sigue al cursor');
        await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
        await p.waitForTimeout(300);
        assert.equal(await escalaVisor(), 1);
        await p.keyboard.press('Escape');
        assert.ok(await p.locator('.pp-viewer').isHidden());
        await p.contexto.close();
    },
    async 'la foto principal usa el nivel intermedio en móvil y el estándar en escritorio'({ browser }) {
        const movil = await abrir(browser, 'producto/hello-kitty-urbana/', { vp: { width: 390, height: 844 } });
        assert.match(await movil.locator('#pp-main-img').evaluate(i => i.currentSrc), /\/assets\/md\/hk-urbana-1\.avif$/);
        await movil.locator('.pp-swatch').nth(2).click();
        await movil.waitForTimeout(800);
        assert.match(await movil.locator('#pp-main-img').evaluate(i => i.currentSrc), /\/assets\/md\/hk-urbana-negro-1\.avif$/);
        await movil.contexto.close();
        const escritorio = await abrir(browser, 'producto/hello-kitty-urbana/');
        assert.match(await escritorio.locator('#pp-main-img').evaluate(i => i.currentSrc), /\/assets\/hk-urbana-1\.avif$/);
        await escritorio.contexto.close();
    },
    async 'el color cambia foto, etiqueta y enlace de WhatsApp; las miniaturas y el video funcionan'({ browser }) {
        let p = await abrir(browser, 'producto/hello-kitty-urbana/');
        await p.locator('.pp-swatch').nth(3).click();
        assert.equal((await p.locator('#pp-color-name').textContent()).trim(), 'Amarillo');
        assert.match(decodeURIComponent(await p.locator('#pp-buy').getAttribute('href')), /Color: Amarillo/);
        await p.contexto.close();

        p = await abrir(browser, 'producto/snoopy-peaky-blinders/');
        await p.locator('[data-pp-video]').click();
        assert.ok(await p.locator('#pp-video').isVisible());
        assert.ok(await p.locator('#pp-main-img').isHidden());
        await p.locator('.pp-thumb').nth(1).click();
        assert.ok(await p.locator('#pp-video').isHidden());
        await p.contexto.close();
    },
    async 'el cotizador arma el mensaje de WhatsApp con los datos del formulario'({ browser }) {
        const p = await abrir(browser, 'producto/woody/');
        await p.locator('.pp-cotizador summary').click();
        await p.fill('#cq-medida', '10 cm más grande');
        await p.fill('#cq-texto', 'Andy');
        await p.fill('#cq-notas', 'Con base negra');
        const [popup] = await Promise.all([p.contexto.waitForEvent('page'), p.click('.pp-form-enviar')]);
        const mensaje = decodeURIComponent(popup.url().split('text=')[1] || '');
        for (const trozo of ['cotizar una personalización de: WOODY', 'medida publicada: 23CM', 'Medida que necesito: 10 cm más grande', 'Nombre o texto: Andy', 'Detalles: Con base negra', '/producto/woody/']) {
            assert.ok(mensaje.includes(trozo), `falta «${trozo}» en el mensaje`);
        }
        assert.ok(p.eventos.some(e => e.nombre === 'cotizar_personalizado'));
        await popup.close();
        await p.contexto.close();
    },
    async 'los productos por cotizar abren el cotizador por defecto'({ browser }) {
        const p = await abrir(browser, 'producto/letrero-led/');
        assert.ok(await p.locator('.pp-cotizador').evaluate(e => e.open));
        await p.contexto.close();
    },
    async 'compartir copia el enlace de la ficha'({ browser }) {
        const p = await abrir(browser, 'producto/woody/');
        await p.click('#pp-share');
        await p.waitForTimeout(300);
        assert.match(await p.evaluate(() => navigator.clipboard.readText()), /\/producto\/woody\/$/);
        assert.equal((await p.locator('#s3d-aviso').textContent()).trim(), 'Enlace copiado');
        await p.contexto.close();
    },
    async 'el aviso Nuevo aparece solo en los productos recientes'({ browser }) {
        let p = await abrir(browser, 'producto/bart-barbero/');
        assert.ok(await p.locator('.pp-ribbon').isVisible());
        await p.contexto.close();
        p = await abrir(browser, 'producto/woody/');
        assert.ok(await p.locator('.pp-ribbon').isHidden());
        await p.contexto.close();
    }
};
