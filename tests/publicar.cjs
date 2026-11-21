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
    const rango = (f0 = 1, c0 = 1) => {
        const r = {
            setFontWeight: () => r, setBackground: () => r, setFontColor: () => r, setNumberFormat: () => r,
            getValue: () => (filas[f0 - 1] || [])[c0 - 1] ?? '',
            setValues: v => { v.forEach((fila, i) => { filas[f0 - 1 + i] = [...fila]; }); return r; }
        };
        return r;
    };
    const crearHoja = () => (hoja = {
        appendRow: fila => filas.push(fila), setFrozenRows() {}, getRange: (f, c) => rango(typeof f === 'number' ? f : 1, c || 1),
        getDataRange: () => ({ getValues: () => filas.map(f => [...f]) })
    });
    // Pestaña «resultados» del informe semanal
    const resultados = [];
    const hojaResultados = {
        clear: () => { resultados.length = 0; }, setFrozenRows() {},
        getRange: (f, c, nf) => ({
            setValues: v => { v.forEach((fila, i) => { resultados[f - 1 + i] = [...fila]; }); return { setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; } }; },
            setNumberFormat() { return this; }
        })
    };
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
        if (ruta === 'PAG/photo_stories') return [200, { success: true, post_id: `historia${++n}` }];
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
        SpreadsheetApp: { getActiveSpreadsheet: () => ({
            getSheetByName: n => (n === 'resultados' ? hojaResultados : hoja),
            insertSheet: n => (n === 'resultados' ? hojaResultados : crearHoja()),
            getUrl: () => 'https://docs.google.com/spreadsheets/d/PRUEBA'
        }) },
        UrlFetchApp: { fetch(url, o = {}) {
            const u = new URL(url);
            llamadas.push({ ruta: u.pathname.replace('/v27.0/', ''), metodo: o.method || 'get', datos: o.payload || Object.fromEntries(u.searchParams), cabeceras: o.headers || {} });
            const [codigo, cuerpo] = meta(url, o) || simulador(url, o);
            const texto = Buffer.isBuffer(cuerpo) ? '' : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
            return { getResponseCode: () => codigo, getContentText: () => texto, getBlob: () => ({ getBytes: () => [...cuerpo] }) };
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
            newTrigger: f => { const t = { f, timeBased: () => t, atHour: h => { t.h = h; return t; }, everyDays: () => t, onWeekDay: d => { t.dia = d; return t; }, inTimezone: z => { t.z = z; return t; }, create: () => activadores.push(t) }; return t; },
            WeekDay: { MONDAY: 'MONDAY' }
        }
    };
    vm.createContext(contexto);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'scripts', 'apps-script', 'Redes.gs'), 'utf8'), contexto);
    const post = datos => JSON.parse(contexto.doPost({ postData: { contents: JSON.stringify({ clave: CLAVE, ...datos }) } }).texto);
    const publicadas = () => llamadas.filter(l => l.metodo === 'post');
    return { gs: contexto, post, filas, resultados, llamadas, publicadas, correos, activadores, propiedades, fijarHora: d => { ahora = d; } };
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
        const fotosFb = s.llamadas.filter(l => l.ruta === 'PAG/photos' && !l.datos.url.includes('/historias/'));
        assert.deepEqual(fotosFb.map(l => [l.datos.url, l.datos.published]), contenido.fotos.map(u => [u, 'false']));
        const feed = s.llamadas.find(l => l.ruta === 'PAG/feed').datos;
        assert.equal(feed.message, contenido.facebook);
        assert.equal(Object.keys(feed).filter(k => k.startsWith('attached_media[')).length, contenido.fotos.length);
        const ig = s.llamadas.filter(l => l.ruta === 'IG/media' && l.datos.media_type !== 'STORIES').map(l => l.datos);
        assert.deepEqual(ig.slice(0, -1).map(d => [d.image_url, d.is_carousel_item]), contenido.fotos.map(u => [u, 'true']));
        assert.deepEqual([ig.at(-1).media_type, ig.at(-1).caption, ig.at(-1).children.split(',').length], ['CAROUSEL', contenido.instagram, contenido.fotos.length]);
        assert.ok(s.llamadas.every(l => l.ruta.includes('publicaciones.json') || l.datos.access_token === 'token-pagina'));
        // En la hoja: encabezado + una fila por red
        assert.deepEqual(s.filas.slice(1).map(f => [f[1], f[3], f[4], f[5]]), ['facebook', 'instagram', 'historia_facebook', 'historia_instagram'].map(red => [3002, 'fotos', red, 'publicado']));
        // Se guarda el id de Meta de cada publicación (lo usa el informe semanal)
        assert.ok(s.filas.slice(1).every(f => f[8]), 'falta el id de Meta');
        // Historias: la imagen 9:16 de la web, en Facebook (photo_stories) e Instagram (STORIES)
        assert.ok(contenido.historia && /\/redes\/historias\/3002-[0-9a-f]{8}\.jpg$/.test(contenido.historia), contenido.historia);
        const fotoHistoria = s.llamadas.filter(l => l.ruta === 'PAG/photos').at(-1).datos;
        assert.deepEqual([fotoHistoria.url, fotoHistoria.published], [contenido.historia, 'false']);
        assert.ok(s.llamadas.some(l => l.ruta === 'PAG/photo_stories'));
        assert.deepEqual(s.llamadas.filter(l => l.datos.media_type === 'STORIES').map(l => l.datos.image_url), [contenido.historia]);
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
        const ig = s.llamadas.filter(l => l.ruta === 'IG/media' && l.datos.media_type !== 'STORIES');
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
        assert.deepEqual(s.activadores.map(t => [t.f, t.h, t.z, t.dia]), [['publicarProgramadas', 11, 'America/Lima', undefined],
            ['publicarProgramadas', 19, 'America/Lima', undefined], ['informeSemanal', 8, 'America/Lima', 'MONDAY']]);
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
        assert.match(s.post({ accion: 'publicar', id: 999999 }).error, /no está en la cola de la web principal/);
        s.propiedades.set('APP_ID', ' 123\n'); s.propiedades.set('APP_SECRET', 'secreto'); s.propiedades.set('TOKEN_TEMPORAL', 'corto ');
        // APP_ID equivocado: se explica cuál copiar
        const mal = cargarGs({ props: Object.fromEntries(s.propiedades), meta: () => [400, { error: { code: 101, message: 'Invalid Client ID' } }] });
        assert.throws(() => mal.gs.guardarPermiso(), /no reconoce APP_ID o APP_SECRET.*Configuración de la app → Básica/);
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
        assert.equal(t.llamadas[0].datos.client_id, '123');
        assert.equal(t.llamadas[1].datos.access_token, 'largo');
    },
    'Apps Script: el informe semanal anota alcance e interacciones de cada publicación y avisa por correo'() {
        let sinPermiso = false;
        const s = cargarGs({ meta: (url, o) => {
            if (o.method) return undefined;
            const u = new URL(url);
            const ruta = u.pathname.replace('/v27.0/', '');
            const campos = u.searchParams.get('fields') || '';
            const metricas = u.searchParams.get('metric') || '';
            if (ruta.startsWith('media') && campos === 'like_count,comments_count') return [200, { like_count: 12, comments_count: 3 }];
            if (ruta.startsWith('media') && ruta.endsWith('/insights')) {
                if (sinPermiso) return [400, { error: { code: 10, message: 'Application does not have permission for this action' } }];
                return [200, { data: [{ name: 'reach', values: [{ value: 200 }] }, { name: 'views', total_value: { value: 350 } },
                    { name: 'saved', values: [{ value: 4 }] }, { name: 'shares', values: [{ value: 2 }] }] }];
            }
            if (campos.startsWith('reactions')) return [200, { reactions: { summary: { total_count: 7 } }, ...(/_/.test(ruta) ? { shares: { count: 2 } } : {}) }];
            if (campos.startsWith('comments')) {
                if (sinPermiso) return [400, { error: { code: 10, message: 'Requires pages_read_user_content permission' } }];
                return [200, { comments: { summary: { total_count: 1 } } }];
            }
            if (ruta.endsWith('/insights') && metricas.startsWith('post_')) return [200, { data: [
                { name: 'post_total_media_view_unique', values: [{ value: 150 }] }, { name: 'post_media_view', values: [{ value: 300 }] }] }];
            return undefined;
        } });
        s.post({ accion: 'publicar', id: 3002 });
        s.post({ accion: 'publicar', id: 3005, tipo: 'reel' });
        assert.equal(s.gs.informeSemanal(), 4, 'fotos y reel en Facebook e Instagram (las historias no: Meta las borra a las 24 h)');
        const [cabecera, ...filas] = s.resultados;
        assert.deepEqual(cabecera.slice(0, 6), ['Producto', 'Nombre', 'Tipo', 'Red', 'Publicado', 'Alcance']);
        const fila = (id, tipo, red) => filas.find(f => f[0] === id && f[2] === tipo && f[3] === red);
        const col = n => cabecera.indexOf(n);
        const ig = fila(3002, 'fotos', 'instagram');
        assert.deepEqual([ig[col('Alcance')], ig[col('Vistas')], ig[col('Me gusta')], ig[col('Comentarios')], ig[col('Guardados')], ig[col('Compartidos')], ig[col('Interacciones')]],
            [200, 350, 12, 3, 4, 2, 21]);
        const fb = fila(3002, 'fotos', 'facebook');
        assert.deepEqual([fb[col('Alcance')], fb[col('Vistas')], fb[col('Me gusta')], fb[col('Comentarios')], fb[col('Compartidos')], fb[col('Interacciones')]],
            [150, 300, 7, 1, 2, 10]);
        assert.equal(fila(3005, 'reel', 'facebook')[col('Me gusta')], 7);
        assert.ok(filas.every((f, i) => i === 0 || filas[i - 1][col('Interacciones')] >= f[col('Interacciones')]), 'ordenado de más a menos interacciones');
        assert.equal(s.correos.at(-1)[1], 'S3D: resultados de tus publicaciones');
        assert.match(s.correos.at(-1)[2], /Esta semana: 4 publicaciones/);
        assert.match(s.correos.at(-1)[2], /docs\.google\.com\/spreadsheets/);
        // Sin el permiso de estadísticas, el informe sale igual y lo explica
        sinPermiso = true;
        s.gs.informeSemanal();
        assert.match(s.resultados.find(f => f[2] === 'fotos' && f[3] === 'instagram')[col('Nota')], /^alcance y vistas: falta un permiso \(ejecuta revisarPermisos\)/);
        const notaFb = s.resultados.find(f => f[2] === 'fotos' && f[3] === 'facebook')[col('Nota')];
        assert.match(notaFb, /comentarios: falta un permiso.*pages_read_user_content/);
        assert.equal(s.resultados.find(f => f[2] === 'fotos' && f[3] === 'facebook')[col('Me gusta')], 7, 'un permiso que falta no borra los demás datos');
        assert.match(s.correos.at(-1)[2], /sin algunos datos/);
    },
    'Apps Script: «revisarPermisos» pregunta a Meta qué permisos tiene el token y lista los que faltan'() {
        const s = cargarGs({ props: { APP_ID: '123', APP_SECRET: 'secreto' }, meta: url => (url.includes('/debug_token?')
            ? [200, { data: { is_valid: true, scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management',
                'instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'] } }] : undefined) });
        assert.deepEqual([...s.gs.revisarPermisos()], ['pages_read_user_content', 'read_insights']);
        const consulta = s.llamadas.find(l => l.ruta === 'debug_token').datos;
        assert.deepEqual([consulta.input_token, consulta.access_token], ['token-pagina', '123|secreto']);
    },
    'Apps Script: una publicación anotada sin id de Meta se encuentra por su enlace'() {
        const s = cargarGs({ meta: (url, o) => {
            if (!o.method && url.includes('/IG/media?') && url.includes('fields=id%2Cpermalink')) {
                return [200, { data: [{ id: 'media77', permalink: 'https://www.instagram.com/p/ABC/' }] }];
            }
            if (!o.method && url.includes('/media77?')) return [200, { like_count: 5, comments_count: 0 }];
            return undefined;
        } });
        s.gs.instalar();
        s.filas.push([new Date(), 3001, 'Snoopy', 'fotos', 'instagram', 'publicado', 'https://www.instagram.com/p/ABC/', '', '']);
        s.gs.informeSemanal();
        const fila = s.resultados.find(f => f[0] === 3001);
        assert.equal(fila[7], 5);
    },
    'TikTok: «conectarTikTok» da el enlace y doGet guarda el permiso (comprobando el estado)'() {
        const s = cargarGs({ props: { TIKTOK_CLIENT_KEY: 'clave-tt', TIKTOK_CLIENT_SECRET: 'secreto-tt', URL_APP: 'https://script.google.com/macros/s/X/exec' },
            meta: (url, o) => (url.endsWith('oauth/token/') ? [200, { access_token: 'acceso1', expires_in: 7200, refresh_token: 'renovar1', refresh_expires_in: 15552000 }] : undefined) });
        const enlace = new URL(s.gs.conectarTikTok());
        assert.equal(enlace.origin + enlace.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
        assert.deepEqual(['client_key', 'response_type', 'scope', 'redirect_uri'].map(k => enlace.searchParams.get(k)),
            ['clave-tt', 'code', 'user.info.basic,video.upload', 'https://script.google.com/macros/s/X/exec']);
        assert.match(s.gs.doGet({ parameter: { code: 'abc', state: 'otro' } }).texto, /venció o no es válido/);
        assert.equal(s.llamadas.length, 0);
        assert.match(s.gs.doGet({ parameter: { code: 'abc', state: enlace.searchParams.get('state') } }).texto, /TikTok quedó conectado/);
        const canje = s.llamadas.find(l => l.ruta.endsWith('oauth/token/')).datos;
        assert.deepEqual([canje.grant_type, canje.code, canje.client_secret, canje.redirect_uri], ['authorization_code', 'abc', 'secreto-tt', 'https://script.google.com/macros/s/X/exec']);
        assert.deepEqual(['TIKTOK_ACCESS', 'TIKTOK_REFRESH'].map(k => s.propiedades.get(k)), ['acceso1', 'renovar1']);
        assert.match(s.gs.doGet({ parameter: { error: 'access_denied' } }).texto, /no autorizó/);
        assert.match(s.gs.doGet().texto, /activo/);
    },
    'TikTok: las fotos van a la bandeja (MEDIA_UPLOAD), el permiso se renueva solo y no se envía dos veces'() {
        const contenido = JSON.parse(PUBLICACIONES).productos['3002'];
        let estados = ['PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX'];
        const s = cargarGs({ props: { TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's', TIKTOK_ACCESS: 'viejo', TIKTOK_VENCE: '0', TIKTOK_REFRESH: 'renovar1' },
            meta: (url, o) => {
                if (url.endsWith('oauth/token/')) return [200, { access_token: 'nuevo', expires_in: 7200, refresh_token: 'renovar2' }];
                if (url.endsWith('post/publish/content/init/')) return [200, { data: { publish_id: 'p_1' }, error: { code: 'ok' } }];
                if (url.endsWith('post/publish/status/fetch/')) return [200, { data: { status: estados.shift() || 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } }];
                return undefined;
            } });
        const r = s.post({ accion: 'tiktok', id: 3002, tipo: 'fotos' });
        assert.ok(r.ok, r.error);
        assert.equal(r.estado['3002:fotos'].tiktok.estado, 'enviado');
        // Se renovó el permiso y se guardó el NUEVO de renovación (TikTok invalida el anterior)
        assert.equal(s.llamadas.find(l => l.ruta.endsWith('oauth/token/')).datos.refresh_token, 'renovar1');
        assert.deepEqual(['TIKTOK_ACCESS', 'TIKTOK_REFRESH'].map(k => s.propiedades.get(k)), ['nuevo', 'renovar2']);
        const init = JSON.parse(s.llamadas.find(l => l.ruta.endsWith('content/init/')).datos);
        assert.deepEqual([init.post_mode, init.media_type, init.source_info.source, init.source_info.photo_images, init.post_info.title, init.post_info.description],
            ['MEDIA_UPLOAD', 'PHOTO', 'PULL_FROM_URL', contenido.fotos, contenido.tiktokTitulo, contenido.tiktok]);
        assert.ok(init.post_info.title.length <= 90 && !/https?:/.test(init.post_info.description));
        assert.deepEqual([...s.filas.at(-1).slice(1, 6), s.filas.at(-1)[8]], [3002, contenido.nombre, 'fotos', 'tiktok', 'enviado', 'p_1']);
        // Enviar a TikTok no publica en Facebook/Instagram ni cancela lo aprobado
        assert.ok(!s.llamadas.some(l => l.ruta.startsWith('PAG') || l.ruta.startsWith('IG')));
        s.post({ accion: 'aprobar', id: 3001 });
        s.post({ accion: 'tiktok', id: 3001, tipo: 'fotos' });
        assert.ok(s.post({ accion: 'estado' }).estado['3001:fotos'].programado, 'sigue aprobado para Facebook e Instagram');
        // Segundo toque: no se vuelve a enviar
        const envios = s.llamadas.filter(l => l.ruta.endsWith('content/init/')).length;
        s.post({ accion: 'tiktok', id: 3002, tipo: 'fotos' });
        assert.equal(s.llamadas.filter(l => l.ruta.endsWith('content/init/')).length, envios);
    },
    'TikTok: el video se sube en un solo trozo (FILE_UPLOAD) y los errores se explican'() {
        const contenido = JSON.parse(PUBLICACIONES).productos['3005'];
        const video = Buffer.alloc(1234, 1);
        let error = null;
        const s = cargarGs({ props: { TIKTOK_ACCESS: 'acceso', TIKTOK_VENCE: String(Date.now() + 3600e3) },
            meta: (url, o) => {
                if (url === contenido.video) return [200, video];
                if (url.endsWith('inbox/video/init/')) return error ? [400, { error: { code: error, message: 'x' } }] : [200, { data: { publish_id: 'v_1', upload_url: 'https://open-upload.tiktokapis.com/subir' }, error: { code: 'ok' } }];
                if (url === 'https://open-upload.tiktokapis.com/subir') return [201, ''];
                if (url.endsWith('post/publish/status/fetch/')) return [200, { data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } }];
                return undefined;
            } });
        const r = s.post({ accion: 'tiktok', id: 3005, tipo: 'reel' });
        assert.equal(r.resultado.tiktok.estado, 'enviado', JSON.stringify(r));
        const init = JSON.parse(s.llamadas.find(l => l.ruta.endsWith('inbox/video/init/')).datos);
        assert.deepEqual(init.source_info, { source: 'FILE_UPLOAD', video_size: 1234, chunk_size: 1234, total_chunk_count: 1 });
        const subida = s.llamadas.find(l => l.ruta === '/subir');
        assert.deepEqual([subida.metodo, subida.cabeceras['Content-Range']], ['put', 'bytes 0-1233/1234']);
        error = 'spam_risk_too_many_pending_share';
        const r2 = cargarGs({ props: { TIKTOK_ACCESS: 'acceso', TIKTOK_VENCE: String(Date.now() + 3600e3) }, meta: (url) => {
            if (url.endsWith('content/init/')) return [400, { error: { code: 'url_ownership_unverified', message: 'x' } }];
            return undefined;
        } }).post({ accion: 'tiktok', id: 3001, tipo: 'fotos' });
        assert.match(r2.resultado.tiktok.detalle, /no verificó que la web es tuya/);
        const sinConexion = cargarGs().post({ accion: 'tiktok', id: 3001, tipo: 'fotos' });
        assert.match(sinConexion.resultado.tiktok.detalle, /TikTok no está conectado: ejecuta conectarTikTok/);
    },
    async 'página: con la clave, «Publicar ahora» (doble toque), «Aprobar» y los errores se muestran sin HTML'({ browser }) {
        const API = 'https://script.google.com/macros/s/PRUEBA/exec';
        const pedidos = [];
        const estado = {};
        const p = await abrir(browser, 'redes/', {
            preparar: async pagina => {
                await pagina.route(/\/redes\/$/, async ruta => {
                    const html = (await (await ruta.fetch()).text()).replace(/data-api="[^"]*"/, `data-api="${API}"`);   // nunca la URL real
                    await ruta.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
                });
                await pagina.route(API, async ruta => {
                    const d = JSON.parse(ruta.request().postData());
                    pedidos.push(d);
                    if (d.clave !== CLAVE) return ruta.fulfill({ json: { ok: false, error: 'clave incorrecta' } });
                    const k = `${d.id}:${d.tipo}`;
                    const historias = { historia_facebook: { estado: 'publicado', fecha: '2026-11-18T16:00:00Z', enlace: 'https://www.facebook.com/PAG' },
                        historia_instagram: { estado: 'publicado', fecha: '2026-11-18T16:00:00Z', enlace: 'https://www.instagram.com/' } };
                    if (d.accion === 'publicar') estado[k] = {
                        ...(d.tipo === 'fotos' ? historias : {}),
                        facebook: { estado: 'publicado', fecha: '2026-11-18T16:00:00Z', enlace: 'https://www.facebook.com/PAG_1' },
                        instagram: d.id === 3002 ? { estado: 'error', detalle: '<img src=x id=inyectado>' } : { estado: 'publicado', fecha: '2026-11-18T16:01:00Z', enlace: 'https://www.instagram.com/p/x/' }
                    };
                    if (d.accion === 'aprobar') estado[k] = { programado: '2026-11-18T15:00:00Z', salida: '2026-11-19T00:00:00Z' };
                    if (d.accion === 'tiktok') estado[k] = { ...estado[k], tiktok: { estado: 'enviado', fecha: '2026-11-18T16:05:00Z', enlace: 'https://www.tiktok.com/' } };
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
        const primero = p.locator('#p-3001 .rd-auto[data-tipo="fotos"]:not(.rd-tiktok)');
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
        const segundo = p.locator('#p-3002 .rd-auto[data-tipo="fotos"]:not(.rd-tiktok)');
        await segundo.locator('[data-accion="publicar"]').dblclick();
        await segundo.locator('li.rd-mal').waitFor();
        assert.match(await segundo.locator('li.rd-mal').textContent(), /Instagram: falló \(<img src=x id=inyectado>\)/);
        assert.equal(await p.locator('#inyectado').count(), 0);
        assert.ok(await segundo.locator('[data-accion="publicar"]').isVisible());
        // Aprobar y quitar de la programación
        const reel = p.locator('#p-3005 .rd-auto[data-tipo="reel"]:not(.rd-tiktok)');
        await reel.locator('[data-accion="aprobar"]').click();
        await reel.locator('li.rd-espera').waitFor();
        assert.match(await reel.locator('li.rd-espera').textContent(), /Aprobado: saldrá solo el/);
        assert.ok(await reel.locator('[data-accion="cancelar"]').isVisible());
        await reel.locator('[data-accion="cancelar"]').click();
        await reel.locator('[data-accion="aprobar"]').waitFor();
        assert.equal(await reel.locator('li.rd-espera').count(), 0);
        assert.ok(await reel.locator('[data-accion="cancelar"]').isHidden());
        // TikTok: doble toque, va a la bandeja y sugiere el sonido
        const tiktok = p.locator('#p-3001 .rd-tiktok[data-tipo="fotos"]');
        assert.match(await tiktok.textContent(), /Sonido sugerido: navideño/);
        await tiktok.locator('[data-accion="tiktok"]').click();
        assert.equal(await tiktok.locator('[data-accion="tiktok"]').textContent(), 'Toca otra vez para enviar');
        await tiktok.locator('[data-accion="tiktok"]').click();
        await tiktok.locator('li.rd-bien').waitFor();
        assert.match(await tiktok.locator('li.rd-bien').textContent(), /TikTok: enviado a tu bandeja/);
        assert.ok(await tiktok.locator('[data-accion="tiktok"]').isHidden());
        assert.deepEqual(pedidos.filter(d => d.accion === 'tiktok').map(d => [d.id, d.tipo]), [[3001, 'fotos']]);
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
