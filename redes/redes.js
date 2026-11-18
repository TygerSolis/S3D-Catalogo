// Página interna de publicaciones para redes: copiar textos, enviar fotos a otra app y marcar dónde ya se publicó.
// Las marcas se guardan solo en este navegador (localStorage); la página funciona igual sin ellas.
(function () {
    'use strict';
    const CLAVE = 's3d-redes-publicado';
    const REDES = ['marketplace', 'facebook', 'instagram'];

    const leer = () => {
        try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; }
    };
    const guardar = estado => {
        try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento: no se recuerda */ }
    };

    function copiarConSeleccion(elemento) {
        const rango = document.createRange();
        rango.selectNodeContents(elemento);
        const seleccion = window.getSelection();
        seleccion.removeAllRanges();
        seleccion.addRange(rango);
        const ok = document.execCommand('copy');
        seleccion.removeAllRanges();
        return ok;
    }

    async function copiar(boton) {
        const elemento = document.getElementById(boton.dataset.copiar);
        if (!elemento) return;
        let ok = false;
        try {
            await navigator.clipboard.writeText(elemento.textContent);
            ok = true;
        } catch (e) {
            ok = copiarConSeleccion(elemento);
        }
        const texto = boton.dataset.textoOriginal || boton.textContent;
        boton.dataset.textoOriginal = texto;
        boton.textContent = ok ? '¡Copiado!' : 'Mantén pulsado el texto para copiarlo';
        boton.classList.toggle('rd-ok', ok);
        setTimeout(() => { boton.textContent = texto; boton.classList.remove('rd-ok'); }, 2000);
    }

    // En el celular: abre el menú «Compartir» con todas las fotos del producto (p. ej. para Instagram o Facebook).
    async function compartir(boton) {
        const articulo = boton.closest('.rd-post');
        const fotos = [...articulo.querySelectorAll('.rd-foto img')];
        boton.disabled = true;
        try {
            const archivos = await Promise.all(fotos.map(async img => {
                const blob = await (await fetch(img.src)).blob();
                return new File([blob], decodeURIComponent(img.src.split('?')[0].split('/').pop()), { type: 'image/jpeg' });
            }));
            await navigator.share({ files: archivos });
        } catch (e) {
            /* compartir cancelado o no disponible */
        } finally {
            boton.disabled = false;
        }
    }

    function pintar() {
        const estado = leer();
        let completos = 0;
        document.querySelectorAll('.rd-post').forEach(articulo => {
            const marcas = estado[articulo.dataset.id] || {};
            articulo.querySelectorAll('[data-red]').forEach(casilla => { casilla.checked = !!marcas[casilla.dataset.red]; });
            const completo = REDES.every(red => marcas[red]);
            articulo.classList.toggle('rd-completo', completo);
            if (completo) completos++;
        });
        const progreso = document.querySelector('[data-progreso]');
        if (progreso) progreso.textContent = String(completos);
    }

    document.addEventListener('click', evento => {
        const boton = evento.target.closest('[data-copiar]');
        if (boton) copiar(boton);
        const enviar = evento.target.closest('[data-compartir]');
        if (enviar) compartir(enviar);
    });

    document.addEventListener('change', evento => {
        const casilla = evento.target.closest('[data-red]');
        if (!casilla) return;
        const id = casilla.closest('.rd-post').dataset.id;
        const estado = leer();
        estado[id] = Object.assign({}, estado[id], { [casilla.dataset.red]: casilla.checked });
        guardar(estado);
        pintar();
    });

    // «Enviar las fotos a otra app» solo aparece si el navegador puede compartir archivos (sobre todo en el celular).
    try {
        const prueba = new File([''], 'prueba.jpg', { type: 'image/jpeg' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [prueba] })) {
            document.querySelectorAll('[data-compartir]').forEach(boton => {
                if (boton.closest('.rd-post').querySelector('.rd-foto img')) boton.hidden = false;
            });
        }
    } catch (e) { /* sin Web Share API */ }

    pintar();
}());
