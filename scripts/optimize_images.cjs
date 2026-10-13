#!/usr/bin/env node
/**
 * Genera los tres niveles de calidad de cada imagen de assets/ sin perder nunca el original:
 *
 *   assets/hd/<n>.webp|avif   original en alta resolución (solo si supera STD px); se sirve al ampliar
 *   assets/<n>.webp|avif      versión estándar (lado largo máx. STD px); galería y páginas de producto
 *   assets/sm/<n>.webp|avif   miniatura (lado largo máx. SM px); tarjetas del catálogo y miniaturas
 *   assets/hd/index.json      nombres con versión HD y sus dimensiones
 *
 * Para añadir fotos nuevas: copia los .webp/.avif originales a assets/ y ejecuta el script. Si miden
 * más de STD px, el original se MUEVE a assets/hd/ y la versión estándar se genera desde él.
 *
 * Uso:  npm i sharp && node scripts/optimize_images.cjs [--rebuild-std]
 *   --rebuild-std  vuelve a generar estándar y miniaturas desde los originales de assets/hd/
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSETS = path.resolve(__dirname, '..', 'assets');
const HD = path.join(ASSETS, 'hd');
const SM_DIR = path.join(ASSETS, 'sm');
const STD = 1600;
const SM = 800;
const REBUILD = process.argv.includes('--rebuild-std');
const EXTS = ['webp', 'avif'];

const codificar = (imagen, ext, calidad) => (ext === 'webp'
    ? imagen.webp({ quality: calidad.webp, effort: 6 })
    : imagen.avif({ quality: calidad.avif, effort: 5 })).toBuffer();

async function reducir(origen, ladoMax, calidad, ext) {
    const base = sharp(origen).rotate().resize({ width: ladoMax, height: ladoMax, fit: 'inside', withoutEnlargement: true });
    return codificar(base, ext, calidad);
}

(async () => {
    fs.mkdirSync(HD, { recursive: true });
    fs.mkdirSync(SM_DIR, { recursive: true });
    const nombres = [...new Set(fs.readdirSync(ASSETS)
        .filter(f => /\.(webp|avif)$/i.test(f))
        .map(f => f.replace(/\.(webp|avif)$/i, '')))].sort();

    const hdIndex = {};
    const resumen = { estandar: 0, miniaturas: 0, movidos: 0 };

    for (const nombre of nombres) {
        for (const ext of EXTS) {
            const principal = path.join(ASSETS, `${nombre}.${ext}`);
            const original = path.join(HD, `${nombre}.${ext}`);
            if (!fs.existsSync(principal) && !fs.existsSync(original)) continue;

            // Si la imagen supera STD y aún no hay original guardado, se conserva en hd/ antes de reducirla.
            if (fs.existsSync(principal) && !fs.existsSync(original)) {
                const { width, height } = await sharp(principal).metadata();
                if (Math.max(width, height) > STD) { fs.renameSync(principal, original); resumen.movidos++; }
            }

            const hayHd = fs.existsSync(original);
            if (hayHd && (REBUILD || !fs.existsSync(principal))) {
                fs.writeFileSync(principal, await reducir(original, STD, { webp: 90, avif: 68 }, ext));
                resumen.estandar++;
            }

            const destinoSm = path.join(SM_DIR, `${nombre}.${ext}`);
            if (REBUILD || !fs.existsSync(destinoSm)) {
                const { width, height } = await sharp(principal).metadata();
                if (Math.max(width, height) > SM) fs.writeFileSync(destinoSm, await reducir(principal, SM, { webp: 84, avif: 58 }, ext));
                else fs.copyFileSync(principal, destinoSm);
                resumen.miniaturas++;
            }

            if (hayHd && ext === 'webp') {
                const { width, height } = await sharp(original).metadata();
                hdIndex[nombre] = { w: width, h: height };
            }
        }
    }
    fs.writeFileSync(path.join(HD, 'index.json'), JSON.stringify(hdIndex, null, 1) + '\n');
    console.log(`${nombres.length} imágenes. Originales movidos: ${resumen.movidos}; estándar generadas: ${resumen.estandar}; miniaturas: ${resumen.miniaturas}; con HD: ${Object.keys(hdIndex).length}`);
})();
