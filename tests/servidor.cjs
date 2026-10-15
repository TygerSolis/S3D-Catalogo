// Servidor estático para las pruebas: comprime como GitHub Pages y sirve 404.html en las rutas inexistentes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml' };

function iniciar(puerto) {
    return new Promise(resolver => {
        const servidor = http.createServer((req, res) => {
            let ruta = decodeURIComponent(req.url.split('?')[0]);
            if (ruta.endsWith('/')) ruta += 'index.html';
            const archivo = path.join(RAIZ, ruta);
            if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
            fs.readFile(archivo, (error, datos) => {
                if (error) {
                    return fs.readFile(path.join(RAIZ, '404.html'), (error404, pagina) => {
                        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(error404 ? 'No encontrado' : pagina);
                    });
                }
                const extension = path.extname(archivo);
                const cabeceras = { 'Content-Type': TIPOS[extension] || 'application/octet-stream', 'Cache-Control': 'max-age=600' };
                if (/\.(html|js|css|json|xml|txt)$/.test(extension) && /gzip/.test(req.headers['accept-encoding'] || '')) {
                    cabeceras['Content-Encoding'] = 'gzip';
                    datos = zlib.gzipSync(datos);
                }
                res.writeHead(200, cabeceras);
                res.end(datos);
            });
        });
        servidor.listen(puerto, () => resolver(servidor));
    });
}

module.exports = { iniciar, RAIZ };
