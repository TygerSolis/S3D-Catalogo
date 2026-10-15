// Portada: hero, tarjetas, orden, novedades, colores y clics.
const { assert, abrir, ruta, visibles } = require('./util.cjs');

const CATEGORIA = '?categoria=Mu%C3%B1ecos%20Coleccionables';
const tarjeta = (pagina, nombre) => pagina.locator('.catalog-carousel-card', { hasText: nombre }).first();

module.exports = {
    async 'las miniaturas se adaptan al número de fotos: centradas si caben, una sola fila deslizable si son muchas'({ browser }) {
        const p = await abrir(browser, '', {
            vp: { width: 390, height: 844 },
            preparar: pagina => pagina.route(/productos\.json/, async ruta => {
                const lista = await (await ruta.fetch()).json();
                const woody = lista.find(x => x.nombre === 'WOODY');
                woody.imagenes = lista.slice(0, 8).map(x => x.imagenes[0]);
                woody.video = 'assets/video/barber-bart-video.mp4';
                await ruta.fulfill({ json: lista });
            })
        });
        const fila = sel => p.locator(sel).locator('.catalog-carousel-thumbnails');
        const medir = sel => fila(sel).evaluate(f => {
            const caja = f.getBoundingClientRect(); const hijos = [...f.children].map(h => h.getBoundingClientRect());
            return { filas: 1 + hijos.filter(h => Math.abs(h.top - hijos[0].top) > 4).length /* la activa sube 1 px */, n: hijos.length, desliza: f.scrollWidth > f.clientWidth,
                izq: Math.round(hijos[0].left - caja.left), der: Math.round(caja.right - hijos.at(-1).right) };
        });
        const muchas = await medir('#producto-1');
        assert.equal(muchas.n, 9);             // 8 fotos + video
        assert.equal(muchas.filas, 1);
        assert.ok(muchas.desliza);
        const pocas = await medir('#producto-2');   // JESSIE: 2 fotos
        assert.equal(pocas.filas, 1);
        assert.ok(!pocas.desliza && Math.abs(pocas.izq - pocas.der) <= 2, JSON.stringify(pocas));
        await fila('#producto-1').locator('[data-carousel-index="7"]').click();
        assert.match(await p.locator('#producto-1 [data-carousel-main-image]').getAttribute('src'), new RegExp((await p.evaluate(async () => (await (await fetch('productos.json')).json())[7].imagenes[0].split('/').pop().replace('.webp', '')))));
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async 'los datos mandan: ocultos fuera, orden por «orden», categorías nuevas y etiqueta de disponibilidad'({ browser }) {
        const p = await abrir(browser, '', {
            preparar: pagina => pagina.route(/productos\.json/, async ruta => {
                const lista = await (await ruta.fetch()).json();
                lista.find(x => x.nombre === 'WOODY').activo = false;
                Object.assign(lista.find(x => x.nombre === 'JESSIE'), { disponibilidad: 'En stock' });
                Object.assign(lista.find(x => x.nombre === 'BUZZ'), { disponibilidad: 'Agotado', categoria: 'Categoría Nueva', orden: -5 });
                await ruta.fulfill({ json: lista });
            })
        });
        assert.equal(await p.locator('.catalog-carousel-card', { hasText: 'WOODY' }).count(), 0, 'un producto oculto aparece');
        assert.equal(await p.locator('.catalog-carousel-card').count(), visibles() - 1);
        const filtros = await p.$$eval('#category-filters [data-categoria]', b => b.map(x => x.dataset.categoria));
        assert.equal(filtros[0], 'Todas');
        assert.ok(filtros.indexOf('Categoría Nueva') >= 1 && filtros.indexOf('Categoría Nueva') < filtros.indexOf('Muñecos Coleccionables'), filtros.join(', '));
        assert.match(await p.locator('#main-content h2').first().innerText(), /Categoría Nueva/);
        const buzz = p.locator('.catalog-carousel-card', { hasText: 'BUZZ' });
        assert.equal((await buzz.locator('.catalog-disp').textContent()).trim(), 'Agotado');
        assert.match(decodeURIComponent(await buzz.locator('[data-carousel-buy]').getAttribute('href')), /Figura como agotado/);
        assert.equal((await p.locator('.catalog-carousel-card', { hasText: 'JESSIE' }).locator('.catalog-disp').textContent()).trim(), 'En stock');
        assert.equal(await p.locator('.catalog-carousel-card', { hasText: 'HELLO KITTY URBANA' }).locator('.catalog-disp').count(), 0);
        await p.fill('#search-input', 'woody'); await p.waitForTimeout(400);
        assert.equal(await p.locator('.search-suggest-item[data-tipo="producto"]').count(), 0, 'el buscador sugiere un producto oculto');
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async 'si una foto no carga, la tarjeta muestra la imagen propia "Sin foto" (sin servicios externos)'({ browser }) {
        const externas = [];
        const p = await abrir(browser, '', {
            preparar: async pagina => {
                pagina.on('request', r => { if (!r.url().startsWith('http://localhost') && !r.url().includes('umami')) externas.push(r.url()); });
                await pagina.route(/assets\/sm\/ts-woody-1\.(avif|webp)/, ruta => ruta.fulfill({ status: 404, body: '' }));
            }
        });
        const img = p.locator('.catalog-carousel-card', { hasText: 'WOODY' }).first().locator('[data-carousel-main-image]');
        await img.scrollIntoViewIfNeeded();
        await p.waitForFunction(() => { const i = document.querySelector('#producto-1 [data-carousel-main-image]'); return i?.currentSrc.endsWith('sin-foto.svg') && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 });
        assert.deepEqual(externas.filter(u => u.includes('placehold')), []);
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
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
    async 'todas las tarjetas cargan miniaturas y ninguna imagen está rota'({ browser }) {
        const p = await abrir(browser);
        await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } });
        await p.waitForTimeout(1500);
        const usos = await p.$$eval('[data-carousel-main-image]', imgs => imgs.filter(i => i.currentSrc.includes('/assets/sm/')).length);
        assert.equal(usos, visibles());
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
