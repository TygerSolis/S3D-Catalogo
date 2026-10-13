#!/usr/bin/env node
/**
 * Genera los tres niveles de calidad de cada imagen a partir de sus ORIGINALES (PNG/JPEG/WebP/AVIF):
 *
 *   assets/hd/<n>.webp|avif   resolución original (solo si supera STD px); se sirve al ampliar
 *   assets/<n>.webp|avif      versión estándar (lado largo máx. STD px); galería y páginas de producto
 *   assets/md/<n>.webp|avif   nivel intermedio (lado largo máx. MD px); foto principal de la ficha en móvil
 *   assets/sm/<n>.webp|avif   miniatura (lado largo máx. SM px); tarjetas del catálogo y miniaturas
 *   assets/hd/index.json      nombres con versión HD y sus dimensiones
 *
 * Los originales NO se publican: guárdalos en una carpeta aparte (por defecto "fuentes/", ignorada por
 * Git) con el nombre que tendrá la imagen, p. ej. fuentes/ts-woody-1.png. Siempre se parte del original,
 * nunca de una copia ya comprimida, para no perder nitidez en cada pasada.
 *
 * Calidad: AVIF q90 y WebP q90 con color completo en HD/estándar; AVIF q82 y WebP q88 en miniaturas
 * (AVIF es lo que sirve la gran mayoría de navegadores; WebP queda de respaldo).
 *
 * Uso:  npm i sharp && node scripts/optimize_images.cjs [--fuentes carpeta] [--solo nombre1,nombre2]
 *        --niveles md,sm   genera solo esos niveles (hd, std, md, sm); por defecto todos
 *        --parte i/N   procesa solo la parte i de N (para repartir el trabajo entre varios procesos)
 *        --sin-indice  no recalcula assets/hd/index.json (hazlo después con --solo ninguno)
 *   sin --fuentes se usa "fuentes/"; las imágenes de assets/ sin original en esa carpeta no se tocan.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const ASSETS = path.join(RAIZ, 'assets');
const HD = path.join(ASSETS, 'hd');
const SM_DIR = path.join(ASSETS, 'sm');
const MD_DIR = path.join(ASSETS, 'md');
const STD = 1600;
const SM = 800;
const MD = 1000;

const argumento = nombre => { const i = process.argv.indexOf(nombre); return i > -1 ? process.argv[i + 1] : null; };
const FUENTES = path.resolve(argumento('--fuentes') || path.join(RAIZ, 'fuentes'));
const SOLO = argumento('--solo') ? new Set(argumento('--solo').split(',')) : null;
const PARTE = argumento('--parte') ? argumento('--parte').split('/').map(Number) : null;
const SIN_INDICE = process.argv.includes('--sin-indice');
const NIVELES = new Set((argumento('--niveles') || 'hd,std,md,sm').split(','));

const CALIDAD = {
    grande: { avif: 90, webp: 90 },
    medio: { avif: 84, webp: 88 },
    mini: { avif: 82, webp: 88 }
};

const codificar = (imagen, ext, calidad) => (ext === 'webp'
    ? imagen.webp({ quality: calidad.webp, effort: 6, smartSubsample: true })
    : imagen.avif({ quality: calidad.avif, effort: 4, chromaSubsampling: '4:4:4' })).toBuffer();

async function generar(origen, ladoMax, calidad, ext) {
    let imagen = sharp(origen).rotate();
    if (ladoMax) imagen = imagen.resize({ width: ladoMax, height: ladoMax, fit: 'inside', withoutEnlargement: true });
    return codificar(imagen, ext, calidad);
}

(async () => {
    if (!fs.existsSync(FUENTES)) { console.error(`No existe la carpeta de originales: ${FUENTES}`); process.exit(1); }
    fs.mkdirSync(HD, { recursive: true });
    fs.mkdirSync(SM_DIR, { recursive: true });
    fs.mkdirSync(MD_DIR, { recursive: true });

    // Si hay varios archivos con el mismo nombre base (p. ej. .png y .jpg) se usa el de más píxeles.
    const fuentes = new Map();
    for (const f of fs.readdirSync(FUENTES).filter(f => /\.(png|jpe?g|webp|avif)$/i.test(f))) {
        const nombre = f.replace(/\.(png|jpe?g|webp|avif)$/i, '');
        const { width, height } = await sharp(path.join(FUENTES, f)).metadata();
        const px = width * height;
        if (!fuentes.has(nombre) || px > fuentes.get(nombre).px) fuentes.set(nombre, { archivo: path.join(FUENTES, f), width, height, px });
    }

    let hechas = 0;
    const lista = [...fuentes].sort();
    for (const [posicion, [nombre, f]] of lista.entries()) {
        if (SOLO && !SOLO.has(nombre)) continue;
        if (PARTE && posicion % PARTE[1] !== PARTE[0] - 1) continue;
        const grande = Math.max(f.width, f.height) > STD;
        for (const ext of ['webp', 'avif']) {
            if (NIVELES.has('hd')) {
                if (grande) fs.writeFileSync(path.join(HD, `${nombre}.${ext}`), await generar(f.archivo, null, CALIDAD.grande, ext));
                else fs.rmSync(path.join(HD, `${nombre}.${ext}`), { force: true });
            }
            if (NIVELES.has('std')) fs.writeFileSync(path.join(ASSETS, `${nombre}.${ext}`), await generar(f.archivo, STD, CALIDAD.grande, ext));
            if (NIVELES.has('md')) fs.writeFileSync(path.join(MD_DIR, `${nombre}.${ext}`), await generar(f.archivo, MD, CALIDAD.medio, ext));
            if (NIVELES.has('sm')) fs.writeFileSync(path.join(SM_DIR, `${nombre}.${ext}`), await generar(f.archivo, SM, CALIDAD.mini, ext));
        }
        hechas++;
        console.log(`[${hechas}/${fuentes.size}] ${nombre} ${f.width}x${f.height}${grande ? ' (con HD)' : ''}`);
    }

    if (SIN_INDICE) { console.log(`Parte lista: ${hechas} imágenes.`); return; }
    // Índice de originales HD (se recalcula con lo que haya en assets/hd/)
    const indice = {};
    for (const f of fs.readdirSync(HD).filter(f => f.endsWith('.webp')).sort()) {
        const { width, height } = await sharp(path.join(HD, f)).metadata();
        indice[f.replace(/\.webp$/, '')] = { w: width, h: height };
    }
    fs.writeFileSync(path.join(HD, 'index.json'), JSON.stringify(indice, null, 1) + '\n');
    console.log(`Listo: ${hechas} imágenes procesadas; ${Object.keys(indice).length} con versión HD.`);

    const sinFuente = [...new Set(fs.readdirSync(ASSETS).filter(f => /\.webp$/.test(f)).map(f => f.replace(/\.webp$/, '')))].filter(n => !fuentes.has(n));
    if (sinFuente.length) console.log(`Sin original en ${path.basename(FUENTES)}/ (no se tocaron): ${sinFuente.join(', ')}`);
})();
