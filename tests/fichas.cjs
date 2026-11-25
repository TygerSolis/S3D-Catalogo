// Fichas de producto: cabecera/pie compartidos, visor, fotos por tamaño, colores, cotizador y avisos.
const { assert, abrir, leerJson } = require('./util.cjs');

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
    },

    async 'la ficha muestra la franja de confianza, los costos de envío de config.json y el tamaño junto a un celular'({ browser }) {
        const { envios, promesa } = leerJson('config.json');
        const p = await abrir(browser, 'producto/woody/');
        const franja = (await p.locator('.pp-info .promesa').innerText()).replace(/\s+/g, ' ');
        for (const texto of ['Hecho en Lima', promesa.plazo, 'Envíos a todo el Perú', 'Yape o Plin']) assert.ok(franja.includes(texto), `falta «${texto}»`);
        const desplegable = p.locator('.pp-envios');
        assert.ok(await desplegable.locator('table').isHidden(), 'los costos empiezan plegados');
        await desplegable.locator('summary').click();
        const filas = await desplegable.locator('tbody tr').allInnerTexts();
        assert.equal(filas.length, envios.zonas.length);
        envios.zonas.forEach((z, i) => assert.ok(filas[i].includes(z.zona) && filas[i].includes(z.precio ? `S/ ${z.precio.toFixed(2)}` : 'Gratis'), filas[i]));
        // WOODY mide 23 cm: el dibujo lo dice y su pieza es más alta que el celular de 15 cm.
        const dibujo = p.locator('.pp-tamano svg');
        assert.match(await dibujo.getAttribute('aria-label'), /23 cm/);
        const [celular, pieza] = await Promise.all(['.pp-tamano-celular', '.pp-tamano-pieza'].map(s => p.locator(s).evaluate(r => r.getBBox().height)));
        assert.ok(Math.abs(pieza / celular - 23 / 15) < 0.01, `${pieza} / ${celular}`);
        await p.contexto.close();
    },
    async 'el dibujo de tamaño solo aparece si la medida está en cm'({ browser }) {
        const sinCm = leerJson('productos.json').find(x => x.medida && !/cm/i.test(x.medida));
        const p = await abrir(browser, `producto/${sinCm.slug}/`);
        assert.equal(await p.locator('.pp-tamano').count(), 0, sinCm.medida);
        await p.contexto.close();
    },
    async 'en el celular, la barra fija pide por WhatsApp con el mismo enlace y precio del color elegido'({ browser }) {
        const p = await abrir(browser, 'producto/arbol-navideno/', { vp: { width: 390, height: 844 }, touch: true });
        const barra = p.locator('#pp-barra');
        await barra.waitFor({ state: 'visible' });
        assert.ok(await p.evaluate(() => document.body.classList.contains('pp-con-barra')));
        // Al cambiar a un color con precio propio, la barra muestra ese precio.
        const colores = p.locator('.pp-swatch');
        const ultimo = colores.nth(await colores.count() - 1);
        await ultimo.click();
        assert.equal(await p.locator('#pp-barra-precio').innerText(), `S/ ${Number(await ultimo.getAttribute('data-precio')).toFixed(2)}`);
        // Pulsar la barra equivale a pulsar «Comprar por WhatsApp» (mismo enlace, con el color elegido).
        await p.evaluate(() => document.getElementById('pp-buy').addEventListener('click', e => { window.__abierto = e.currentTarget.href; e.preventDefault(); }, { once: true }));
        await p.click('#pp-barra-btn');
        const texto = new URL(await p.evaluate(() => window.__abierto)).searchParams.get('text');
        assert.ok(texto.includes(`Color: ${await ultimo.getAttribute('data-pp-color')}`), texto);
        assert.deepEqual(p.eventos.filter(e => e.nombre === 'barra_comprar').length, 1);
        // Cuando el botón principal está a la vista, la barra se oculta.
        await p.locator('#pp-buy').scrollIntoViewIfNeeded();
        await barra.waitFor({ state: 'hidden' });
        await p.contexto.close();
        const escritorio = await abrir(browser, 'producto/arbol-navideno/');
        await escritorio.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await escritorio.waitForTimeout(200);
        assert.ok(await escritorio.locator('#pp-barra').isHidden(), 'en escritorio no hay barra');
        await escritorio.contexto.close();
    },
    async '«Vistos recientemente» muestra lo abierto antes, sin repetir los sugeridos ni pintar datos manipulados'({ browser }) {
        const p = await abrir(browser, 'producto/angelito/');
        assert.ok(await p.locator('#pp-vistos').isHidden(), 'la primera ficha no tiene vistos');
        // Una web del mismo dominio podría escribir en localStorage: lo inválido se descarta.
        await p.evaluate(() => {
            const lista = JSON.parse(localStorage.getItem('s3d-vistos'));
            lista.push({ slug: 'x"><img src=x onerror=alert(1)>', nombre: 'MALO', precio: 'S/ 1', imagen: 'assets/sm/a.webp' });
            lista.push({ slug: 'malo', nombre: '<b>MALO</b>', precio: 'S/ 1', imagen: 'javascript:alert(1)' });
            localStorage.setItem('s3d-vistos', JSON.stringify(lista));
        });
        await p.goto(p.url().replace('angelito', 'woody'));
        const vistos = p.locator('#pp-vistos');
        await vistos.waitFor({ state: 'visible' });
        assert.deepEqual(await vistos.locator('.pp-related-card strong').allInnerTexts(), ['ANGELITO']);
        assert.equal(await vistos.locator('.pp-related-card').getAttribute('href'), '../angelito/');
        assert.ok(await vistos.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), 'la foto carga');
        const guardados = await p.evaluate(() => JSON.parse(localStorage.getItem('s3d-vistos')).map(v => v.slug));
        assert.deepEqual(guardados, ['woody', 'angelito']);
        // BUZZ ya sale en «También te puede gustar» de WOODY: no se repite en vistos.
        await p.goto(p.url().replace('woody', 'buzz'));
        await p.goto(p.url().replace('buzz', 'woody'));
        assert.deepEqual(await p.locator('#pp-vistos .pp-related-card strong').allInnerTexts(), ['ANGELITO']);
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async '«También te puede gustar» completa con precios parecidos si la categoría tiene pocos productos'({ browser }) {
        const lista = leerJson('productos.json').filter(x => x.activo !== false);
        const porCategoria = lista.reduce((m, x) => m.set(x.categoria, (m.get(x.categoria) || 0) + 1), new Map());
        const solo = lista.find(x => porCategoria.get(x.categoria) <= 3);
        const p = await abrir(browser, `producto/${solo.slug}/`);
        assert.equal(await p.locator('.pp-related:not(.pp-vistos) .pp-related-card').count(), 4);
        await p.contexto.close();
    },
};
