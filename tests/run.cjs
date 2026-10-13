// Ejecuta todas las pruebas: node tests/run.cjs [módulo]
const { chromium } = require('playwright');
const servidor = require('./servidor.cjs');
const { PUERTO } = require('./util.cjs');

const MODULOS = ['integridad', 'catalogo', 'visor', 'fichas', 'tienda', 'buscador', 'analitica', 'navegacion'];

(async () => {
    const filtro = process.argv[2];
    const http = await servidor.iniciar(PUERTO);
    const browser = await chromium.launch();
    let total = 0;
    let fallos = 0;
    for (const nombre of MODULOS) {
        if (filtro && nombre !== filtro) continue;
        const pruebas = require(`./${nombre}.cjs`);
        for (const [titulo, funcion] of Object.entries(pruebas)) {
            total++;
            try {
                await funcion({ browser });
                console.log(`  ✓ ${nombre}: ${titulo}`);
            } catch (error) {
                fallos++;
                console.log(`  ✗ ${nombre}: ${titulo}\n      ${String(error.message).split('\n').slice(0, 5).join('\n      ')}`);
            }
        }
    }
    await browser.close();
    http.close();
    console.log(`\n${total - fallos}/${total} pruebas correctas`);
    process.exit(fallos ? 1 : 0);
})();
