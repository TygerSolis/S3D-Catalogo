// Utilidades compartidas por las pruebas.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const PUERTO = 8765;
const BASE = `http://localhost:${PUERTO}/`;
const RAIZ = path.resolve(__dirname, '..');
const FECHA_FIJA = new Date('2026-10-14T12:00:00');   // fija el reloj: las "novedades" dependen de la fecha

const leerJson = ruta => JSON.parse(fs.readFileSync(path.join(RAIZ, ruta), 'utf8'));

/**
 * Abre una página con Umami simulado (los eventos quedan en página.eventos) y el reloj fijo.
 * opciones: { vp, touch, sinReloj, preparar(pagina) }
 */
async function abrir(browser, ruta = '', opciones = {}) {
    const contexto = await browser.newContext({
        viewport: opciones.vp || { width: 1366, height: 900 },
        hasTouch: !!opciones.touch,
        permissions: ['clipboard-read', 'clipboard-write']
    });
    const pagina = await contexto.newPage();
    pagina.eventos = [];
    pagina.errores = [];
    pagina.on('pageerror', error => pagina.errores.push(error.message));
    await pagina.exposeFunction('__log', (nombre, datos) => pagina.eventos.push({ nombre, datos }));
    await pagina.route('https://cloud.umami.is/**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.umami={track:(n,d)=>window.__log(n,d||null)};' }));
    // Sin Web Share API: así "Compartir" usa siempre el portapapeles en las pruebas.
    await pagina.addInitScript(() => { try { Object.defineProperty(navigator, 'share', { value: undefined }); } catch (e) { /* ya definida */ } });
    if (!opciones.sinReloj) await pagina.clock.setFixedTime(FECHA_FIJA);
    if (opciones.preparar) await opciones.preparar(pagina);   // p. ej. interceptar productos.json
    await pagina.goto(BASE + ruta, { waitUntil: 'networkidle' });
    pagina.contexto = contexto;
    return pagina;
}

const nombresEventos = pagina => pagina.eventos.map(e => e.nombre);
const ruta = pagina => pagina.url().replace(BASE.slice(0, -1), '');
const escala = pagina => pagina.evaluate(() => {
    const m = getComputedStyle(document.getElementById('lightbox-img')).transform;
    return m === 'none' ? 1 : Math.round(Number(m.match(/matrix\(([^,]+)/)[1]) * 100) / 100;
});

module.exports = { assert, BASE, PUERTO, RAIZ, leerJson, abrir, nombresEventos, ruta, escala };
