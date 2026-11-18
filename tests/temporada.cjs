// Temporada (config.json «temporada», p. ej. Navidad): ambientación por fechas y categoría destacada.
const { assert, abrir, leerJson } = require('./util.cjs');

const TEMPORADA = leerJson('config.json').temporada;
const dia = (fecha, desplazamiento = 0) => {
    const d = new Date(`${fecha}T12:00:00`);
    d.setDate(d.getDate() + desplazamiento);
    return d;
};
const EN_TEMPORADA = dia(TEMPORADA.desde);
const CLASE = `temporada-${TEMPORADA.id}`;
// Productos de temporada: los reales de la hoja (si ya hay) más los 3 que añade la prueba.
const DE_TEMPORADA = leerJson('productos.json').filter(p => p.activo !== false && p.categoria === TEMPORADA.categoria).length + 3;

// Marca como de temporada 3 productos más, sin etiqueta (badge) y de otra categoría, y deja el resto igual.
const conProductosDeTemporada = pagina => pagina.route(/productos\.json/, async ruta => {
    const lista = await (await ruta.fetch()).json();
    lista.filter(p => p.activo !== false && !p.badge && p.categoria !== TEMPORADA.categoria).slice(0, 3).forEach(p => { p.categoria = TEMPORADA.categoria; });
    await ruta.fulfill({ json: lista });
});
const tieneClase = pagina => pagina.evaluate(clase => document.documentElement.classList.contains(clase), CLASE);

module.exports = {
    async 'fuera de fechas (antes y después) no hay ambientación ni aviso de temporada'({ browser }) {
        for (const fecha of [dia(TEMPORADA.desde, -1), dia(TEMPORADA.hasta, 1)]) {
            const p = await abrir(browser, '', { fecha, preparar: conProductosDeTemporada });
            assert.equal(await tieneClase(p), false, fecha.toDateString());
            assert.equal(await p.locator('.announcement-bar .aviso-temporada').isVisible(), false);
            assert.ok(await p.locator('.announcement-bar .sin-temporada').first().isVisible());
            assert.equal(await p.locator('.nieve').isVisible(), false);
            assert.equal((await p.locator('.hero-products-title').textContent()).trim(), 'Más vendidos');
            assert.ok(await p.locator('#hero-temporada').isHidden());
            assert.equal(await p.locator('.catalog-carousel-card.is-temporada').count(), 0);
            assert.deepEqual(p.errores, []);
            await p.contexto.close();
        }
    },
    async 'en temporada: su categoría va primero, protagoniza la portada y sus tarjetas se distinguen'({ browser }) {
        const p = await abrir(browser, '', { fecha: EN_TEMPORADA, preparar: conProductosDeTemporada });
        assert.ok(await tieneClase(p));
        assert.ok(await p.locator('.announcement-bar .aviso-temporada').isVisible());
        assert.equal(await p.locator('.announcement-bar .sin-temporada').first().isVisible(), false);
        // Filtros: Todas, la de temporada y luego el resto; el primer grupo del catálogo es la temporada, con su banner.
        const filtros = await p.locator('#category-filters [data-categoria]').evaluateAll(b => b.map(x => x.dataset.categoria));
        assert.deepEqual(filtros.slice(0, 2), ['Todas', TEMPORADA.categoria]);
        assert.ok(await p.locator('.category-filter-temporada').isVisible());
        assert.equal((await p.locator('#main-content h2').first().textContent()).trim(), TEMPORADA.categoria);
        assert.ok(await p.locator('.temporada-banner').isVisible());
        assert.equal(await p.locator('.catalog-carousel-card.is-temporada').count(), DE_TEMPORADA);
        // La etiqueta de temporada sale en las tarjetas que no tienen otra (Top Ventas, Personalizable).
        assert.ok(await p.locator('.catalog-temporada-tag').count() >= 3);
        // Portada: el mosaico muestra la colección (hasta 4) y el botón lleva a ella sin recargar.
        assert.equal((await p.locator('.hero-products-title').textContent()).trim(), TEMPORADA.titulo);
        assert.equal(await p.locator('#hero-products').getAttribute('data-n'), String(Math.min(4, DE_TEMPORADA)));
        await p.locator('#hero-temporada').click();
        await p.waitForFunction(cat => new URLSearchParams(location.search).get('categoria') === cat, TEMPORADA.categoria);
        assert.match(await p.locator('#results-count').textContent(), new RegExp(`^${DE_TEMPORADA} productos`));
        assert.ok(p.eventos.some(e => e.nombre === 'categoria' && e.datos.categoria === TEMPORADA.categoria));
        assert.deepEqual(p.errores, []);
        assert.deepEqual(p.violaciones, []);
        await p.contexto.close();
    },
    async 'en temporada sin productos de su categoría: solo la ambientación, la portada sigue igual'({ browser }) {
        const p = await abrir(browser, '', {
            fecha: EN_TEMPORADA,
            preparar: pagina => pagina.route(/productos\.json/, async ruta => {
                const lista = (await (await ruta.fetch()).json()).filter(x => x.categoria !== TEMPORADA.categoria);
                await ruta.fulfill({ json: lista });
            })
        });
        assert.ok(await tieneClase(p));
        assert.equal((await p.locator('.hero-products-title').textContent()).trim(), 'Más vendidos');
        assert.ok(await p.locator('#hero-temporada').isHidden());
        assert.equal(await p.locator(`#category-filters [data-categoria="${TEMPORADA.categoria}"]`).count(), 0);
        assert.equal(await p.locator('.temporada-banner').count(), 0);
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async 'la ficha y la privacidad también se ambientan solo en fechas'({ browser }) {
        for (const ruta of ['producto/woody/', 'privacidad/']) {
            const dentro = await abrir(browser, ruta, { fecha: EN_TEMPORADA });
            assert.ok(await tieneClase(dentro), ruta);
            assert.ok(await dentro.locator('.announcement-bar .aviso-temporada').isVisible());
            assert.deepEqual(dentro.violaciones, []);
            await dentro.contexto.close();
            const fuera = await abrir(browser, ruta, { fecha: dia(TEMPORADA.hasta, 1) });
            assert.equal(await tieneClase(fuera), false, ruta);
            assert.equal(await fuera.locator('.announcement-bar .aviso-temporada').isVisible(), false);
            await fuera.contexto.close();
        }
    }
};
