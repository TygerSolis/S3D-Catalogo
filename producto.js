// Interacción de las páginas de producto: miniaturas, video y selector de color.
(function () {
    // Aviso "Nuevo": visible durante NUEVO_DIAS días desde data-fecha-alta (AAAA-MM-DD).
    const NUEVO_DIAS = 14;
    const producto = document.querySelector('[data-fecha-alta]');
    if (producto) {
        const [anio, mes, dia] = producto.dataset.fechaAlta.split('-').map(Number);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const dias = Math.round((hoy - new Date(anio, mes - 1, dia)) / 86400000);
        if (dias >= 0 && dias <= NUEVO_DIAS) document.querySelectorAll('[data-new]').forEach(el => { el.hidden = false; });
    }

    const img = document.getElementById('pp-main-img');
    const source = document.getElementById('pp-main-src');
    const video = document.getElementById('pp-video');
    const buy = document.getElementById('pp-buy');
    if (!img || !source) return;

    const mostrarImagen = url => {
        if (video) { video.pause(); video.hidden = true; }
        img.hidden = false;
        img.src = url;
        source.srcset = url.replace(/\.(webp|png|jpe?g)$/i, '.avif');
        const intermedia = url.replace(/assets\//, 'assets/md/');
        document.querySelectorAll('#pp-picture source[data-md]').forEach(fuente => {
            fuente.srcset = fuente.type === 'image/avif' ? intermedia.replace(/\.(webp|png|jpe?g)$/i, '.avif') : intermedia;
        });
    };

    const activar = (grupo, elemento) => {
        grupo.forEach(item => {
            const activo = item === elemento;
            item.classList.toggle('is-active', activo);
            if (item.hasAttribute('aria-pressed')) item.setAttribute('aria-pressed', String(activo));
            if (item.hasAttribute('aria-current')) activo ? item.setAttribute('aria-current', 'true') : item.removeAttribute('aria-current');
        });
    };

    const miniaturas = [...document.querySelectorAll('[data-pp-thumb], [data-pp-video]')];
    miniaturas.forEach(boton => boton.addEventListener('click', () => {
        activar(miniaturas, boton);
        if (boton.hasAttribute('data-pp-video') && video) {
            img.hidden = true;
            video.hidden = false;
            video.play().catch(() => {});
        } else {
            mostrarImagen(boton.dataset.src);
        }
    }));

    const colores = [...document.querySelectorAll('[data-pp-color]')];
    const etiqueta = document.getElementById('pp-color-name');
    colores.forEach(boton => boton.addEventListener('click', () => {
        activar(colores, boton);
        mostrarImagen(boton.dataset.img);
        if (etiqueta) etiqueta.textContent = boton.dataset.ppColor;
        if (buy && boton.dataset.wa) buy.href = boton.dataset.wa;
        if (window.s3dTrack && producto) window.s3dTrack('color_elegido', { eleccion: `${producto.dataset.producto} · ${boton.dataset.ppColor}` });
    }));

    // ---- Visor de alta resolución ----
    // Al pulsar la foto principal se abre el visor con la imagen COMPLETA ajustada a la pantalla (sin barras de
    // desplazamiento). Abre al instante con la versión estándar y la cambia por el original (assets/hd) cuando
    // termina de descargarse. Un clic acerca (3x como máximo) y la imagen sigue al cursor; otro clic aleja.
    const escenario = document.getElementById('pp-stage');
    if (!escenario) return;
    const aviso = document.createElement('span');
    aviso.className = 'pp-zoom-hint';
    aviso.textContent = 'Ampliar';
    escenario.append(aviso);

    let indicePromesa = null;
    const cargarIndice = () => indicePromesa || (indicePromesa = fetch('../../assets/hd/index.json')
        .then(r => (r.ok ? r.json() : {})).catch(() => ({})));
    const nombreDe = ruta => decodeURIComponent(ruta.replace(/^.*?assets\//, '').replace(/\.(webp|png|jpe?g)$/i, ''));
    const avifDe = ruta => ruta.replace(/\.(webp|png|jpe?g)$/i, '.avif');
    const hdDe = ruta => ruta.replace(/assets\//, 'assets/hd/');

    const visor = document.createElement('div');
    visor.className = 'pp-viewer';
    visor.hidden = true;
    visor.setAttribute('role', 'dialog');
    visor.setAttribute('aria-modal', 'true');
    visor.setAttribute('aria-label', 'Imagen ampliada');
    visor.innerHTML = '<div class="pp-viewer-bar"><span class="pp-viewer-info" role="status"></span><button type="button" class="pp-viewer-close" aria-label="Cerrar">×</button></div>' +
        '<div class="pp-viewer-stage"><picture><source type="image/avif"><img alt="" draggable="false"></picture><span class="pp-viewer-hint" aria-hidden="true"></span></div>';
    document.body.append(visor);
    const info = visor.querySelector('.pp-viewer-info');
    const escena = visor.querySelector('.pp-viewer-stage');
    const imagenVisor = visor.querySelector('img');
    const fuenteVisor = visor.querySelector('source');
    const ayuda = visor.querySelector('.pp-viewer-hint');
    const cerrar = visor.querySelector('.pp-viewer-close');
    const conRaton = window.matchMedia('(hover: hover)').matches;
    const zoom = { escala: 1, x: 0, y: 0 };
    const ZOOM_CLIC = 3;
    let anterior = null;
    let abierta = null;
    let objetivo = null;
    let animando = false;

    function aplicarZoom() {
        imagenVisor.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.escala})`;
        imagenVisor.classList.toggle('is-zoomed', zoom.escala > 1);
        ayuda.textContent = zoom.escala > 1
            ? (conRaton ? 'Clic para alejar' : 'Toca para alejar · arrastra para mover')
            : (conRaton ? 'Clic para acercar · mueve el cursor para recorrer la imagen' : 'Toca para acercar');
    }
    const limites = () => ({
        x: Math.max(0, (imagenVisor.clientWidth * zoom.escala - escena.clientWidth) / 2),
        y: Math.max(0, (imagenVisor.clientHeight * zoom.escala - escena.clientHeight) / 2)
    });
    function limitar() {
        const m = limites();
        zoom.x = Math.min(m.x, Math.max(-m.x, zoom.x));
        zoom.y = Math.min(m.y, Math.max(-m.y, zoom.y));
    }
    function reiniciar() { objetivo = null; zoom.escala = 1; zoom.x = 0; zoom.y = 0; aplicarZoom(); }
    // Centro de la imagen sin la traslación actual (getBoundingClientRect ya la incluye).
    const centro = () => {
        const r = imagenVisor.getBoundingClientRect();
        return { x: r.left + r.width / 2 - zoom.x, y: r.top + r.height / 2 - zoom.y };
    };
    function acercar(clientX, clientY) {
        const c = centro();
        const nueva = Math.min(ZOOM_CLIC, Math.max(2, imagenVisor.naturalWidth / (imagenVisor.clientWidth || 1)));
        const cx = clientX - c.x;
        const cy = clientY - c.y;
        const razon = nueva / zoom.escala;
        zoom.x = cx - razon * (cx - zoom.x);
        zoom.y = cy - razon * (cy - zoom.y);
        zoom.escala = nueva;
        limitar();
        aplicarZoom();
    }
    function animar() {
        if (!objetivo || zoom.escala <= 1) { animando = false; return; }
        zoom.x += (objetivo.x - zoom.x) * 0.2;
        zoom.y += (objetivo.y - zoom.y) * 0.2;
        limitar();
        aplicarZoom();
        if (Math.abs(objetivo.x - zoom.x) > 0.3 || Math.abs(objetivo.y - zoom.y) > 0.3) requestAnimationFrame(animar);
        else animando = false;
    }
    function seguirCursor(clientX, clientY) {
        if (zoom.escala <= 1) return;
        const c = centro();
        const u = Math.max(-1, Math.min(1, (clientX - c.x) / (imagenVisor.clientWidth / 2)));
        const v = Math.max(-1, Math.min(1, (clientY - c.y) / (imagenVisor.clientHeight / 2)));
        const m = limites();
        objetivo = { x: -u * m.x, y: -v * m.y };
        if (!animando) { animando = true; requestAnimationFrame(animar); }
    }

    const mostrar = ruta => { fuenteVisor.srcset = avifDe(ruta); imagenVisor.src = ruta; };

    async function abrir() {
        if (img.hidden) return;
        if (window.s3dTrack && producto) window.s3dTrack('ficha_ampliar', { producto: producto.dataset.producto });
        const estandar = img.getAttribute('src');
        abierta = estandar;
        anterior = document.activeElement;
        reiniciar();
        imagenVisor.alt = img.alt;
        mostrar(estandar);
        info.textContent = '';
        visor.hidden = false;
        document.body.style.overflow = 'hidden';
        cerrar.focus();
        if (navigator.connection && navigator.connection.saveData) return;
        const datos = (await cargarIndice())[nombreDe(estandar)];
        if (!datos) return;
        info.textContent = 'Cargando alta resolución…';
        const hd = hdDe(estandar);
        const prueba = new Image();
        const picture = document.createElement('picture');
        const fuente = document.createElement('source');
        fuente.type = 'image/avif';
        fuente.srcset = avifDe(hd);
        picture.append(fuente, prueba);
        prueba.onload = () => {
            if (abierta !== estandar || visor.hidden) return;
            mostrar(hd);
            info.textContent = `Alta resolución · ${datos.w}×${datos.h}`;
        };
        prueba.onerror = () => { info.textContent = ''; };
        prueba.src = hd;
    }

    function cerrarVisor() {
        visor.hidden = true;
        abierta = null;
        reiniciar();
        document.body.style.overflow = '';
        if (anterior && document.contains(anterior)) anterior.focus();
    }

    // Un clic o toque alterna entre ajustar y acercar; con ratón la imagen sigue al cursor, con el dedo se arrastra.
    let gesto = null;
    escena.addEventListener('pointerdown', evento => {
        if (evento.target.closest('button')) return;
        escena.setPointerCapture(evento.pointerId);
        gesto = { x: evento.clientX, y: evento.clientY, t: Date.now(), movido: false, zx: zoom.x, zy: zoom.y, fondo: evento.target === escena };
    });
    escena.addEventListener('pointermove', evento => {
        if (evento.pointerType === 'mouse' && evento.buttons === 0) seguirCursor(evento.clientX, evento.clientY);
        if (!gesto) return;
        const dx = evento.clientX - gesto.x;
        const dy = evento.clientY - gesto.y;
        if (Math.hypot(dx, dy) > 8) gesto.movido = true;
        if (zoom.escala > 1 && gesto.movido && evento.pointerType !== 'mouse') {
            zoom.x = gesto.zx + dx;
            zoom.y = gesto.zy + dy;
            limitar();
            aplicarZoom();
        }
    });
    escena.addEventListener('pointerup', evento => {
        if (!gesto) return;
        const toque = !gesto.movido && Date.now() - gesto.t < 400;
        const fondo = gesto.fondo;
        gesto = null;
        if (!toque) return;
        if (fondo) { cerrarVisor(); return; }
        if (zoom.escala > 1) { objetivo = null; reiniciar(); return; }
        acercar(evento.clientX, evento.clientY);
        if (evento.pointerType === 'mouse') seguirCursor(evento.clientX, evento.clientY);
    });
    escena.addEventListener('pointercancel', () => { gesto = null; });
    cerrar.addEventListener('click', cerrarVisor);
    document.addEventListener('keydown', evento => {
        if (visor.hidden) return;
        if (evento.key === 'Escape') cerrarVisor();
        else if (evento.key === '0') reiniciar();
    });
    escenario.addEventListener('click', evento => { if (!evento.target.closest('video')) abrir(); });
    escenario.addEventListener('keydown', evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); abrir(); } });
})();

// ---- Pedido, favoritos, compartir y cotizador de la ficha ----
(function () {
    const articulo = document.querySelector('.pp-product');
    if (!articulo) return;
    const tienda = () => window.S3D;
    const track = (evento, datos) => { if (window.s3dTrack) window.s3dTrack(evento, datos); };
    const nombre = articulo.dataset.producto;
    const id = Number(articulo.dataset.id);
    const colorActual = () => { const etiqueta = document.getElementById('pp-color-name'); return etiqueta ? etiqueta.textContent.trim() : null; };
    const imagenActual = () => {
        const activo = document.querySelector('.pp-swatch.is-active');
        if (activo && activo.dataset.img) return activo.dataset.img.replace(/^(\.\.\/)+/, '').replace(/^assets\//, 'assets/sm/');
        return articulo.dataset.imagen;
    };

    const agregar = document.getElementById('pp-add');
    if (agregar) agregar.addEventListener('click', () => {
        if (!tienda()) return;
        tienda().pedido.agregar({
            id, nombre, slug: articulo.dataset.slug,
            precio: articulo.dataset.precio ? Number(articulo.dataset.precio) : null,
            cotizar: articulo.dataset.cotizar === '1',
            imagen: imagenActual(), color: colorActual(), medida: articulo.dataset.medida || null
        });
        agregar.classList.add('is-added');
        agregar.querySelector('span').textContent = 'Añadido';
        setTimeout(() => { agregar.classList.remove('is-added'); agregar.querySelector('span').textContent = 'Añadir al pedido'; }, 1600);
    });

    const favorito = document.getElementById('pp-fav');
    const pintarFavorito = () => {
        if (!favorito || !tienda()) return;
        const activo = tienda().favoritos.tiene(id);
        favorito.setAttribute('aria-pressed', String(activo));
        favorito.setAttribute('aria-label', activo ? 'Quitar de favoritos' : 'Guardar en favoritos');
        favorito.title = activo ? 'Quitar de favoritos' : 'Guardar en favoritos';
    };
    if (favorito && tienda()) {
        pintarFavorito();
        tienda().favoritos.alCambiar(pintarFavorito);
        favorito.addEventListener('click', () => {
            const ahora = tienda().favoritos.alternar(id, nombre);
            tienda().aviso(ahora ? 'Guardado en favoritos' : 'Quitado de favoritos');
        });
    }

    const compartir = document.getElementById('pp-share');
    if (compartir) compartir.addEventListener('click', async () => {
        const url = location.href.split('#')[0];
        try {
            if (navigator.share) { await navigator.share({ title: document.title, text: `${nombre} — S3D`, url }); }
            else { await navigator.clipboard.writeText(url); if (tienda()) tienda().aviso('Enlace copiado'); }
            track('ficha_compartir', { producto: nombre });
        } catch (error) {
            if (error && error.name !== 'AbortError' && tienda()) tienda().aviso('No se pudo compartir. Copia el enlace de la barra de direcciones.');
        }
    });

    const formulario = document.getElementById('pp-cotizador');
    if (formulario) formulario.addEventListener('submit', evento => {
        evento.preventDefault();
        const datos = new FormData(formulario);
        const valor = clave => String(datos.get(clave) || '').trim();
        const lineas = [];
        if (valor('medida')) lineas.push(`Medida que necesito: ${valor('medida')}`);
        if (valor('color') && valor('color') !== '__otro') lineas.push(`Color: ${valor('color')}`);
        if (valor('texto')) lineas.push(`Nombre o texto: ${valor('texto')}`);
        if (valor('notas')) lineas.push(`Detalles: ${valor('notas')}`);
        const publicada = articulo.dataset.medida ? ` (medida publicada: ${articulo.dataset.medida})` : '';
        const cuerpo = lineas.length ? lineas.map(linea => `• ${linea}`).join('\n') : 'Me gustaría conocer las opciones de personalización.';
        const mensaje = `Hola, quiero cotizar una personalización de: ${nombre}${publicada}.\n${cuerpo}\nQuedo atento al costo y al tiempo de elaboración.\n${location.href.split('#')[0]}`;
        window.open(window.S3D.urlWhatsApp(mensaje), '_blank', 'noopener');
        track('cotizar_personalizado', { producto: nombre });
    });
})();
