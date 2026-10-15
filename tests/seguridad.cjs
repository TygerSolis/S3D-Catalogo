// Política de seguridad (CSP): está en todas las páginas, no hay código en línea y nada queda bloqueado al usar el sitio.
const fs = require('fs');
const path = require('path');
const { assert, RAIZ, abrir } = require('./util.cjs');

const paginas = () => ['index.html', '404.html', 'privacidad/index.html',
    ...fs.readdirSync(path.join(RAIZ, 'producto')).map(slug => `producto/${slug}/index.html`)];
const leer = archivo => fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
const sinBloqueos = p => assert.deepEqual(p.violaciones, [], `la CSP bloqueó: ${p.violaciones.join(' | ')}`);

module.exports = {
    async 'todas las páginas llevan la misma CSP y ninguna tiene código en línea'() {
        const csp = leer('index.html').match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
        assert.ok(csp, 'index.html no tiene CSP');
        assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp[1]), 'script-src no debe permitir código en línea');
        for (const archivo of paginas()) {
            const html = leer(archivo);
            assert.ok(html.includes(csp[0]), `${archivo} no tiene la misma CSP que index.html`);
            assert.doesNotMatch(html, /\son[a-z]+=|javascript:/i, `${archivo} tiene un atributo on…= o un enlace javascript:`);
            const enLinea = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter(m => !/application\/ld\+json/.test(m[1]));
            assert.equal(enLinea.length, 0, `${archivo} tiene <script> en línea`);
        }
        for (const js of ['catalogo.js', 'producto.js', 'tienda.js', 'chrome.js', 'analytics.js']) {
            assert.doesNotMatch(leer(js), /\son[a-z]+=["']|javascript:|\beval\(|new Function\(/, `${js} genera código que la CSP bloquearía`);
        }
    },
    async 'portada: galería, video, volver arriba y mapa funcionan sin bloqueos'({ browser }) {
        const p = await abrir(browser, '?categoria=Mascota');
        // Video explicativo de las placas (antes era un onclick)
        await p.locator('[data-video]').first().click();
        await p.locator('#lightbox.active').waitFor();
        await p.locator('#lightbox-close').click();
        await p.locator('#lightbox.active').waitFor({ state: 'detached' }).catch(() => {});
        assert.equal(await p.locator('#lightbox.active').count(), 0, 'la X no cerró la galería');
        // Galería de un producto: siguiente, anterior y cierre tocando el fondo
        await p.locator('.catalog-carousel-image').first().click();
        await p.locator('#lightbox.active').waitFor();
        const antes = await p.locator('#lightbox-counter').textContent();
        if (await p.locator('#lightbox-next').isVisible()) {
            await p.locator('#lightbox-next').click();
            assert.notEqual(await p.locator('#lightbox-counter').textContent(), antes, 'el botón siguiente no cambió la foto');
            await p.locator('#lightbox-prev').click();
            assert.equal(await p.locator('#lightbox-counter').textContent(), antes, 'el botón anterior no volvió');
        }
        await p.locator('#lightbox').click({ position: { x: 5, y: 5 } });
        assert.equal(await p.locator('#lightbox.active').count(), 0, 'tocar el fondo no cerró la galería');
        // Volver arriba
        await p.evaluate(() => window.scrollTo(0, 3000));
        await p.locator('#btn-volver-arriba.visible').waitFor();
        await p.locator('#btn-volver-arriba').click();
        await p.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 });
        // Mapa (iframe de Google, permitido por frame-src)
        await p.locator('#mapa-taller button, #mapa-taller [data-cargar-mapa]').first().click();
        await p.locator('#mapa-taller iframe').waitFor({ state: 'attached' });
        await p.waitForTimeout(500);
        sinBloqueos(p);
        await p.contexto.close();
    },
    async 'ficha y privacidad cargan sin bloqueos'({ browser }) {
        for (const ruta of ['producto/woody/', 'privacidad/']) {
            const p = await abrir(browser, ruta);
            await p.waitForTimeout(300);
            sinBloqueos(p);
            assert.deepEqual(p.errores, [], `${ruta}: ${p.errores.join(' | ')}`);
            await p.contexto.close();
        }
    }
};
