// Registro de pedidos (Fase 2): código S3D-XXXXX en el mensaje y envío a la hoja (Apps Script simulado).
const { assert, abrir } = require('./util.cjs');

const URL_PRUEBA = 'https://script.google.com/macros/s/PRUEBA/exec';
const CODIGO = /^Pedido (S3D-[2-9A-HJ-NP-Z]{5})\n/;

// Abre la página con el registro ENCENDIDO: sirve tienda.js con PEDIDOS_URL de prueba y captura los envíos.
async function abrirConRegistro(browser, ruta = '') {
    const envios = [];
    const p = await abrir(browser, ruta, {
        preparar: async pagina => {
            await pagina.route(/tienda\.js/, async r => {
                const cuerpo = (await (await r.fetch()).text()).replace(/const PEDIDOS_URL = '[^']*';/, `const PEDIDOS_URL = '${URL_PRUEBA}';`);
                await r.fulfill({ contentType: 'text/javascript', body: cuerpo });
            });
            await pagina.context().route('https://script.google.com/**', r => { envios.push(JSON.parse(r.request().postData())); r.fulfill({ json: { ok: true } }); });
            await pagina.context().route('https://api.whatsapp.com/**', r => r.fulfill({ contentType: 'text/html', body: 'wa' }));
        }
    });
    p.envios = envios;
    return p;
}
const textoDe = url => new URL(url).searchParams.get('text');

