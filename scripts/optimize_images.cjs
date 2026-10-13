#!/usr/bin/env node
/**
 * Reduce las imágenes de assets/ cuyo lado largo supere MAX px (por defecto 1600)
 * y las recodifica (WebP q80 / AVIF q50) conservando el nombre del archivo.
 * Las imágenes más pequeñas no se tocan. Uso:
 *   npm i sharp && node scripts/optimize_images.cjs [carpeta] [max]
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'assets'));
const MAX = Number(process.argv[3]) || 1600;

(async () => {
  let ahorrados = 0, tocados = 0;
  for (const f of fs.readdirSync(dir).filter(f => /\.(webp|avif)$/i.test(f)).sort()) {
    const p = path.join(dir, f);
    const original = fs.readFileSync(p);
    const { width, height } = await sharp(original).metadata();
    if (Math.max(width, height) <= MAX) continue;
    const base = sharp(original).rotate().resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true });
    const salida = /\.webp$/i.test(f)
      ? await base.webp({ quality: 80, effort: 5 }).toBuffer()
      : await base.avif({ quality: 50, effort: 4 }).toBuffer();
    if (salida.length >= original.length) continue;
    fs.writeFileSync(p, salida);
    ahorrados += original.length - salida.length;
    tocados++;
  }
  console.log(`${tocados} imágenes optimizadas, ${(ahorrados / 1048576).toFixed(1)} MB ahorrados`);
})();
