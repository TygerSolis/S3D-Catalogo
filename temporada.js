// Temporada (p. ej. Navidad): activa la ambientación solo entre las fechas de config.json «temporada».
// El generador escribe las fechas en <html data-temporada-…>; este archivo se carga en <head> sin defer
// para poner la clase antes de pintar (sin destello del diseño normal). Fuera de fechas no hace nada.
(function () {
    const raiz = document.documentElement;
    const { temporada, temporadaDesde, temporadaHasta } = raiz.dataset;
    if (!temporada || !temporadaDesde || !temporadaHasta) return;
    const hoy = new Date();
    const dosCifras = n => String(n).padStart(2, '0');
    const fecha = `${hoy.getFullYear()}-${dosCifras(hoy.getMonth() + 1)}-${dosCifras(hoy.getDate())}`;   // fecha local AAAA-MM-DD
    if (fecha >= temporadaDesde && fecha <= temporadaHasta) raiz.classList.add(`temporada-${temporada}`);
})();
