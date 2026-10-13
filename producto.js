// Interacción de las páginas de producto: miniaturas, video y selector de color.
(function () {
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
