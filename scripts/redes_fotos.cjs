#!/usr/bin/env node
/**
 * Fotos limpias para redes: redes/fotos/<nombre>.jpg, vertical 4:5 (1080×1350), la foto COMPLETA (sin recortar)
 * sobre un fondo hecho con la misma foto desenfocada (decisión del dueño, 18/11/2026). JPG porque es lo que aceptan
 * Instagram, Facebook y Marketplace.
 *
 * Parte siempre del ORIGINAL (fuentes/<nombre>.jpg|png|…), nunca de un webp/avif ya comprimido. Si el original no
 * está en fuentes/, lo descarga de Cloudflare R2 (fuentes/ del bucket) con las variables R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET (p. ej. `set -a; . ~/.config/s3d/r2.env; set +a`).
 *
 * Con --catalogo hace lo mismo en cuadrado (1080×1080) en meta/fotos/, para el catálogo de Meta / WhatsApp
 * (scripts/catalogo_meta.py).
 *
 * Con --historias genera las historias (redes/historias/<id>-<huella>.jpg, 1080×1920): la primera foto sobre su fondo
 * desenfocado y abajo el nombre, el precio y «Pídelo por WhatsApp …» (la API de Instagram no permite el sticker de
 * enlace). Los textos los da `python3 scripts/redes.py faltantes-historias`. Fuente: DejaVu Sans (instalada en
 * Ubuntu y en los servidores de GitHub).
 *
 * Uso:  node scripts/redes_fotos.cjs [--catalogo | --historias]   genera las que faltan
 *       node scripts/redes_fotos.cjs [--catalogo] nombre1 nombre2  (re)genera esas fotos
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const FUENTES = path.join(RAIZ, 'fuentes');
const CATALOGO = process.argv.includes('--catalogo');
const HISTORIAS = process.argv.includes('--historias');
const SALIDA = path.join(RAIZ, ...(CATALOGO ? ['meta', 'fotos'] : ['redes', 'fotos']));
const LISTA = path.join(RAIZ, 'scripts', CATALOGO ? 'catalogo_meta.py' : 'redes.py');
const ANCHO = 1080;
const ALTO = CATALOGO ? 1080 : 1350;
const EXTENSIONES = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG', 'WEBP'];

function original(nombre) {
    for (const ext of EXTENSIONES) {
        const ruta = path.join(FUENTES, `${nombre}.${ext}`);
        if (fs.existsSync(ruta)) return ruta;
    }
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
    fs.mkdirSync(FUENTES, { recursive: true });
    for (const ext of EXTENSIONES) {
        const ruta = path.join(FUENTES, `${nombre}.${ext}`);
        const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/fuentes/${encodeURIComponent(nombre)}.${ext}`;
        try {
            // Las credenciales van por argumento a curl (no se imprimen); igual que en catalogo-desde-hoja.yml.
            execFileSync('curl', ['-fsS', '--aws-sigv4', 'aws:amz:auto:s3', '--user', `${R2_ACCESS_KEY_ID}:${R2_SECRET_ACCESS_KEY}`, '-o', ruta, url], { stdio: 'ignore' });
            return ruta;
        } catch {
            fs.rmSync(ruta, { force: true });
        }
    }
    return null;
}

// Fondo: la misma foto ampliada hasta cubrir el cuadro 4:5, muy desenfocada y algo oscurecida, para que el
// producto (encima, completo y nítido) resalte y el relleno no parezca un marco.
const fondoDesenfocado = ruta => sharp(ruta).rotate()
    .resize(ANCHO, ALTO, { fit: 'cover' })
    .blur(40)
    .modulate({ brightness: 0.8, saturation: 0.9 })
    .removeAlpha()
    .toBuffer();

async function generar(nombre) {
    const ruta = original(nombre);
    if (!ruta) throw new Error(`no está el original de «${nombre}» en fuentes/ ni en R2 (¿cargaste las variables R2_*?)`);
    fs.mkdirSync(SALIDA, { recursive: true });
    const destino = path.join(SALIDA, `${nombre}.jpg`);
    const foto = await sharp(ruta).rotate().resize(ANCHO, ALTO, { fit: 'inside' }).flatten({ background: '#ffffff' }).toBuffer();
    await sharp(await fondoDesenfocado(ruta))
        .composite([{ input: foto, gravity: 'centre' }])
        .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toFile(destino);
    console.log(`  ✓ ${path.relative(RAIZ, destino)} (${Math.round(fs.statSync(destino).size / 1024)} KB)`);
}

// ---------------------------------------------------------------- historias (9:16)

const marcado = texto => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const texto = (contenido, puntos, color = '#ffffff', negrita = true, ancho = 940) => sharp({
    text: {
        text: `<span foreground="${color}">${marcado(contenido)}</span>`,
        font: `DejaVu Sans${negrita ? ' Bold' : ''} ${puntos}`,
        width: ancho, align: 'centre', rgba: true, dpi: 72, wrap: 'word'
    }
}).png().toBuffer();

async function generarHistoria(h) {
    const ruta = original(h.foto);
    if (!ruta) throw new Error(`no está el original de «${h.foto}» en fuentes/ ni en R2`);
    const W = 1080;
    const H = 1920;
    const fondo = await sharp(ruta).rotate().resize(W, H, { fit: 'cover' }).blur(40)
        .modulate({ brightness: 0.55, saturation: 0.9 }).removeAlpha().toBuffer();
    // La foto arriba (deja libres los ~180 px superiores, donde Instagram pone el nombre de la cuenta).
    const foto = await sharp(ruta).rotate().resize(960, 1180, { fit: 'inside' }).flatten({ background: '#ffffff' }).toBuffer();
    const mf = await sharp(foto).metadata();
    const capas = [{ input: foto, left: Math.round((W - mf.width) / 2), top: 200 + Math.round((1180 - mf.height) / 2) }];
    // Textos abajo, por encima de la barra de respuesta de Instagram (~200 px inferiores).
    let y = 1440;
    for (const [contenido, puntos] of [[h.titulo, 66], [h.precio, 60]]) {
        const capa = await texto(contenido, puntos);
        const m = await sharp(capa).metadata();
        capas.push({ input: capa, left: Math.round((W - m.width) / 2), top: y });
        y += m.height + 22;
    }
    const wa = await texto(h.whatsapp, 40, '#ffffff', true, 1000);
    const mw = await sharp(wa).metadata();
    const pastilla = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${mw.width + 72}" height="${mw.height + 40}">
        <rect width="100%" height="100%" rx="${(mw.height + 40) / 2}" fill="#1faa53"/></svg>`);
    const yw = Math.max(y + 18, 1600);
    capas.push({ input: pastilla, left: Math.round((W - mw.width - 72) / 2), top: yw });
    capas.push({ input: wa, left: Math.round((W - mw.width) / 2), top: yw + 20 });
    const salida = path.join(RAIZ, 'redes', 'historias');
    fs.mkdirSync(salida, { recursive: true });
    const destino = path.join(salida, `${h.archivo}.jpg`);
    await sharp(fondo).composite(capas).jpeg({ quality: 84, mozjpeg: true }).toFile(destino);
    console.log(`  ✓ ${path.relative(RAIZ, destino)} (${Math.round(fs.statSync(destino).size / 1024)} KB)`);
}

(async () => {
    if (HISTORIAS) {
        const lista = execFileSync('python3', [path.join(RAIZ, 'scripts', 'redes.py'), 'faltantes-historias'], { encoding: 'utf8' })
            .split('\n').filter(Boolean).map(l => JSON.parse(l));
        if (!lista.length) return console.log('No falta ninguna historia.');
        let fallos = 0;
        for (const h of lista) {
            try { await generarHistoria(h); } catch (error) { fallos++; console.error(`  ✗ ${h.archivo}: ${error.message}`); }
        }
        process.exit(fallos ? 1 : 0);
    }
    const argumentos = process.argv.slice(2).filter(a => a !== '--catalogo');
    const nombres = argumentos.length ? argumentos
        : execFileSync('python3', [LISTA, 'faltantes'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (!nombres.length) return console.log('No falta ninguna foto para redes.');
    let fallos = 0;
    for (const nombre of nombres) {
        try { await generar(nombre); } catch (error) { fallos++; console.error(`  ✗ ${nombre}: ${error.message}`); }
    }
    process.exit(fallos ? 1 : 0);
})();
