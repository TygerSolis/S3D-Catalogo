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
 *   error_js         { error }      fallo de JavaScript en el navegador de un visitante: "mensaje @ archivo:línea"
 *                                   (máx. 3 por visita; se ignoran extensiones del navegador y scripts de terceros)
 *   mapa_cargado     (sin datos)    se pulsa "Ver el mapa del taller" en la portada
 *   barra_comprar    { producto }   se pulsa la barra fija «Pedir por WhatsApp» de una ficha (celular)
 *   filtro_precio    { rango }      se elige un rango de precio en el catálogo
 *   ficha_vista      { producto }   clic en «Vistos recientemente» dentro de una ficha
 *   ficha_regalos    { producto }   se abre una ficha desde la guía de regalos
 *   guia_regalos     { producto }   se abre la guía de regalos desde el catálogo
 * Además Umami registra cada página vista; las páginas de producto aparecen por su URL.
 *
 * Para excluir tus propios dispositivos: abre el sitio una vez con ?sin-analitica
 * (y ?con-analitica para volver a contarlos).
 *
 * Píxel de Meta (anuncios en Facebook e Instagram): pixelId lo escribe el generador desde config.json «metaPixel».
 * Vacío = apagado. Con número, cada visitante ve un aviso de cookies y el píxel SOLO se carga si pulsa «Aceptar»
 * (la decisión queda en el navegador; «Preferencias de cookies», al pie, permite cambiarla). Nunca en la vista previa.
 * Eventos estándar que recibe Meta: PageView; ViewContent (ficha); AddToCart (pedido_agregar); Lead (clic_comprar,
 * pedido_enviar, cotizar_personalizado, llavero_pedir); Contact (clic_whatsapp); Search (busqueda).
 */
