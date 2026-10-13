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
    }));
})();
