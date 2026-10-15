/**
 * Analítica de S3D con Umami Cloud (sin cookies, sin datos personales).
 *
 * Mientras CONFIG.websiteId esté vacío NO se carga nada ni se envía ningún dato.
 * Para activarla: crea el sitio en https://cloud.umami.is (Settings > Websites > Add website,
 * dominio tygersolis.github.io), copia su "Website ID" y pégalo abajo.
 *
 * Eventos que se envían (cada propiedad cuenta para la cuota mensual de Umami):
 *   producto_visto   { producto }   se abre la galería ampliada de un producto
 *   clic_comprar     { producto }   clic en Comprar/Cotizar de un producto (WhatsApp)
 *   clic_whatsapp    { zona }       clic en otro enlace a WhatsApp (cabecera, aviso, pie...)
 *   categoria        { categoria }  se elige una categoría o "Novedades" en el catálogo
 *   busqueda         { termino }    texto buscado (tras 1,5 s sin escribir, mínimo 3 letras)
 *   color_elegido    { eleccion }   "PRODUCTO · Color" al cambiar de color
 *   orden            { orden }      criterio de orden del catálogo
 *   ficha_tarjeta    { producto }   se abre la ficha desde la tarjeta del catálogo (clic en cualquier parte)
 *   ficha_galeria    { producto }   se abre la ficha desde "Ver ficha completa" de la galería ampliada
 *   ficha_relacionado{ producto }   clic en un producto relacionado dentro de una ficha
 *   ficha_ampliar    { producto }   se amplía la foto principal en una ficha
 *   ficha_buscador   { producto }   se abre una ficha desde las sugerencias del buscador
 *   busqueda_sin_resultados { termino } búsqueda que no encontró ningún producto
 *   pedido_agregar   { producto }   se añade un producto a la lista de pedido
 *   pedido_enviar    { unidades }   se envía la lista de pedido por WhatsApp
 *   favorito_agregar { producto }   se guarda un producto en favoritos
 *   cotizar_personalizado { producto } se envía el formulario de personalización
 *   ficha_compartir  { producto }   se comparte o copia el enlace de la ficha
 *   mapa_cargado     (sin datos)    se pulsa "Ver el mapa del taller" en la portada
 * Además Umami registra cada página vista; las páginas de producto aparecen por su URL.
 *
 * Para excluir tus propios dispositivos: abre el sitio una vez con ?sin-analitica
 * (y ?con-analitica para volver a contarlos).
 */
(function () {
    const CONFIG = {
        websiteId: '2d8395c6-93e5-4d61-88c8-617770507c46',
        script: 'https://cloud.umami.is/script.js',
        dominios: 'tygersolis.github.io'
    };

    try {
        const parametros = new URLSearchParams(location.search);
        if (parametros.has('sin-analitica')) localStorage.setItem('umami.disabled', '1');
        if (parametros.has('con-analitica')) localStorage.removeItem('umami.disabled');
    } catch (error) { /* almacenamiento no disponible: se ignora */ }

    const cola = [];
    window.s3dTrack = function (evento, datos) {
        if (window.umami && typeof window.umami.track === 'function') window.umami.track(evento, datos);
        else if (CONFIG.websiteId && cola.length < 50) cola.push([evento, datos]);
    };

    // Clics en enlaces a WhatsApp: con data-producto cuentan como compra de ese producto;
    // el resto se agrupa por la zona de la página donde están.
    const zonaDe = enlace => {
        if (enlace.closest('.site-nav, .pp-topbar')) return 'cabecera';
        if (enlace.closest('.announcement-bar')) return 'aviso-superior';
        if (enlace.closest('.catalog-notice')) return 'aviso-catalogo';
        if (enlace.closest('.search-suggest')) return 'buscador';
        if (enlace.closest('#inicio')) return 'hero';
        if (enlace.closest('#personalizados')) return 'personalizados';
        if (enlace.closest('footer')) return 'pie';
        if (enlace.closest('#faq')) return 'faq';
        return 'otro';
    };
    document.addEventListener('click', evento => {
        const enlace = evento.target.closest && evento.target.closest('a[href*="api.whatsapp.com"]');
        if (!enlace) return;
        if (enlace.dataset.producto) window.s3dTrack('clic_comprar', { producto: enlace.dataset.producto });
        else window.s3dTrack('clic_whatsapp', { zona: zonaDe(enlace) });
    }, true);

    // Elementos con data-evento="nombre" y data-producto="..." envían ese evento al hacer clic.
    document.addEventListener('click', evento => {
        const elemento = evento.target.closest && evento.target.closest('[data-evento]');
        if (elemento && elemento.dataset.producto) window.s3dTrack(elemento.dataset.evento, { producto: elemento.dataset.producto });
    }, true);

    if (!CONFIG.websiteId) return;

    const nota = document.getElementById('analytics-note');
    if (nota) nota.hidden = false;

    const etiqueta = document.createElement('script');
    etiqueta.defer = true;
    etiqueta.src = CONFIG.script;
    etiqueta.dataset.websiteId = CONFIG.websiteId;
    etiqueta.dataset.domains = CONFIG.dominios;   // no registra visitas desde localhost ni otros dominios
    etiqueta.dataset.doNotTrack = 'true';         // respeta la opción "No rastrear" del navegador
    etiqueta.addEventListener('load', () => {
        cola.splice(0).forEach(([evento, datos]) => window.umami && window.umami.track(evento, datos));
    });
    document.head.appendChild(etiqueta);
})();