(function () {
    const CONFIG = {
        websiteId: '2d8395c6-93e5-4d61-88c8-617770507c46',
        script: 'https://cloud.umami.is/script.js',
        dominios: 'tygersolis.github.io',
        pixelId: '2186135135325502',
        pixelDominio: 'tygersolis.github.io'
    };
    const RAIZ = document.currentScript ? new URL('.', document.currentScript.src).href : '/';

    // ---------- Píxel de Meta (solo con consentimiento) ----------
    const CLAVE_COOKIES = 's3d-cookies';
    const pixelPosible = Boolean(CONFIG.pixelId) && location.hostname === CONFIG.pixelDominio && !location.pathname.includes('/vista-previa/');
    let pixelActivo = false;
    const decision = () => { try { return localStorage.getItem(CLAVE_COOKIES); } catch (error) { return null; } };
    const guardarDecision = valor => { try { localStorage.setItem(CLAVE_COOKIES, valor); } catch (error) { /* sin almacenamiento */ } };
    const articulo = () => document.querySelector('.pp-product');
    const datosFicha = nombre => {
        const a = articulo();
        if (!a || (nombre && a.dataset.producto !== nombre)) return {};
        const datos = { content_ids: [`S3D-${a.dataset.id}`], content_type: a.dataset.metaTipo || 'product' };
        if (a.dataset.precio) { datos.value = Number(a.dataset.precio); datos.currency = 'PEN'; }
        return datos;
    };
    const EVENTOS_PIXEL = { pedido_agregar: 'AddToCart', clic_comprar: 'Lead', pedido_enviar: 'Lead', cotizar_personalizado: 'Lead', llavero_pedir: 'Lead', clic_whatsapp: 'Contact', busqueda: 'Search' };
    function enviarPixel(evento, datos) {
        const nombre = EVENTOS_PIXEL[evento];
        if (!pixelActivo || !nombre || typeof window.fbq !== 'function') return;
        const parametros = {};
        if (datos && datos.producto) Object.assign(parametros, { content_name: String(datos.producto).slice(0, 120) }, datosFicha(datos.producto));
        if (evento === 'busqueda' && datos && datos.termino) parametros.search_string = String(datos.termino).slice(0, 80);
        window.fbq('track', nombre, parametros);
    }
    function activarPixel() {
        if (pixelActivo || !pixelPosible) return;
        pixelActivo = true;
        // Equivale al fragmento oficial de Meta, sin código en línea (la CSP no lo permite).
        if (typeof window.fbq !== 'function') {
            const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
            fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
            window.fbq = fbq;
            if (!window._fbq) window._fbq = fbq;
            const etiqueta = document.createElement('script');
            etiqueta.async = true;
            etiqueta.src = 'https://connect.facebook.net/en_US/fbevents.js';
            document.head.appendChild(etiqueta);
        }
        window.fbq('init', CONFIG.pixelId);
        window.fbq('track', 'PageView');
        const a = articulo();
        if (a) window.fbq('track', 'ViewContent', Object.assign({ content_name: a.dataset.producto }, datosFicha()));
    }
    function desactivarPixel() {
        pixelActivo = false;   // lo ya cargado deja de recibir eventos; en la próxima página no se carga
        ['_fbp', '_fbc'].forEach(nombre => {
            document.cookie = `${nombre}=; Max-Age=0; path=/`;
            document.cookie = `${nombre}=; Max-Age=0; path=/; domain=${location.hostname}`;
        });
    }
    function preguntarCookies() {
        if (document.querySelector('.s3d-cookies')) return;
        const caja = document.createElement('div');
        caja.className = 's3d-cookies no-print';
        caja.setAttribute('role', 'dialog');
        caja.setAttribute('aria-label', 'Aviso de cookies');
        const texto = document.createElement('p');
        const enlace = document.createElement('a');
        enlace.href = `${RAIZ}privacidad/`;
        enlace.textContent = 'Más información';
        texto.append('Usamos cookies de Meta (Facebook e Instagram) para medir nuestros anuncios y mostrarte productos de S3D. Si las rechazas, la web funciona igual. ', enlace);
        const botones = document.createElement('div');
        botones.className = 's3d-cookies-botones';
        const boton = (clase, etiqueta, valor) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = clase;
            b.textContent = etiqueta;
            b.addEventListener('click', () => {
                guardarDecision(valor);
                caja.remove();
                if (valor === 'si') activarPixel(); else desactivarPixel();
            });
            return b;
        };
        botones.append(boton('s3d-cookies-no', 'Rechazar', 'no'), boton('s3d-cookies-si', 'Aceptar', 'si'));
        caja.append(texto, botones);
        document.body.appendChild(caja);
    }
    if (pixelPosible) {
        const iniciar = () => {
            document.querySelectorAll('[data-cookies-pie]').forEach(el => { el.hidden = false; });
            const elegido = decision();
            if (elegido === 'si') activarPixel();
            else if (elegido !== 'no') preguntarCookies();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
        document.addEventListener('click', evento => {
            if (evento.target.closest && evento.target.closest('[data-cookies]')) preguntarCookies();
        });
    }

    try {
        const parametros = new URLSearchParams(location.search);
        if (parametros.has('sin-analitica')) localStorage.setItem('umami.disabled', '1');
        if (parametros.has('con-analitica')) localStorage.removeItem('umami.disabled');
    } catch (error) { /* almacenamiento no disponible: se ignora */ }

    const cola = [];
    window.s3dTrack = function (evento, datos) {
        enviarPixel(evento, datos);
        if (window.umami && typeof window.umami.track === 'function') window.umami.track(evento, datos);
        else if (CONFIG.websiteId && cola.length < 50) cola.push([evento, datos]);
    };

    // Errores de JavaScript de nuestros archivos: llegan a Umami como evento error_js para detectar fallos
    // que solo ocurren en algunos navegadores o dispositivos.
    let erroresEnviados = 0;
    const reportarError = (mensaje, archivo, linea) => {
        if (erroresEnviados >= 3 || !archivo || !archivo.startsWith(location.origin)) return;   // solo nuestros scripts
        erroresEnviados += 1;
        const nombre = archivo.split('?')[0].split('/').pop();
        window.s3dTrack('error_js', { error: `${String(mensaje).slice(0, 140)} @ ${nombre}:${linea || 0}` });
    };
    window.addEventListener('error', evento => {
        if (evento.target && evento.target !== window) return;   // recursos que no cargan (imágenes): no son errores de código
        reportarError(evento.message, evento.filename, evento.lineno);
    });
    window.addEventListener('unhandledrejection', evento => {
        const motivo = evento.reason || {};
        const pila = String(motivo.stack || '');
        const origen = (pila.match(/(https?:\/\/[^\s)]+?):(\d+):\d+/) || []);
        reportarError(motivo.message || motivo, origen[1], origen[2]);
    });

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
        if (enlace.closest('#ll-form')) return 'llavero';
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
    if (nota) nota.hidden = pixelPosible;   // con el píxel ya no es cierto que no haya cookies

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
