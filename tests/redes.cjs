// Kit de publicaciones para redes (redes/index.html): textos, fotos 4:5 y la página interna de revisión.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { assert, abrir, RAIZ, leerJson } = require('./util.cjs');

const py = codigo => JSON.parse(execFileSync('python3', ['-c', `import json, redes as r, hoja_catalogo as h
from validar_productos import validar
p = {q['id']: q for q in json.load(open('../productos.json'))}
${codigo}`], { cwd: path.join(RAIZ, 'scripts'), encoding: 'utf8' }));
const cola = () => py(`print(json.dumps([q['id'] for q in r.cola(list(p.values()))]))`);
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
    'cola: la columna «redes» de la hoja decide el orden; vacío = los más nuevos primero; «no» = nunca'() {
        const r = py(`import copy
from datetime import date
q = copy.deepcopy(list(p.values()))
por = {x['id']: x for x in q}
por[1]['redes'] = 2; por[14]['redes'] = 1          # Woody 2.º, Snoopy Peaky Blinders 1.º
por[3001]['redes'] = False                         # nunca
por[2]['disponibilidad'] = 'Agotado'              # agotado: fuera
por[3]['activo'] = False                           # oculto: fuera
c = [x['id'] for x in r.cola(q)]
sin = [x for x in q if x.get('redes') is None and x['activo'] and x['disponibilidad'] != 'Agotado']
fechas = [date.fromisoformat(por[i]['fechaAlta']) for i in c[2:]]
# la hoja: «redes» acepta número, «no» o vacío, y es opcional (hojas sin la columna)
filas = [h.a_fila(dict(por[14])), h.a_fila(dict(por[3001])), h.a_fila(dict(por[4]))]
errores = []
vuelta = [h.de_fila(f, n, errores) for n, f in enumerate(filas, 2)]
sin_columna = h.de_fila({k: v for k, v in filas[0].items() if k != 'redes'}, 2, errores)
malo = validar([dict(por[4], redes=0)], comprobar_archivos=False) + validar([dict(por[4], redes='x')], comprobar_archivos=False)
print(json.dumps({'c': c[:2], 'excluidos': [i for i in (3001, 2, 3) if i in c], 'ordenadas': fechas == sorted(fechas, reverse=True),
  'total': len(c), 'celdas': [f['redes'] for f in filas], 'vuelta': [v.get('redes', 'vacío') for v in vuelta],
  'sin_columna': 'redes' in sin_columna, 'errores': errores, 'malo': len(malo)}))`);
        assert.deepEqual(r.c, [14, 1]);
        assert.deepEqual(r.excluidos, []);
        assert.ok(r.ordenadas, 'sin número: de la fecha de alta más nueva a la más antigua');
        assert.deepEqual(r.celdas, ['1', 'no', '']);
        assert.deepEqual(r.vuelta, [1, false, 'vacío']);
        assert.equal(r.sin_columna, false);
        assert.deepEqual(r.errores, []);
        assert.equal(r.malo, 2, '0 o texto en «redes» es un error');
    },
    async 'historias: una JPG 9:16 (1080×1920) por producto de la cola, sin sobrantes, y se ven en la página'() {
        const html = leer('redes/index.html');
        const enPagina = [...html.matchAll(/<img src="historias\/([^"]+)\.jpg"/g)].map(m => m[1]);
        const archivos = fs.readdirSync(path.join(RAIZ, 'redes', 'historias')).map(f => f.replace(/\.jpg$/, ''));
        assert.equal(enPagina.length, cola().length, 'cada producto de la cola tiene su historia');
        assert.deepEqual([...archivos].sort(), [...enPagina].sort());
        for (const nombre of archivos.slice(0, 10)) {
            const m = await sharp(path.join(RAIZ, 'redes', 'historias', `${nombre}.jpg`)).metadata();
            assert.deepEqual([m.format, m.width, m.height], ['jpeg', 1080, 1920], nombre);
        }
        // La huella del nombre cambia si cambia el precio (Meta y los navegadores no se quedan con la vieja)
        const r = py(`a = dict(p[3001]); b2 = dict(a, precio=150)
print(json.dumps([r.historia(a)['archivo'], r.historia(b2)['archivo']]))`);
        assert.notEqual(r[0], r[1]);
    },
    'la página interna no está en el sitemap ni enlazada desde la web'() {
        assert.doesNotMatch(leer('sitemap.xml'), /\/redes\//);
        for (const ruta of ['index.html', 'scripts/chrome/header.html', 'scripts/chrome/footer.html']) {
            assert.doesNotMatch(leer(ruta), /href="[^"]*redes\//, ruta);
        }
    }
};
