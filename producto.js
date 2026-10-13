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
    // Al pulsar la foto principal se abre el original (assets/hd) si existe; el visor se abre al instante
    // con la versión estándar y la cambia por el original en cuanto termina de descargarse.
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
        '<div class="pp-viewer-scroll"><picture><source type="image/avif"><img alt="" draggable="false"></picture></div>';
    document.body.append(visor);
    const info = visor.querySelector('.pp-viewer-info');
    const zona = visor.querySelector('.pp-viewer-scroll');
    const imagenVisor = visor.querySelector('img');
    const fuenteVisor = visor.querySelector('source');
    const cerrar = visor.querySelector('.pp-viewer-close');
    let anterior = null;
    let abierta = null;

    const mostrar = ruta => { fuenteVisor.srcset = avifDe(ruta); imagenVisor.src = ruta; };

    async function abrir() {
        if (img.hidden) return;
        const estandar = img.getAttribute('src');
        abierta = estandar;
        anterior = document.activeElement;
        zona.classList.remove('is-zoom');
        imagenVisor.alt = img.alt;
        mostrar(estandar);
        info.textContent = '';
        visor.hidden = false;
        document.body.style.overflow = 'hidden';
        cerrar.focus();
        if (navigator.connection && navigator.connection.saveData) return;
        const datos = (await cargarIndice())[nombreDe(estandar)];
        if (!datos) { info.textContent = 'Clic en la imagen para acercar'; return; }
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
            info.textContent = `Alta resolución · ${datos.w}×${datos.h} · clic en la imagen para acercar y mueve el cursor para recorrerla`;
        };
        prueba.onerror = () => { info.textContent = 'Clic en la imagen para acercar'; };
        prueba.src = hd;
    }

    function cerrarVisor() {
        visor.hidden = true;
        abierta = null;
        document.body.style.overflow = '';
        if (anterior && document.contains(anterior)) anterior.focus();
    }

    // Alterna entre ajustar a la pantalla y tamaño real, manteniendo el punto tocado.
    imagenVisor.addEventListener('click', evento => {
        const caja = imagenVisor.getBoundingClientRect();
        const fx = (evento.clientX - caja.left) / caja.width;
        const fy = (evento.clientY - caja.top) / caja.height;
        const ampliar = !zona.classList.contains('is-zoom');
        zona.classList.toggle('is-zoom', ampliar);
        if (ampliar) {
            requestAnimationFrame(() => {
                zona.scrollLeft = fx * imagenVisor.offsetWidth - zona.clientWidth / 2;
                zona.scrollTop = fy * imagenVisor.offsetHeight - zona.clientHeight / 2;
            });
        }
    });
    // Con ratón y la imagen a tamaño real, el cursor recorre la imagen como una lupa.
    zona.addEventListener('pointermove', evento => {
        if (evento.pointerType !== 'mouse' || !zona.classList.contains('is-zoom')) return;
        const caja = zona.getBoundingClientRect();
        const fx = Math.min(1, Math.max(0, (evento.clientX - caja.left) / caja.width));
        const fy = Math.min(1, Math.max(0, (evento.clientY - caja.top) / caja.height));
        zona.scrollLeft = fx * (zona.scrollWidth - zona.clientWidth);
        zona.scrollTop = fy * (zona.scrollHeight - zona.clientHeight);
    });
    zona.addEventListener('click', evento => { if (evento.target === zona) cerrarVisor(); });
    cerrar.addEventListener('click', cerrarVisor);
    document.addEventListener('keydown', evento => { if (!visor.hidden && evento.key === 'Escape') cerrarVisor(); });
    escenario.addEventListener('click', evento => { if (!evento.target.closest('video')) abrir(); });
    escenario.addEventListener('keydown', evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); abrir(); } });
})();
