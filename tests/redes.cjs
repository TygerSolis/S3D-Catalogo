// Kit de publicaciones para redes (redes/index.html): textos, fotos 4:5 y la página interna de revisión.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { assert, abrir, RAIZ, leerJson } = require('./util.cjs');

const py = codigo => JSON.parse(execFileSync('python3', ['-c', `import json, redes as r
p = {q['id']: q for q in json.load(open('../productos.json'))}
${codigo}`], { cwd: path.join(RAIZ, 'scripts'), encoding: 'utf8' }));
const cola = () => {
    const productos = leerJson('productos.json');
    return leerJson('config.json').redes.cola.filter(id => productos.find(p => p.id === id)?.activo !== false);
};
const leer = ruta => fs.readFileSync(path.join(RAIZ, ruta), 'utf8');

module.exports = {
    'textos: enlace con origen en Facebook y en la respuesta; sin enlaces en Instagram ni en Marketplace'() {
        const r = py(`a = p[3005]; o = p[214]
print(json.dumps({'fb': r.texto_facebook(a), 'ig': r.texto_instagram(a), 'mp': r.marketplace(a), 'resp': r.respuesta_disponible(a),
  'fbo': r.texto_facebook(o), 'fotos': r.fotos(a),
  'tit': [r.titulo('SNOOPY Y WOODSTOCK EN TRINEO CON ÁRBOL'), r.titulo('LÁMPARA LED 3D 20CM')]}))`);
        assert.match(r.fb, /producto\/arbol-navideno\/\?utm_source=facebook&utm_medium=social&utm_campaign=navidad/);
        assert.match(r.fbo, /utm_source=facebook&utm_medium=social&utm_campaign=catalogo/);
        assert.match(r.fb, /Blanco con luz LED \(28 cm\) S\/ 45\.00 · Verde \(22 cm\) S\/ 30\.00/);
        assert.match(r.fb, /desde S\/ 30\.00 según el color/);
        assert.doesNotMatch(r.ig, /https?:/);
        // Instagram admite como máximo 5 hashtags por publicación
        for (const texto of [r.fb, r.ig, r.fbo]) assert.ok((texto.match(/#\S+/g) || []).length <= 5, texto);
        assert.match(r.ig, /WhatsApp al \+51/);
        assert.doesNotMatch(r.mp.descripcion, /https?:|#\w/);
        assert.deepEqual([r.mp.titulo, r.mp.precio, r.mp.estado], ['Árbol Navideño - impreso en 3D', '30', 'Nuevo']);
        assert.match(r.resp, /utm_source=marketplace/);
        assert.deepEqual(r.fotos, ['nav-arboles-1', 'nav-arboles-2', 'nav-arbol-blanco-1', 'nav-arbol-blanco-2']);
        assert.deepEqual(r.tit, ['Snoopy y Woodstock en Trineo con Árbol', 'Lámpara LED 3D 20CM']);
    },
    async 'fotos: una JPG 4:5 (1080×1350) por foto de la cola, sin repetir y sin sobrantes'() {
        const html = leer('redes/index.html');
        const usadas = [...html.matchAll(/<img src="fotos\/([^"?]+)\.jpg\?v=[0-9a-f]{8}"/g)].map(m => decodeURIComponent(m[1]));
        assert.ok(usadas.length > 0);
        assert.doesNotMatch(html, /rd-pendiente/, 'hay fotos pendientes: ejecuta node scripts/redes_fotos.cjs');
        const porProducto = [...html.matchAll(/<article[\s\S]*?<\/article>/g)].map(a => [...a[0].matchAll(/<img src="([^"]+)"/g)].map(m => m[1]));
        for (const lista of porProducto) assert.equal(new Set(lista).size, lista.length, 'una foto repetida en un producto');
        const archivos = fs.readdirSync(path.join(RAIZ, 'redes', 'fotos')).map(f => f.replace(/\.jpg$/, ''));
        assert.deepEqual([...archivos].sort(), [...new Set(usadas)].sort(), 'cada JPG debe usarse y existir');
        for (const nombre of archivos) {
            const m = await sharp(path.join(RAIZ, 'redes', 'fotos', `${nombre}.jpg`)).metadata();
            assert.deepEqual([m.format, m.width, m.height], ['jpeg', 1080, 1350], nombre);
        }
    },
    async 'página: sigue la cola, copia textos y recuerda lo publicado en Marketplace'({ browser }) {
        const p = await abrir(browser, 'redes/');
        assert.equal(await p.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
        const ids = await p.locator('.rd-post').evaluateAll(a => a.map(x => Number(x.dataset.id)));
        assert.deepEqual(ids, cola());
        const primero = p.locator('.rd-post').first();
        // Copiar el texto de Facebook
        await primero.locator('[data-copiar^="fb-"]').click();
        const copiado = await p.evaluate(() => navigator.clipboard.readText());
        assert.equal(copiado, await primero.locator('[id^="fb-"]').textContent());
        assert.match(copiado, /utm_source=facebook/);
        assert.equal(await primero.locator('[data-copiar^="fb-"]').textContent(), '¡Copiado!');
        // Marketplace (a mano): la marca se cuenta y se recuerda al volver
        await primero.locator('summary', { hasText: 'Marketplace' }).click();
        await primero.locator('[data-red="marketplace"]').check();
        assert.equal(await p.locator('[data-progreso="marketplace"]').textContent(), '1');
        await p.reload({ waitUntil: 'networkidle' });
        assert.ok(await p.locator('.rd-post').first().locator('[data-red="marketplace"]').isChecked());
        assert.equal(await p.locator('[data-progreso="marketplace"]').textContent(), '1');
        // Sin el Apps Script configurado, los botones automáticos no aparecen y se explica por qué
        if (!leerJson('config.json').redes.publicarUrl) {
            assert.equal(await p.locator('.rd-auto:visible').count(), 0);
            assert.match(await p.locator('[data-conexion-estado]').textContent(), /Aún no está conectada/);
        }
        // Sin analítica: las visitas del dueño no cuentan
        assert.equal(await p.locator('script[src*="analytics"]').count(), 0);
        assert.deepEqual(p.eventos, []);
        assert.deepEqual(p.errores, []);
        assert.deepEqual(p.violaciones, []);
        await p.contexto.close();
    },
    'la página interna no está en el sitemap ni enlazada desde la web'() {
        assert.doesNotMatch(leer('sitemap.xml'), /\/redes\//);
        for (const ruta of ['index.html', 'scripts/chrome/header.html', 'scripts/chrome/footer.html']) {
            assert.doesNotMatch(leer(ruta), /href="[^"]*redes\//, ruta);
        }
    }
};
