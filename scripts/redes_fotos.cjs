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
 * Uso:  node scripts/redes_fotos.cjs                 genera las que faltan (python3 scripts/redes.py faltantes)
 *       node scripts/redes_fotos.cjs nombre1 nombre2  (re)genera esas fotos
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const FUENTES = path.join(RAIZ, 'fuentes');
const SALIDA = path.join(RAIZ, 'redes', 'fotos');
const ANCHO = 1080;
const ALTO = 1350;
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

(async () => {
    const nombres = process.argv.slice(2).length ? process.argv.slice(2)
        : execFileSync('python3', [path.join(RAIZ, 'scripts', 'redes.py'), 'faltantes'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (!nombres.length) return console.log('No falta ninguna foto para redes.');
    let fallos = 0;
    for (const nombre of nombres) {
        try { await generar(nombre); } catch (error) { fallos++; console.error(`  ✗ ${nombre}: ${error.message}`); }
    }
    process.exit(fallos ? 1 : 0);
})();
