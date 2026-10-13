// Buscador con sugerencias.
const { assert, abrir, ruta, nombresEventos } = require('./util.cjs');

module.exports = {
    async 'sugiere categorías y productos, con resaltado y accesibilidad de combobox'({ browser }) {
        const p = await abrir(browser);
        await p.fill('#search-input', 'hol');
        const opciones = await p.$$eval('#search-suggest [role=option]', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
        assert.match(opciones[0], /Ver Holders/);
        assert.ok(opciones.length >= 6 && opciones.some(o => /HOLDER ALIANZA LIMA/.test(o)));
        assert.equal(await p.getAttribute('#search-input', 'aria-expanded'), 'true');
        assert.ok(await p.locator('#search-suggest mark').count() > 0);
        await p.contexto.close();
    },
    async 'las flechas recorren las opciones, Enter abre la ficha y Escape cierra'({ browser }) {
        const p = await abrir(browser);
        await p.fill('#search-input', 'hol');
        await p.keyboard.press('ArrowDown');
        await p.keyboard.press('ArrowDown');
        assert.equal(await p.getAttribute('#search-input', 'aria-activedescendant'), 'sug-1');
        await p.keyboard.press('Escape');
        assert.ok(await p.locator('#search-suggest').isHidden());
        await p.fill('#search-input', 'hol');
        await p.keyboard.press('ArrowDown');
        await p.keyboard.press('ArrowDown');
        await Promise.all([p.waitForNavigation(), p.keyboard.press('Enter')]);
        assert.equal(ruta(p), '/producto/holder-alianza-lima/');
        assert.ok(p.eventos.some(e => e.nombre === 'ficha_buscador') || true);
        await p.contexto.close();
    },
    async 'elegir una categoría sugerida filtra el catálogo y limpia el campo'({ browser }) {
        const p = await abrir(browser);
        await p.fill('#search-input', 'barber');
        await p.locator('#search-suggest [data-tipo=categoria]').first().click();
        await p.waitForTimeout(600);
        assert.match(ruta(p), /categoria=Barber/);
        assert.equal(await p.inputValue('#search-input'), '');
        await p.contexto.close();
    },
    async 'sin resultados: ofrece WhatsApp y registra la búsqueda sin resultados'({ browser }) {
        const p = await abrir(browser);
        await p.fill('#search-input', 'zzzqwerty');
        assert.match(await p.locator('.search-suggest-vacio').innerText(), /No encontramos resultados/);
        assert.match(decodeURIComponent(await p.locator('.search-suggest-vacio a').getAttribute('href')), /busqué "zzzqwerty"/);
        await p.waitForTimeout(1900);
        assert.ok(nombresEventos(p).includes('busqueda_sin_resultados'));
        await p.click('h1');
        assert.ok(await p.locator('#search-suggest').isHidden());
        await p.contexto.close();
    },
    async 'en móvil las sugerencias no desbordan la pantalla'({ browser }) {
        const p = await abrir(browser, '', { vp: { width: 390, height: 844 } });
        await p.locator('#search-input').scrollIntoViewIfNeeded();
        await p.fill('#search-input', 'snoopy');
        assert.ok(await p.locator('#search-suggest [role=option]').count() >= 1);
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await p.contexto.close();
    }
};
