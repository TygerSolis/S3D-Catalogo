// Eventos de analítica (con Umami simulado).
const fs = require('fs');
const path = require('path');
const { assert, abrir, nombresEventos, leerJson, BASE, RAIZ } = require('./util.cjs');

const CATEGORIA = '?categoria=Mu%C3%B1ecos%20Coleccionables';
const propiedades = (p, nombre) => p.eventos.filter(e => e.nombre === nombre).map(e => e.datos);

module.exports = {
    async 'los errores de nuestro JavaScript llegan como error_js (máx. 3) y los de terceros se ignoran'({ browser }) {
        const p = await abrir(browser, '', {
            preparar: pagina => pagina.route(/\/falla\.js/, r => r.fulfill({ contentType: 'text/javascript', body: '\n\nnoExiste();' }))
        });
        await p.evaluate(() => {
            const cargar = src => new Promise(listo => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = listo; document.body.append(s); });
            return (async () => {
                await cargar('data:text/javascript,' + encodeURIComponent('throw new Error("de un tercero")'));   // otro origen: se ignora
                for (let i = 0; i < 4; i++) await cargar(`falla.js?${i}`);                                           // nuestro origen: máx. 3
            })();
        });
        await p.waitForTimeout(500);
        const errores = p.eventos.filter(e => e.nombre === 'error_js').map(e => e.datos.error);
        assert.equal(errores.length, 3, JSON.stringify(errores));
        assert.match(errores[0], /noExiste is not defined @ falla\.js:3$/);
        await p.contexto.close();
    },
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
    },

    async 'fuera de la web principal no hay aviso de cookies ni pedidos a Facebook; la CSP y analytics.js siguen a config.json'({ browser }) {
        // Las pruebas corren en localhost: como en /vista-previa/, el píxel nunca se activa aunque haya número.
        const { metaPixel } = leerJson('config.json');
        const pedidos = [];
        const p = await abrir(browser, 'producto/woody/', { preparar: pagina => pagina.context().on('request', r => pedidos.push(r.url())) });
        assert.equal(await p.locator('.s3d-cookies').count(), 0);
        assert.ok(await p.locator('[data-cookies-pie]').isHidden());
        assert.ok(!pedidos.some(u => /facebook/.test(u)), 'no debe contactar a Facebook');
        const csp = await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
        assert.equal(/connect\.facebook\.net/.test(csp), Boolean(metaPixel), 'la CSP permite Facebook solo si hay número de píxel');
        const analytics = fs.readFileSync(path.join(RAIZ, 'analytics.js'), 'utf8');
        assert.ok(analytics.includes(`pixelId: '${metaPixel}'`), 'analytics.js lleva el número de config.json');
        await p.contexto.close();
    },
    async 'con píxel: nada se carga hasta «Aceptar»; luego PageView, ViewContent y Lead; «Rechazar» se recuerda'({ browser }) {
        const PIXEL = '123456789012345';
        // La CSP real solo permite Facebook con el número configurado: aquí se omite para simular ese caso.
        const contexto = await browser.newContext({ bypassCSP: true, viewport: { width: 1366, height: 900 } });
        const pedidosFb = [];
        await contexto.route('https://cloud.umami.is/**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.umami={track(){}};' }));
        await contexto.route('https://script.google.com/**', r => r.abort());
        await contexto.route(/analytics\.js/, async r => {
            const cuerpo = (await (await r.fetch()).text()).replace(/pixelId: '\d*'/, `pixelId: '${PIXEL}'`).replace("pixelDominio: 'tygersolis.github.io'", "pixelDominio: 'localhost'");
            await r.fulfill({ contentType: 'text/javascript', body: cuerpo });
        });
        // fbevents.js simulado: guarda en window.__fb lo que la página le pide a Meta.
        await contexto.route('https://connect.facebook.net/**', r => {
            pedidosFb.push(r.request().url());
            r.fulfill({ contentType: 'text/javascript', body: 'window.__fb=window.fbq.queue.map(a=>[...a]);window.fbq.callMethod=function(){window.__fb.push([...arguments]);};' });
        });
        const p = await contexto.newPage();
        await p.goto(`${BASE}producto/woody/`, { waitUntil: 'networkidle' });
        const aviso = p.locator('.s3d-cookies');
        assert.ok(await aviso.isVisible(), 'aparece el aviso');
        assert.ok(await p.locator('[data-cookies-pie]').isVisible(), 'el pie ofrece cambiar la decisión');
        assert.match(await aviso.locator('a').getAttribute('href'), /\/privacidad\/$/);
        assert.equal(pedidosFb.length, 0, 'sin aceptar no se carga nada de Meta');
        await aviso.locator('.s3d-cookies-no').click();
        assert.equal(await aviso.count(), 0);
        await p.reload({ waitUntil: 'networkidle' });
        assert.equal(await p.locator('.s3d-cookies').count(), 0, 'el rechazo se recuerda');
        assert.equal(pedidosFb.length, 0);
        // «Preferencias de cookies» vuelve a preguntar; ahora acepta.
        await p.click('[data-cookies]');
        await p.locator('.s3d-cookies .s3d-cookies-si').click();
        await p.waitForFunction(() => Array.isArray(window.__fb));
        const id = String(leerJson('productos.json').find(x => x.slug === 'woody').id);
        let llamadas = await p.evaluate(() => window.__fb);
        assert.deepEqual(llamadas[0], ['init', PIXEL]);
        assert.deepEqual(llamadas[1], ['track', 'PageView']);
        assert.equal(llamadas[2][1], 'ViewContent');
        assert.deepEqual(llamadas[2][2].content_ids, [`S3D-${id}`]);
        assert.equal(llamadas[2][2].currency, 'PEN');
        await p.evaluate(() => document.getElementById('pp-buy').addEventListener('click', e => e.preventDefault(), { once: true }));
        await p.click('#pp-buy');
        llamadas = await p.evaluate(() => window.__fb);
        const lead = llamadas.find(l => l[1] === 'Lead');
        assert.ok(lead, JSON.stringify(llamadas));
        assert.equal(lead[2].content_name, 'WOODY');
        assert.deepEqual(lead[2].content_ids, [`S3D-${id}`]);
        // En la siguiente página ya no pregunta y el píxel se carga solo.
        await p.goto(`${BASE}regalos/`, { waitUntil: 'networkidle' });
        assert.equal(await p.locator('.s3d-cookies').count(), 0);
        await p.waitForFunction(() => Array.isArray(window.__fb) && window.__fb.some(l => l[1] === 'PageView'));
        await contexto.close();
    },
};
