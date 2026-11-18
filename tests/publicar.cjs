// Publicación automática en Facebook e Instagram: el Apps Script (scripts/apps-script/Redes.gs, ejecutado con Google
// y Meta simulados) y los botones de la página interna redes/ (con el Apps Script simulado).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { assert, abrir, RAIZ, leerJson } = require('./util.cjs');

const CLAVE = 'clave-de-prueba-0123456789abcdef';
const PUBLICACIONES = fs.readFileSync(path.join(RAIZ, 'redes', 'publicaciones.json'), 'utf8');
const AHORA = new Date('2026-11-18T15:00:00Z');   // 10:00 en Lima

/**
 * Carga Redes.gs con los servicios de Google simulados. `meta(url, opciones)` responde a la Graph API: devuelve
 * [código, cuerpo] o undefined para la respuesta normal del simulador.
 */
function cargarGs({ meta = () => undefined, props = {} } = {}) {
    const propiedades = new Map(Object.entries({ CLAVE, META_TOKEN: 'token-pagina', ...props }));
    const cache = new Map();
    const filas = [];
    const llamadas = [];
    const correos = [];
    const activadores = [];
    let hoja = null;
    let n = 0;
    let ahora = AHORA;
    const rango = { setFontWeight: () => rango, setBackground: () => rango, setFontColor: () => rango, setNumberFormat: () => rango };
    const crearHoja = () => (hoja = {
        appendRow: fila => filas.push(fila), setFrozenRows() {}, getRange: () => rango,
        getDataRange: () => ({ getValues: () => filas.map(f => [...f]) })
    });
    class FechaFija extends Date {
        constructor(...a) { super(...(a.length ? a : [ahora])); }
        static now() { return ahora.getTime(); }
    }
    const simulador = (url, o) => {
        if (url.startsWith('https://tygersolis.github.io/S3D-Catalogo/redes/publicaciones.json')) return [200, PUBLICACIONES];
        const u = new URL(url);
        const ruta = u.pathname.replace('/v27.0/', '');
        const datos = o.payload || Object.fromEntries(u.searchParams);
        if (ruta === 'me') return [200, { id: 'PAG', name: 'S3D', instagram_business_account: { id: 'IG', username: 's3d' } }];
        if (ruta === 'PAG/photos') return [200, { id: `foto${++n}` }];
        if (ruta === 'PAG/feed') return [200, { id: `PAG_post${++n}` }];
        if (ruta === 'PAG/videos') return [200, { id: `video${++n}` }];
        if (ruta === 'IG/media') return [200, { id: `cont${++n}` }];
        if (ruta === 'IG/media_publish') return [200, { id: `media${++n}` }];
        if (datos.fields === 'status_code,status') return [200, { status_code: 'FINISHED' }];
        if (datos.fields === 'permalink') return [200, { permalink: `https://www.instagram.com/p/${ruta}/` }];
        return [404, { error: { code: 803, message: `ruta no simulada: ${ruta}` } }];
    };
    const contexto = {
        console: { log() {} },
        JSON, Math, Number, String, Object, Array, Error, encodeURIComponent,
        Date: FechaFija,
        ContentService: { createTextOutput: texto => ({ texto, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
        PropertiesService: { getScriptProperties: () => ({
            getProperty: k => propiedades.has(k) ? propiedades.get(k) : null,
            setProperty: (k, v) => propiedades.set(k, v),
            deleteProperty: k => propiedades.delete(k)
        }) },
        CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
        SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => hoja, insertSheet: crearHoja }) },
        UrlFetchApp: { fetch(url, o = {}) {
            const u = new URL(url);
            llamadas.push({ ruta: u.pathname.replace('/v27.0/', ''), metodo: o.method || 'get', datos: o.payload || Object.fromEntries(u.searchParams) });
            const [codigo, cuerpo] = meta(url, o) || simulador(url, o);
            return { getResponseCode: () => codigo, getContentText: () => typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) };
        } },
        Utilities: {
            sleep() {},
            getUuid: () => crypto.randomUUID(),
            formatDate: d => new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 10)   // solo 'yyyy-MM-dd' en Lima
        },
        MailApp: { sendEmail: (...a) => correos.push(a) },
        ScriptApp: {
            getProjectTriggers: () => [],
            deleteTrigger() {},
            newTrigger: f => { const t = { f, timeBased: () => t, atHour: h => { t.h = h; return t; }, everyDays: () => t, inTimezone: z => { t.z = z; return t; }, create: () => activadores.push(t) }; return t; }
        }
    };
    vm.createContext(contexto);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'scripts', 'apps-script', 'Redes.gs'), 'utf8'), contexto);
    const post = datos => JSON.parse(contexto.doPost({ postData: { contents: JSON.stringify({ clave: CLAVE, ...datos }) } }).texto);
    const publicadas = () => llamadas.filter(l => l.metodo === 'post');
    return { gs: contexto, post, filas, llamadas, publicadas, correos, activadores, propiedades, fijarHora: d => { ahora = d; } };
}

