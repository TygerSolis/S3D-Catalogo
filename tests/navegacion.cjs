// Menús, anclas, 404 y privacidad.
const { assert, abrir, ruta, BASE, nombresEventos } = require('./util.cjs');

module.exports = {
    async 'el mapa de Google solo se carga al pulsar «Ver el mapa del taller»'({ browser }) {
        const aGoogle = [];
        const p = await abrir(browser, '', { preparar: pagina => pagina.route(/google\.com\/maps/, ruta => { aGoogle.push(ruta.request().url()); ruta.fulfill({ contentType: 'text/html', body: '<p>mapa</p>' }); }) });
        await p.locator('#ubicacion').scrollIntoViewIfNeeded();
        await p.waitForTimeout(800);
        assert.equal(await p.locator('#mapa-taller iframe').count(), 0);
        assert.deepEqual(aGoogle, [], 'se pidió el mapa sin que la persona lo pulsara');
        await p.locator('#mapa-taller .mapa-cargar').click();
        await p.locator('#mapa-taller iframe').waitFor();
        assert.match(await p.locator('#mapa-taller iframe').getAttribute('src'), /^https:\/\/www\.google\.com\/maps\?q=-12\.0797586,-77\.1041774&z=17&output=embed$/);
        await p.waitForTimeout(300);
        assert.equal(aGoogle.length, 1);
        assert.ok(nombresEventos(p).includes('mapa_cargado'));
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
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
        // La 404 usa <base href> con la URL de producción: se abre con esa URL (así la CSP la trata como en la
        // web real, donde 'self' es tygersolis.github.io) y las peticiones se sirven desde el servidor local.
        await p.route('https://tygersolis.github.io/S3D-Catalogo/**', async ruta404 => {
            const respuesta = await fetch(ruta404.request().url().replace('https://tygersolis.github.io/S3D-Catalogo/', BASE));
            await ruta404.fulfill({ status: respuesta.status, headers: { 'content-type': respuesta.headers.get('content-type') || 'text/plain' }, body: Buffer.from(await respuesta.arrayBuffer()) });
        });
        await p.route('https://cloud.umami.is/**', r => r.abort());
        const respuesta = await p.goto('https://tygersolis.github.io/S3D-Catalogo/no/existe/esta/ruta/', { waitUntil: 'networkidle' });
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
