// Cabecera y pie compartidos: año del copyright y menú móvil.
(function () {
    const anio = document.getElementById('current-year');
    if (anio) anio.textContent = new Date().getFullYear();

    const boton = document.getElementById('nav-toggle');
    const menu = document.getElementById('mobile-menu');
    if (!boton || !menu) return;

    function cerrar() {
        menu.hidden = true;
        boton.setAttribute('aria-expanded', 'false');
        boton.setAttribute('aria-label', 'Abrir menú');
    }
    boton.addEventListener('click', () => {
        const abrir = menu.hidden;
        menu.hidden = !abrir;
        boton.setAttribute('aria-expanded', String(abrir));
        boton.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
    });
    menu.addEventListener('click', evento => { if (evento.target.closest('a')) cerrar(); });
    document.addEventListener('keydown', evento => { if (evento.key === 'Escape' && !menu.hidden) { cerrar(); boton.focus(); } });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', evento => { if (evento.matches) cerrar(); });
})();