module.exports = {
    'Apps Script: sin la clave correcta no hace nada y bloquea tras 10 intentos'() {
        const s = cargarGs();
        assert.deepEqual(s.post({ accion: 'estado', clave: 'otra' }), { ok: false, error: 'clave incorrecta' });
        for (let i = 0; i < 9; i++) s.post({ accion: 'publicar', id: 3001, clave: 'x' });
        assert.match(s.post({ accion: 'estado' }).error, /demasiados intentos/);
        assert.equal(s.llamadas.length, 0, 'no debe llamar a Meta ni a la web');
        const sinClave = cargarGs({ props: { CLAVE: 'corta' } });
        assert.match(sinClave.post({ accion: 'estado' }).error, /falta configurar la CLAVE/);
    },
    'Apps Script: publica las fotos en Facebook (una publicación) e Instagram (carrusel), lo anota y no repite'() {
        const s = cargarGs();
        const contenido = JSON.parse(PUBLICACIONES).productos['3002'];
        const r = s.post({ accion: 'publicar', id: 3002, tipo: 'fotos' });
        assert.ok(r.ok, r.error);
        assert.match(r.resultado.facebook.enlace, /^https:\/\/www\.facebook\.com\/PAG_post\d+$/);
        assert.match(r.resultado.instagram.enlace, /^https:\/\/www\.instagram\.com\/p\/media\d+\/$/);
        const fotosFb = s.llamadas.filter(l => l.ruta === 'PAG/photos');
        assert.deepEqual(fotosFb.map(l => [l.datos.url, l.datos.published]), contenido.fotos.map(u => [u, 'false']));
        const feed = s.llamadas.find(l => l.ruta === 'PAG/feed').datos;
        assert.equal(feed.message, contenido.facebook);
        assert.equal(Object.keys(feed).filter(k => k.startsWith('attached_media[')).length, contenido.fotos.length);
        const ig = s.llamadas.filter(l => l.ruta === 'IG/media').map(l => l.datos);
        assert.deepEqual(ig.slice(0, -1).map(d => [d.image_url, d.is_carousel_item]), contenido.fotos.map(u => [u, 'true']));
        assert.deepEqual([ig.at(-1).media_type, ig.at(-1).caption, ig.at(-1).children.split(',').length], ['CAROUSEL', contenido.instagram, contenido.fotos.length]);
        assert.ok(s.llamadas.every(l => l.ruta.includes('publicaciones.json') || l.datos.access_token === 'token-pagina'));
        // En la hoja: encabezado + una fila por red
        assert.deepEqual(s.filas.slice(1).map(f => [f[1], f[3], f[4], f[5]]), [[3002, 'fotos', 'facebook', 'publicado'], [3002, 'fotos', 'instagram', 'publicado']]);
        assert.equal(r.estado['3002:fotos'].facebook.estado, 'publicado');
        // Pulsar otra vez no vuelve a publicar
        const antes = s.publicadas().length;
        const otra = s.post({ accion: 'publicar', id: 3002, tipo: 'fotos' });
        assert.ok(otra.ok);
        assert.equal(s.publicadas().length, antes);
        assert.match(s.post({ accion: 'aprobar', id: 3002, tipo: 'fotos' }).error, /ya está publicado/);
    },
    'Apps Script: con una sola foto, Instagram recibe la foto con su texto (sin carrusel)'() {
        const s = cargarGs();
        assert.ok(s.post({ accion: 'publicar', id: 3001 }).ok);
        const ig = s.llamadas.filter(l => l.ruta === 'IG/media');
        assert.equal(ig.length, 1);
        assert.ok(ig[0].datos.image_url.endsWith(JSON.parse(PUBLICACIONES).productos['3001'].fotos[0].split('/').pop()));
        assert.ok(ig[0].datos.caption);
    },
    'Apps Script: si Instagram falla, se explica y el reintento solo completa Instagram'() {
        let falla = true;
        const s = cargarGs({ meta: url => (falla && url.includes('/IG/media_publish')
            ? [400, { error: { code: 9004, message: 'Media download has failed' } }] : undefined) });
        const r = s.post({ accion: 'publicar', id: 3007 });
        assert.equal(r.resultado.facebook.estado, 'publicado');
        assert.equal(r.resultado.instagram.estado, 'error');
        assert.match(r.resultado.instagram.detalle, /no pudo descargar la foto.*Meta 9004/);
        falla = false;
        const feeds = s.llamadas.filter(l => l.ruta === 'PAG/feed').length;
        const r2 = s.post({ accion: 'publicar', id: 3007 });
        assert.equal(r2.resultado.instagram.estado, 'publicado');
        assert.equal(s.llamadas.filter(l => l.ruta === 'PAG/feed').length, feeds, 'Facebook no debe repetirse');
    },
    'Apps Script: el Reel espera a que Instagram procese el video y el video va a Facebook'() {
        let consultas = 0;
        const s = cargarGs({ meta: (url, o) => (!o.method && url.includes('fields=status_code')
            ? [200, { status_code: ++consultas < 3 ? 'IN_PROGRESS' : 'FINISHED' }] : undefined) });
        const contenido = JSON.parse(PUBLICACIONES).productos['3005'];
        const r = s.post({ accion: 'publicar', id: 3005, tipo: 'reel' });
        assert.equal(r.resultado.instagram.estado, 'publicado', JSON.stringify(r));
        assert.equal(consultas, 3);
        assert.deepEqual(s.llamadas.find(l => l.ruta === 'PAG/videos').datos.file_url, contenido.video);
        const reel = s.llamadas.find(l => l.ruta === 'IG/media').datos;
        assert.deepEqual([reel.media_type, reel.video_url], ['REELS', contenido.video]);
        assert.match(s.post({ accion: 'publicar', id: 3001, tipo: 'reel' }).resultado === undefined ? 'sin video' : '', /sin video/);
    },
    'Apps Script: «Aprobar» programa a las 11:00 y 19:00 de Lima y cada horario publica uno'() {
        const s = cargarGs();
        assert.ok(s.post({ accion: 'aprobar', id: 3001 }).ok);
        const r = s.post({ accion: 'aprobar', id: 3002 });
        assert.equal(r.estado['3001:fotos'].salida, '2026-11-18T16:00:00.000Z');   // hoy 11:00 Lima
        assert.equal(r.estado['3002:fotos'].salida, '2026-11-19T00:00:00.000Z');   // hoy 19:00 Lima
        assert.equal(s.publicadas().length, 0, 'aprobar no publica nada todavía');
        s.fijarHora(new Date('2026-11-18T16:05:00Z'));
        s.gs.publicarProgramadas();
        const e = s.post({ accion: 'estado' }).estado;
        assert.equal(e['3001:fotos'].instagram.estado, 'publicado');
        assert.equal(e['3001:fotos'].programado, null);
        assert.ok(e['3002:fotos'].programado, 'el segundo espera al siguiente horario');
        assert.equal(e['3002:fotos'].salida, '2026-11-19T00:00:00.000Z');
        assert.ok(!e['3002:fotos'].facebook);
        assert.ok(s.post({ accion: 'cancelar', id: 3002 }).ok);
        assert.equal(s.post({ accion: 'estado' }).estado['3002:fotos'].programado, null);
        s.gs.publicarProgramadas();
        assert.equal(s.llamadas.filter(l => l.ruta === 'PAG/feed').length, 1, 'sin aprobados, el horario no publica');
        s.gs.instalar();
        assert.deepEqual(s.activadores.map(t => [t.f, t.h, t.z]), [['publicarProgramadas', 11, 'America/Lima'], ['publicarProgramadas', 19, 'America/Lima']]);
    },
    'Apps Script: si falla una publicación programada, avisa por correo'() {
        const s = cargarGs({ meta: url => (url.includes('/PAG/feed') ? [400, { error: { code: 190, message: 'Session has expired' } }] : undefined) });
        s.post({ accion: 'aprobar', id: 3004 });
        s.gs.publicarProgramadas();
        assert.equal(s.correos.length, 1);
        assert.match(s.correos[0][2], /facebook: el permiso de Meta venció/);
        assert.equal(s.post({ accion: 'estado' }).estado['3004:fotos'].programado, null);
    },
    'Apps Script: producto fuera de la cola, y «guardarPermiso» obtiene el permiso de la página'() {
        const s = cargarGs({ props: { META_TOKEN: '' } });
        assert.match(s.post({ accion: 'publicar', id: 1 }).error, /no está en la cola de la web principal/);
        s.propiedades.set('APP_ID', '123'); s.propiedades.set('APP_SECRET', 'secreto'); s.propiedades.set('TOKEN_TEMPORAL', 'corto');
        const t = cargarGs({
            props: Object.fromEntries(s.propiedades),
            meta: url => {
                if (url.includes('oauth/access_token')) return [200, { access_token: 'largo' }];
                if (url.includes('me/accounts')) return [200, { data: [{ id: 'PAG', name: 'S3D', access_token: 'pagina', instagram_business_account: { id: 'IG', username: 's3d' } }] }];
                return undefined;
            }
        });
        t.gs.guardarPermiso();
        assert.deepEqual(['META_TOKEN', 'PAGINA_ID', 'INSTAGRAM_ID'].map(k => t.propiedades.get(k)), ['pagina', 'PAG', 'IG']);
        assert.ok(!t.propiedades.has('TOKEN_TEMPORAL'));
        assert.equal(t.llamadas[0].datos.fb_exchange_token, 'corto');
        assert.equal(t.llamadas[1].datos.access_token, 'largo');
    },
    async 'página: con la clave, «Publicar ahora» (doble toque), «Aprobar» y los errores se muestran sin HTML'({ browser }) {
        const API = 'https://script.google.com/macros/s/PRUEBA/exec';
        const pedidos = [];
        const estado = {};
        const p = await abrir(browser, 'redes/', {
            preparar: async pagina => {
                await pagina.route(/\/redes\/$/, async ruta => {
                    const html = (await (await ruta.fetch()).text()).replace('data-api=""', `data-api="${API}"`);
                    await ruta.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
                });
                await pagina.route(API, async ruta => {
                    const d = JSON.parse(ruta.request().postData());
                    pedidos.push(d);
                    if (d.clave !== CLAVE) return ruta.fulfill({ json: { ok: false, error: 'clave incorrecta' } });
                    const k = `${d.id}:${d.tipo}`;
                    if (d.accion === 'publicar') estado[k] = {
                        facebook: { estado: 'publicado', fecha: '2026-11-18T16:00:00Z', enlace: 'https://www.facebook.com/PAG_1' },
                        instagram: d.id === 3002 ? { estado: 'error', detalle: '<img src=x id=inyectado>' } : { estado: 'publicado', fecha: '2026-11-18T16:01:00Z', enlace: 'https://www.instagram.com/p/x/' }
                    };
                    if (d.accion === 'aprobar') estado[k] = { programado: '2026-11-18T15:00:00Z', salida: '2026-11-19T00:00:00Z' };
                    if (d.accion === 'cancelar') estado[k] = { programado: null };
                    await ruta.fulfill({ json: { ok: true, estado } });
                });
            }
        });
        assert.match(await p.locator('[data-conexion-estado]').textContent(), /Escribe tu clave/);
        assert.equal(await p.locator('.rd-auto:visible').count(), 0);
        // Clave errada: se explica y no se guarda
        await p.fill('#rd-clave', 'clave-equivocada-0123456789');
        await p.click('[data-clave-form] button');
        await p.locator('[data-conexion-estado].rd-mal').waitFor();
        assert.match(await p.locator('[data-conexion-estado]').textContent(), /clave incorrecta/);
        assert.equal(await p.evaluate(() => localStorage.getItem('s3d-redes-clave')), null);
        // Clave correcta: aparecen los botones
        await p.fill('#rd-clave', CLAVE);
        await p.click('[data-clave-form] button');
        await p.locator('[data-conexion-estado].rd-bien').waitFor();
        assert.ok(await p.locator('[data-clave-form]').isHidden());
        const primero = p.locator('#p-3001 .rd-auto[data-tipo="fotos"]');
        assert.ok(await primero.isVisible());
        // «Publicar ahora» pide un segundo toque
        await primero.locator('[data-accion="publicar"]').click();
        assert.equal(await primero.locator('[data-accion="publicar"]').textContent(), 'Toca otra vez para publicar');
        assert.ok(!pedidos.some(d => d.accion === 'publicar'));
        await primero.locator('[data-accion="publicar"]').click();
        await primero.locator('li.rd-bien').nth(1).waitFor();
        assert.deepEqual(pedidos.filter(d => d.accion === 'publicar'), [{ accion: 'publicar', clave: CLAVE, id: 3001, tipo: 'fotos' }]);
        assert.match(await primero.locator('[data-auto-estado]').textContent(), /Facebook: publicado el .*Instagram: publicado el/s);
        assert.equal(await primero.locator('a[href="https://www.instagram.com/p/x/"]').count(), 1);
        assert.ok(await primero.locator('[data-accion="publicar"]').isHidden());
        assert.equal(await p.locator('[data-progreso="redes"]').textContent(), '1');
        // Un error de Meta se muestra como texto (nunca como HTML) y se puede reintentar
        const segundo = p.locator('#p-3002 .rd-auto[data-tipo="fotos"]');
        await segundo.locator('[data-accion="publicar"]').dblclick();
        await segundo.locator('li.rd-mal').waitFor();
        assert.match(await segundo.locator('li.rd-mal').textContent(), /Instagram: falló \(<img src=x id=inyectado>\)/);
        assert.equal(await p.locator('#inyectado').count(), 0);
        assert.ok(await segundo.locator('[data-accion="publicar"]').isVisible());
        // Aprobar y quitar de la programación
        const reel = p.locator('#p-3005 .rd-auto[data-tipo="reel"]');
        await reel.locator('[data-accion="aprobar"]').click();
        await reel.locator('li.rd-espera').waitFor();
        assert.match(await reel.locator('li.rd-espera').textContent(), /Aprobado: saldrá solo el/);
        assert.ok(await reel.locator('[data-accion="cancelar"]').isVisible());
        await reel.locator('[data-accion="cancelar"]').click();
        await reel.locator('[data-accion="aprobar"]').waitFor();
        assert.equal(await reel.locator('li.rd-espera').count(), 0);
        assert.ok(await reel.locator('[data-accion="cancelar"]').isHidden());
        // Al volver a entrar, la clave guardada conecta sola
        await p.reload({ waitUntil: 'networkidle' });
        await p.locator('[data-conexion-estado].rd-bien').waitFor();
        assert.deepEqual(p.errores, []);
        assert.deepEqual(p.violaciones, []);
        await p.contexto.close();
    }
};

// Para otras pruebas: el contenido que publica el script sale de la web y coincide con la página.
module.exports['publicaciones.json: mismos productos que la página y fotos/videos que existen'] = () => {
    const datos = JSON.parse(PUBLICACIONES).productos;
    const html = fs.readFileSync(path.join(RAIZ, 'redes', 'index.html'), 'utf8');
    const ids = [...html.matchAll(/<article class="rd-post" id="p-(\d+)"/g)].map(m => m[1]);
    assert.deepEqual(Object.keys(datos).sort(), [...ids].sort());
    const base = leerJson('config.json').urlBase;
    for (const [id, p] of Object.entries(datos)) {
        for (const url of [...p.fotos, ...(p.video ? [p.video] : [])]) {
            assert.ok(url.startsWith(base), `${id}: ${url}`);
            const local = decodeURIComponent(url.slice(base.length).split('?')[0]);
            assert.ok(fs.existsSync(path.join(RAIZ, local)), `${id}: no existe ${local}`);
        }
        assert.ok(p.facebook.includes('utm_source=facebook') && !/https?:/.test(p.instagram), id);
    }
};
