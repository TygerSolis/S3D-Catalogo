// Menús, anclas, 404 y privacidad.
const { assert, abrir, ruta, BASE } = require('./util.cjs');

module.exports = {
    async 'menú móvil: abre, navega y se cierra (portada y ficha)'({ browser }) {
        for (const pagina of ['', 'producto/woody/']) {
            const p = await abrir(browser, pagina, { vp: { width: 390, height: 844 }, touch: true });
            assert.ok(await p.locator('#mobile-menu').isHidden());
            await p.click('#nav-toggle');
            assert.ok(await p.locator('#mobile-menu').isVisible());
            await p.click('#mobile-menu a[href$="#faq"]');
            await p.waitForTimeout(700);
            assert.ok(await p.locator('#mobile-menu').isHidden());
            assert.match(ruta(p), /#faq$/);
            await p.contexto.close();
        }
    },
    async 'desde una ficha, los enlaces de la cabecera llevan a su sección en la portada'({ browser }) {
        for (const destino of ['faq', 'ubicacion', 'personalizados', 'como-comprar', 'catalogo']) {
            const p = await abrir(browser, 'producto/woody/');
            await p.click(`.site-links a[href$="#${destino}"]`);
            await p.waitForLoadState('networkidle');
            await p.waitForTimeout(900);
            const arriba = await p.evaluate(id => document.getElementById(id).getBoundingClientRect().top - document.querySelector('.site-nav').getBoundingClientRect().bottom, destino);
            assert.ok(arriba >= -8 && arriba <= 160, `#${destino} quedó desplazado (${Math.round(arriba)} px)`);
            assert.match(ruta(p), new RegExp(`#${destino}$`));
            await p.contexto.close();
        }
    },
    async 'la portada no tiene enlaces internos rotos'({ browser }) {
        const p = await abrir(browser);
        const rotos = await p.$$eval('a[href^="#"]', a => [...new Set(a.map(x => x.getAttribute('href')))].filter(h => h.length > 1 && !document.querySelector(h)));
        assert.deepEqual(rotos, []);
        await p.contexto.close();
    },
    async 'una ruta inexistente muestra la 404 con cabecera, pie, buscador y sugerencias'({ browser }) {
        const contexto = await browser.newContext({ viewport: { width: 1366, height: 900 } });
        const p = await contexto.newPage();
        // La 404 usa <base href> con la URL de producción: en las pruebas se redirige al servidor local.
        await p.route('https://tygersolis.github.io/S3D-Catalogo/**', async ruta404 => {
            const respuesta = await fetch(ruta404.request().url().replace('https://tygersolis.github.io/S3D-Catalogo/', BASE));
            await ruta404.fulfill({ status: respuesta.status, headers: { 'content-type': respuesta.headers.get('content-type') || 'text/plain' }, body: Buffer.from(await respuesta.arrayBuffer()) });
        });
        await p.route('https://cloud.umami.is/**', r => r.abort());
        const respuesta = await p.goto(`${BASE}no/existe/esta/ruta/`, { waitUntil: 'networkidle' });
        assert.equal(respuesta.status(), 404);
        assert.match(await p.locator('h1').innerText(), /no existe/);
        assert.ok(await p.locator('.site-brand img').evaluate(i => i.naturalWidth > 0), 'el logo no carga desde una ruta profunda');
        assert.ok(await p.locator('.pg-chip').count() >= 10);
        assert.equal(await p.locator('.pg-card').count(), 4);
        await p.fill('.pg-buscar input', 'holder');
        await p.click('.pg-buscar button');
        await p.waitForLoadState('networkidle');
        assert.match(ruta(p), /\?buscar=holder/);
        await contexto.close();
    },
    async 'la página de privacidad existe, está enlazada en el pie y explica la medición'({ browser }) {
        const p = await abrir(browser);
        assert.equal(await p.locator('.site-footer a[href$="privacidad/"]').count(), 1);
        await p.goto(`${BASE}privacidad/`, { waitUntil: 'networkidle' });
        const texto = await p.locator('main').innerText();
        for (const frase of ['Política de privacidad', 'no usa cookies', 'WhatsApp', 'almacenamiento local']) assert.ok(texto.includes(frase), `falta «${frase}»`);
        await p.contexto.close();
    }
};