module.exports = {
    async 'Mi pedido: el mensaje empieza con el código y la hoja recibe productos, cantidades y total'({ browser }) {
        const p = await abrirConRegistro(browser, '?categoria=Mu%C3%B1ecos%20Coleccionables');
        const t = nombre => p.locator('.catalog-carousel-card', { hasText: nombre }).first();
        await t('WOODY').locator('[data-pedido-add]').click();
        await t('WOODY').locator('[data-pedido-add]').click();
        await t('BUZZ').locator('[data-pedido-add]').click();
        await p.click('#s3d-fab');
        const [wa] = await Promise.all([p.contexto.waitForEvent('page'), p.click('.s3d-enviar')]);
        const mensaje = textoDe(wa.url());
        const codigo = mensaje.match(CODIGO)?.[1];
        assert.ok(codigo, mensaje.slice(0, 80));
        assert.match(mensaje, /2 × WOODY/);
        await p.waitForTimeout(300);
        assert.equal(p.envios.length, 1);
        const e = p.envios[0];
        assert.equal(e.codigo, codigo);
        assert.equal(e.tipo, 'pedido');
        assert.deepEqual(e.items.map(i => [i.nombre, i.cantidad]), [['WOODY', 2], ['BUZZ', 1]]);
        assert.equal(e.total, 70 * 2 + e.items[1].precio);
        assert.match(e.pagina, /^http:\/\/localhost:\d+\//);
        assert.equal(Object.keys(e).sort().join(), 'codigo,items,pagina,tipo,total', 'solo viajan datos del pedido');
        assert.match(await p.locator('#s3d-aviso, .s3d-aviso').first().textContent(), new RegExp(codigo));
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async 'Comprar en la tarjeta y en la ficha registra un pedido y antepone el código (un código por clic)'({ browser }) {
        const p = await abrirConRegistro(browser);
        const comprar = p.locator('.catalog-carousel-card', { hasText: 'HELLO KITTY URBANA' }).first();
        await comprar.locator('.catalog-carousel-swatch').nth(1).click();
        const [wa] = await Promise.all([p.contexto.waitForEvent('page'), comprar.locator('[data-carousel-buy]').click()]);
        const m1 = textoDe(wa.url());
        assert.match(m1, CODIGO);
        assert.match(m1, /HELLO KITTY URBANA \(Color: Gris\) - Precio: S\/ 70\.00/);
        assert.equal((m1.match(/Pedido S3D-/g) || []).length, 1);
        const [wa2] = await Promise.all([p.contexto.waitForEvent('page'), comprar.locator('[data-carousel-buy]').click()]);
        const m2 = textoDe(wa2.url());
        assert.equal((m2.match(/Pedido S3D-/g) || []).length, 1, 'el segundo clic no debe acumular códigos');
        assert.notEqual(m1.match(CODIGO)[1], m2.match(CODIGO)[1]);
        await p.waitForTimeout(300);
        assert.equal(p.envios.length, 2);
        assert.deepEqual([p.envios[0].tipo, p.envios[0].items[0].nombre, p.envios[0].items[0].color, p.envios[0].total], ['comprar', 'HELLO KITTY URBANA', 'Gris', 70]);
        await p.goto(p.url().split('?')[0] + 'producto/woody/', { waitUntil: 'networkidle' });
        const [wa3] = await Promise.all([p.contexto.waitForEvent('page'), p.click('#pp-buy')]);
        assert.match(textoDe(wa3.url()), CODIGO);
        await p.waitForTimeout(300);
        assert.equal(p.envios.at(-1).items[0].nombre, 'WOODY');
        assert.deepEqual(p.errores, []);
        await p.contexto.close();
    },
    async 'Cotizar desde la ficha registra el pedido con medida y color'({ browser }) {
        const p = await abrirConRegistro(browser, 'producto/woody/');
        await p.locator('.pp-cotizador summary').click();
        await p.fill('#cq-medida', '40 cm');
        await p.fill('#cq-color', 'azul');
        const [wa] = await Promise.all([p.contexto.waitForEvent('page'), p.click('.pp-form-enviar')]);
        const mensaje = textoDe(wa.url());
        assert.match(mensaje, CODIGO);
        assert.match(mensaje, /Medida que necesito: 40 cm/);
        await p.waitForTimeout(300);
        const e = p.envios.at(-1);
        assert.deepEqual([e.tipo, e.items[0].nombre, e.items[0].medida, e.items[0].color], ['cotizar', 'WOODY', '40 cm', 'azul']);
        assert.equal(e.codigo, mensaje.match(CODIGO)[1]);
        await p.contexto.close();
    },
    async 'con el registro apagado (pedidosUrl vacío) no hay código ni envíos'({ browser }) {
        const envios = [];
        const p = await abrir(browser, '', { preparar: async pagina => {
            await pagina.route(/tienda\.js/, async r => r.fulfill({ contentType: 'text/javascript', body: (await (await r.fetch()).text()).replace(/const PEDIDOS_URL = '[^']*';/, "const PEDIDOS_URL = '';") }));
            await pagina.context().route('https://script.google.com/**', r => { envios.push(r.request().url()); r.abort(); });
        } });
        await p.context().route('https://api.whatsapp.com/**', r => r.fulfill({ contentType: 'text/html', body: 'wa' }));
        const [wa] = await Promise.all([p.contexto.waitForEvent('page'), p.locator('[data-carousel-buy]').first().click()]);
        assert.doesNotMatch(textoDe(wa.url()), /^Pedido S3D-/);
        await p.waitForTimeout(300);
        assert.deepEqual(envios, []);
        await p.contexto.close();
    },

    'resumenDiario: correo solo si hay pedidos «Nuevo» de más de 24 h, con código, total y resumen del día'() {
        const fs = require('fs');
        const path = require('path');
        const vm = require('vm');
        const AHORA = new Date('2026-11-24T14:00:00Z');   // 9:00 en Lima
        const horas = h => new Date(AHORA.getTime() - h * 3600e3);
        const filaDe = (n, fecha, codigo, tipo, productos, total, estado) => [n, fecha, codigo, tipo, productos, 1, total, '', '', estado, ''];
        const cargar = filas => {
            const correos = [];
            const activadores = [];
            const hoja = {
                getLastRow: () => filas.length + 1,
                getRange: (f, c, nf, nc) => ({ getValues: () => filas.slice(f - 2, f - 2 + nf).map(x => x.slice(c - 1, c - 1 + nc)) }),
                appendRow() {}
            };
            class FechaFija extends Date { constructor(...a) { super(...(a.length ? a : [AHORA.getTime()])); } }
            const contexto = {
                Date: FechaFija, Math, Number, String, Object, Array, JSON, isNaN, isFinite,
                SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => hoja, getUrl: () => 'https://docs.google.com/spreadsheets/d/PEDIDOS' }) },
                MailApp: { getRemainingDailyQuota: () => 100, sendEmail: (...a) => correos.push(a) },
                Utilities: { formatDate: (d, zona, formato) => { assert.equal(zona, 'America/Lima'); assert.equal(formato, 'dd/MM HH:mm'); const l = new Date(d.getTime() - 5 * 3600e3); return `${String(l.getUTCDate()).padStart(2, '0')}/${String(l.getUTCMonth() + 1).padStart(2, '0')} ${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`; } },
                ScriptApp: {
                    getProjectTriggers: () => [{ getHandlerFunction: () => 'resumenDiario' }, { getHandlerFunction: () => 'otra' }],
                    deleteTrigger: t => activadores.push(['borrado', t.getHandlerFunction()]),
                    newTrigger: f => { const t = { f, timeBased: () => t, atHour: h => { t.h = h; return t; }, everyDays: d => { t.d = d; return t; }, inTimezone: z => { t.z = z; return t; }, create: () => activadores.push(t) }; return t; }
                },
                Logger: { log() {} }
            };
            vm.createContext(contexto);
            vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'apps-script', 'Pedidos.gs'), 'utf8'), contexto);
            return { gs: contexto, correos, activadores };
        };
        // Sin pendientes (el nuevo tiene menos de 24 h y el viejo ya está confirmado): no hay correo.
        let s = cargar([filaDe(1, horas(30), 'S3D-AAAAA', 'Comprar', '1 × WOODY — S/ 70.00', 70, 'Confirmado'), filaDe(2, horas(2), 'S3D-BBBBB', 'Mi pedido', '1 × BUZZ', 80, 'Nuevo')]);
        s.gs.resumenDiario();
        assert.equal(s.correos.length, 0);
        // Con pendientes: lista los de los últimos 7 días (el más reciente primero) y cuenta los más antiguos aparte.
        s = cargar([
            filaDe(1, horas(24 * 10), 'S3D-VIEJO', 'Comprar', '1 × X', 10, 'Nuevo'),
            filaDe(2, horas(50), 'S3D-CCCCC', 'Cotizar', '1 × LLAVERO', '', 'Nuevo'),
            filaDe(3, horas(26), 'S3D-DDDDD', 'Mi pedido', '2 × WOODY — S/ 70.00\n1 × BUZZ — S/ 80.00', 220, ' Nuevo '),
            filaDe(4, horas(3), 'S3D-EEEEE', 'Comprar', '1 × JESSIE', 75, 'Nuevo'),
            filaDe(5, 'sin fecha', 'S3D-FFFFF', 'Comprar', '1 × Y', 5, 'Nuevo')
        ]);
        s.gs.resumenDiario();
        assert.equal(s.correos.length, 1);
        const [para, asunto, cuerpo] = s.correos[0];
        assert.equal(para, 'ventas.s3d@gmail.com');
        assert.equal(asunto, 'S3D: 3 pedidos por retomar');
        assert.ok(cuerpo.indexOf('S3D-DDDDD') < cuerpo.indexOf('S3D-CCCCC'), cuerpo);
        assert.match(cuerpo, /S3D-DDDDD · 23\/11 07:00 · Mi pedido · S\/ 220\.00\n   2 × WOODY — S\/ 70\.00 \(\+1 más\)/);
        assert.match(cuerpo, /S3D-CCCCC · .* · Cotizar · por cotizar/);
        assert.ok(!cuerpo.includes('S3D-VIEJO') && !cuerpo.includes('S3D-EEEEE'), 'ni los antiguos ni los de menos de 24 h van en la lista');
        assert.match(cuerpo, /Además hay 1 en «Nuevo» de hace más de 7 días/);
        assert.match(cuerpo, /Últimas 24 h: 1 registro \(1 Comprar\)/);
        // instalarResumen reemplaza su propio activador (9:00, hora de Lima) sin tocar los demás.
        s.gs.instalarResumen();
        assert.deepEqual(s.activadores[0], ['borrado', 'resumenDiario']);
        assert.equal(s.activadores.length, 2);
        assert.deepEqual([s.activadores[1].f, s.activadores[1].h, s.activadores[1].d, s.activadores[1].z], ['resumenDiario', 9, 1, 'America/Lima']);
    },

    '«Lo más pedido»: el registro devuelve solo nombres, por pedidos distintos de los últimos 30 días (mínimo 2)'() {
        const fs = require('fs');
        const path = require('path');
        const vm = require('vm');
        const AHORA = new Date('2026-11-24T14:00:00Z');
        const dias = d => new Date(AHORA.getTime() - d * 86400e3);
        const fila = (fecha, productos, estado = 'Nuevo') => [1, fecha, 'S3D-AAAAA', 'Mi pedido', productos, 1, 10, 'detalle con teléfono 999', 'https://x', estado, 'nota privada'];
        const filas = [
            fila(dias(1), '10 × LLAVERO NIKE (Negro) — S/ 15.00'),                       // 10 unidades = 1 pedido
            fila(dias(2), '1 × LLAVERO NIKE — S/ 15.00\n2 × LLAVERO NIKE (Rojo) — S/ 15.00'),   // repetido en el pedido = 1
            fila(dias(3), '1 × WOODY — S/ 70.00\n1 × BUZZ (Grande, 30 cm) — por cotizar', 'Cancelado'),
            fila(dias(4), '1 × WOODY — S/ 70.00'),
            fila(dias(5), '1 × BUZZ — S/ 80.00'),
            fila(dias(6), "'1 × JESSIE — S/ 75.00"),                                       // un solo pedido: no entra
            fila(dias(40), '1 × JESSIE — S/ 75.00\n1 × JESSIE — S/ 75.00'),                // fuera de los 30 días
            fila('sin fecha', '1 × JESSIE — S/ 75.00')
        ];
        const cache = new Map();
        const hoja = { getLastRow: () => filas.length + 1, getRange: (f, c, nf, nc) => ({ getValues: () => filas.slice(f - 2, f - 2 + nf).map(x => x.slice(c - 1, c - 1 + nc)) }), appendRow() {} };
        class FechaFija extends Date { constructor(...a) { super(...(a.length ? a : [AHORA.getTime()])); } static now() { return AHORA.getTime(); } }
        const contexto = {
            Date: FechaFija, Math, Number, String, Object, Array, JSON, isNaN, isFinite,
            SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => hoja }) },
            CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
            ContentService: { createTextOutput: texto => ({ texto, setMimeType() { return this; } }), MimeType: { JSON: 'json' } }
        };
        vm.createContext(contexto);
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'apps-script', 'Pedidos.gs'), 'utf8'), contexto);
        const respuesta = JSON.parse(contexto.doGet({ parameter: { ver: 'mas-pedidos' } }).texto);
        // Los tres tienen 2 pedidos (el cancelado también cuenta): primero el de pedido más reciente (NIKE); a igual
        // fecha, por nombre.
        assert.deepEqual(respuesta, { dias: 30, productos: ['LLAVERO NIKE', 'BUZZ', 'WOODY'] });
        assert.ok(!JSON.stringify(respuesta).match(/999|nota|S3D-/), 'no expone datos de pedidos');
        assert.ok(cache.has('mas-pedidos'), 'se guarda en caché');
        assert.equal(contexto.doGet({ parameter: {} }).texto, 'Registro de pedidos S3D: activo');
    },
};
