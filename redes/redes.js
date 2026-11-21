// Página interna de publicaciones para redes.
//  - Facebook e Instagram: «Publicar ahora» / «Aprobar» llaman al Apps Script (data-api del <main>) con la clave del
//    dueño, guardada solo en este navegador. El script publica con la API de Meta y anota todo en la hoja.
//  - Marketplace (a mano): copiar textos, enviar las fotos a otra app y marcar «Ya lo publiqué» (localStorage).
// Los datos del servidor se insertan con textContent / createElement (nunca como HTML).
(function () {
    'use strict';
    const CLAVE_MARCAS = 's3d-redes-publicado';
    const CLAVE_ACCESO = 's3d-redes-clave';
    const NOMBRES = { facebook: 'Facebook', instagram: 'Instagram', historia_facebook: 'Historia en Facebook', historia_instagram: 'Historia en Instagram', tiktok: 'TikTok' };
    const main = document.querySelector('main');
    const API = main ? main.dataset.api : '';
    let estado = null;   // respuesta del Apps Script: { 'id:tipo': { programado, salida, facebook, instagram } }

    const almacen = {
        leer(clave, defecto) { try { return JSON.parse(localStorage.getItem(clave)) ?? defecto; } catch (e) { return defecto; } },
        guardar(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ } },
        borrar(clave) { try { localStorage.removeItem(clave); } catch (e) { /* sin almacenamiento */ } }
    };

    const fecha = iso => new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    // ------------------------------------------------------------ copiar y compartir (Marketplace)

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

    function avisoBoton(boton, texto, ok, ms = 2000) {
        const original = boton.dataset.textoOriginal || boton.textContent;
        boton.dataset.textoOriginal = original;
        boton.textContent = texto;
        boton.classList.toggle('rd-ok', ok);
        clearTimeout(boton._aviso);
        boton._aviso = setTimeout(() => { boton.textContent = original; boton.classList.remove('rd-ok'); }, ms);
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
        avisoBoton(boton, ok ? '¡Copiado!' : 'Mantén pulsado el texto para copiarlo', ok);
    }

    async function compartir(boton) {
        const fotos = [...boton.closest('.rd-post').querySelectorAll('.rd-foto img')];
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

    // ------------------------------------------------------------ Apps Script

    async function llamar(accion, datos = {}) {
        const clave = almacen.leer(CLAVE_ACCESO, '');
        if (!API || !clave) throw new Error('falta la clave');
        // text/plain: el navegador no hace consulta previa (CORS) y el Apps Script lo recibe igual.
        const r = await fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ accion, clave }, datos)), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const json = await r.json();
        if (!json.ok) throw new Error(json.error || 'error desconocido');
        if (json.estado) estado = json.estado;
        return json;
    }

    function textoConexion(texto, clase) {
        const p = document.querySelector('[data-conexion-estado]');
        if (!p) return;
        p.textContent = texto;
        p.className = 'rd-conexion-estado' + (clase ? ' ' + clase : '');
    }

    async function conectar() {
        const form = document.querySelector('[data-clave-form]');
        if (!API) return;
        if (!almacen.leer(CLAVE_ACCESO, '')) {
            textoConexion('Escribe tu clave para activar los botones de publicación.', '');
            if (form) form.hidden = false;
            return;
        }
        textoConexion('Conectando…', '');
        try {
            await llamar('estado');
            textoConexion('Conectado: los botones publican en tu página de Facebook y en tu Instagram.', 'rd-bien');
            if (form) form.hidden = true;
            document.querySelectorAll('.rd-auto').forEach(s => { s.hidden = false; });
            pintar();
        } catch (e) {
            if (/clave/i.test(e.message)) almacen.borrar(CLAVE_ACCESO);
            textoConexion('No se pudo conectar: ' + e.message, 'rd-mal');
            if (form) form.hidden = false;
        }
    }

    function filaEstado(lista, texto, enlace, clase) {
        const li = document.createElement('li');
        if (clase) li.className = clase;
        li.append(texto);
        if (enlace) {
            const a = document.createElement('a');
            a.href = enlace;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = 'ver';
            li.append(' · ', a);
        }
        lista.append(li);
    }

    function pintarBloque(seccion, id) {
        const e = (estado && estado[`${id}:${seccion.dataset.tipo}`]) || {};
        const lista = seccion.querySelector('[data-auto-estado]');
        lista.replaceChildren();
        const redes = (seccion.dataset.redes || 'facebook,instagram').split(',');
        let publicadas = 0;
        for (const red of redes) {
            const nombre = NOMBRES[red] || red;
            const r = e[red];
            if (r && r.estado === 'publicado') {
                publicadas++;
                filaEstado(lista, `${nombre}: publicado el ${fecha(r.fecha)}`, r.enlace, 'rd-bien');
            } else if (r && r.estado === 'enviado') {
                publicadas++;
                filaEstado(lista, `${nombre}: enviado a tu bandeja el ${fecha(r.fecha)} (elige la música y publica en la app)`, '', 'rd-bien');
            } else if (r && r.estado === 'procesando') {
                filaEstado(lista, `${nombre}: TikTok lo está procesando; pulsa «Revisar estado» en unos minutos`, '', 'rd-espera');
            } else if (r && r.estado === 'error') {
                filaEstado(lista, `${nombre}: falló (${r.detalle})`, '', 'rd-mal');
            } else {
                filaEstado(lista, `${nombre}: sin publicar`, '', '');
            }
        }
        if (e.programado) filaEstado(lista, `Aprobado: saldrá solo el ${fecha(e.salida)}`, '', 'rd-espera');
        const completo = publicadas === redes.length;
        const boton = que => seccion.querySelector(`[data-accion="${que}"]`) || {};
        boton('publicar').hidden = completo;
        boton('tiktok').hidden = completo;
        const procesando = redes.some(red => e[red] && e[red].estado === 'procesando');
        boton('tiktok-revisar').hidden = !procesando;
        if (procesando) boton('tiktok').hidden = true;
        const directo = seccion.querySelector('[data-directo]');
        if (directo) directo.hidden = completo || procesando || !DIRECTO;
        boton('aprobar').hidden = completo || !!e.programado;
        boton('cancelar').hidden = !e.programado;
        seccion.classList.toggle('rd-completo', completo);
        return completo;
    }

    async function accion(boton) {
        const seccion = boton.closest('.rd-auto');
        const id = Number(boton.closest('.rd-post').dataset.id);
        const tipo = seccion.dataset.tipo;
        const que = boton.dataset.accion;
        // «Publicar ahora» y «Enviar a TikTok» piden un segundo toque para confirmar (evita envíos por accidente).
        if ((que === 'publicar' || que === 'tiktok') && boton.dataset.confirmar !== '1') {
            boton.dataset.confirmar = '1';
            avisoBoton(boton, que === 'tiktok' ? 'Toca otra vez para enviar' : 'Toca otra vez para publicar', false, 4000);
            setTimeout(() => { delete boton.dataset.confirmar; }, 4000);
            return;
        }
        delete boton.dataset.confirmar;
        clearTimeout(boton._aviso);
        if (boton.dataset.textoOriginal) boton.textContent = boton.dataset.textoOriginal;
        const botones = seccion.querySelectorAll('button');
        botones.forEach(b => { b.disabled = true; });
        const aviso = seccion.querySelector('[data-auto-estado]');
        aviso.replaceChildren();
        filaEstado(aviso, que === 'publicar'
            ? (tipo === 'reel' ? 'Publicando el video… Instagram puede tardar hasta 4 minutos en procesarlo.' : 'Publicando…')
            : ({ tiktok: 'Enviando a TikTok…', 'tiktok-revisar': 'Preguntando a TikTok…' }[que] || 'Guardando…'), '', 'rd-proceso');
        try {
            await llamar(que, { id, tipo });
        } catch (e) {
            filaEstado(aviso, 'No se pudo: ' + e.message, '', 'rd-mal');
            botones.forEach(b => { b.disabled = false; });
            return;
        }
        botones.forEach(b => { b.disabled = false; });
        pintar();
    }

    // ------------------------------------------------------------ TikTok: publicación directa
    // Normas de TikTok: mostrar la cuenta, privacidad sin valor por defecto, interacciones y contenido comercial
    // desmarcados, texto editable y aceptación de la música antes de publicar.

    const DIRECTO = main && (main.dataset.tiktokDirecto === '1' || new URLSearchParams(location.search).has('tiktok-directo'));
    const PRIVACIDAD = { PUBLIC_TO_EVERYONE: 'Todos', MUTUAL_FOLLOW_FRIENDS: 'Amigos', FOLLOWER_OF_CREATOR: 'Seguidores', SELF_ONLY: 'Solo yo' };
    let creador = null;

    async function abrirDirecto(panel) {
        const cuenta = panel.querySelector('[data-tt-cuenta]');
        try {
            if (!creador) creador = (await llamar('tiktok-info')).creador;
        } catch (e) {
            cuenta.textContent = 'No se pudo consultar tu cuenta de TikTok: ' + e.message;
            cuenta.className = 'rd-nota rd-mal';
            return;
        }
        cuenta.textContent = `Se publicará en la cuenta de TikTok: ${creador.nombre}${creador.usuario ? ' (@' + creador.usuario + ')' : ''}`;
        cuenta.className = 'rd-nota';
        const select = panel.querySelector('[data-tt-privacidad]');
        if (select.options.length === 1) {
            for (const valor of creador.privacidades) {
                const opcion = document.createElement('option');
                opcion.value = valor;
                opcion.textContent = PRIVACIDAD[valor] || valor;
                select.append(opcion);
            }
        }
        const bloquear = (nombre, sin) => {
            const casilla = panel.querySelector(`[data-tt="${nombre}"]`);
            if (!casilla) return;
            casilla.disabled = sin;
            if (sin) { casilla.checked = false; casilla.parentElement.title = 'Desactivado en la configuración de tu cuenta de TikTok'; }
        };
        bloquear('comentarios', creador.sinComentarios);
        bloquear('duo', creador.sinDuo);
        bloquear('stitch', creador.sinStitch);
        const segundos = Number(panel.closest('.rd-auto').dataset.segundos || 0);
        panel.dataset.largo = creador.maxSegundos && segundos > creador.maxSegundos ? '1' : '';
        if (panel.dataset.largo) {
            const estado = panel.querySelector('[data-tt-estado]');
            estado.replaceChildren();
            filaEstado(estado, `El video dura ${Math.round(segundos)} s y tu cuenta permite hasta ${creador.maxSegundos} s.`, '', 'rd-mal');
        }
        validarDirecto(panel);
    }

    function validarDirecto(panel) {
        const marcado = nombre => !!(panel.querySelector(`[data-tt="${nombre}"]`) || {}).checked;
        const comercial = marcado('comercial');
        panel.querySelector('[data-tt-comercial]').hidden = !comercial;
        const tuMarca = comercial && marcado('tuMarca');
        const deMarca = comercial && marcado('contenidoMarca');
        // El contenido de marca no puede ser privado: se deshabilita «Solo yo».
        const select = panel.querySelector('[data-tt-privacidad]');
        const soloYo = select.querySelector('option[value="SELF_ONLY"]');
        if (soloYo) {
            soloYo.disabled = deMarca;
            if (deMarca && select.value === 'SELF_ONLY') select.value = '';
        }
        const etiqueta = panel.querySelector('[data-tt-etiqueta]');
        etiqueta.hidden = !(tuMarca || deMarca);
        etiqueta.textContent = deMarca ? 'Tu publicación se etiquetará como «Colaboración pagada».'
            : 'Tu publicación se etiquetará como «Contenido promocional».';
        panel.querySelector('[data-tt-declaracion="musica"]').hidden = deMarca;
        panel.querySelector('[data-tt-declaracion="marca"]').hidden = !deMarca;
        const listo = creador && select.value && !(comercial && !tuMarca && !deMarca) && !panel.dataset.largo;
        panel.querySelector('[data-accion="tiktok-publicar"]').disabled = !listo;
    }

    async function publicarDirecto(boton) {
        const panel = boton.closest('[data-directo]');
        const seccion = panel.closest('.rd-auto');
        const marcado = nombre => !!(panel.querySelector(`[data-tt="${nombre}"]`) || {}).checked;
        const titulo = panel.querySelector('[data-tt-titulo]');
        const opciones = {
            privacidad: panel.querySelector('[data-tt-privacidad]').value,
            comentarios: marcado('comentarios'), duo: marcado('duo'), stitch: marcado('stitch'),
            comercial: marcado('comercial'), tuMarca: marcado('tuMarca'), contenidoMarca: marcado('contenidoMarca'),
            titulo: titulo ? titulo.value : '', texto: panel.querySelector('[data-tt-texto]').value, acepta: true
        };
        const estado = panel.querySelector('[data-tt-estado]');
        estado.replaceChildren();
        filaEstado(estado, 'Publicando en TikTok… puede tardar unos minutos en aparecer en tu perfil.', '', 'rd-proceso');
        boton.disabled = true;
        try {
            const r = await llamar('tiktok-publicar', { id: Number(seccion.closest('.rd-post').dataset.id), tipo: seccion.dataset.tipo, opciones });
            const t = (r.resultado || {}).tiktok || {};
            estado.replaceChildren();
            if (t.estado === 'error') filaEstado(estado, 'No se pudo: ' + t.detalle, '', 'rd-mal');
        } catch (e) {
            estado.replaceChildren();
            filaEstado(estado, 'No se pudo: ' + e.message, '', 'rd-mal');
        }
        validarDirecto(panel);
        pintar();
    }

    // ------------------------------------------------------------ pintar

    function pintar() {
        const marcas = almacen.leer(CLAVE_MARCAS, {});
        let enMarketplace = 0;
        let enRedes = 0;
        document.querySelectorAll('.rd-post').forEach(articulo => {
            const id = articulo.dataset.id;
            const casilla = articulo.querySelector('[data-red="marketplace"]');
            const mp = !!(marcas[id] && marcas[id].marketplace);
            if (casilla) casilla.checked = mp;
            if (mp) enMarketplace++;
            // Cada bloque (Facebook/Instagram, TikTok; fotos y video) se pinta con su estado.
            const completos = estado ? [...articulo.querySelectorAll('.rd-auto')].map(s => [s, pintarBloque(s, id)]) : [];
            const fotos = completos.filter(([s]) => s.dataset.tipo === 'fotos');
            const redes = fotos.some(([s, ok]) => !s.classList.contains('rd-tiktok') && ok);
            if (redes) enRedes++;
            // «Publicado en todas partes»: fotos en Facebook/Instagram y TikTok, y Marketplace marcado.
            articulo.classList.toggle('rd-completo', mp && fotos.length > 0 && fotos.every(([, ok]) => ok));
        });
        const p = document.querySelector('[data-progreso="marketplace"]');
        if (p) p.textContent = String(enMarketplace);
        const r = document.querySelector('[data-progreso="redes"]');
        if (r) r.textContent = estado ? String(enRedes) : '–';
        ocultarPublicados();
    }

    // Con muchos productos en la cola, los ya publicados en todas partes se ocultan (casilla de arriba).
    function ocultarPublicados() {
        const casilla = document.querySelector('[data-ocultar]');
        const ocultar = !casilla || casilla.checked;
        document.querySelectorAll('.rd-post').forEach(a => { a.hidden = ocultar && a.classList.contains('rd-completo'); });
    }

    // ------------------------------------------------------------ eventos

    document.addEventListener('click', evento => {
        const boton = evento.target.closest('[data-copiar]');
        if (boton) copiar(boton);
        const enviar = evento.target.closest('[data-compartir]');
        if (enviar) compartir(enviar);
        const directo = evento.target.closest('[data-accion="tiktok-publicar"]');
        if (directo) { publicarDirecto(directo); return; }
        const auto = evento.target.closest('.rd-auto [data-accion]');
        if (auto) accion(auto);
    });

    document.addEventListener('change', evento => {
        const panel = evento.target.closest('[data-directo]');
        if (panel) { validarDirecto(panel); return; }
        if (evento.target.closest('[data-ocultar]')) {
            ocultarPublicados();
            return;
        }
        const casilla = evento.target.closest('[data-red]');
        if (!casilla) return;
        const id = casilla.closest('.rd-post').dataset.id;
        const marcas = almacen.leer(CLAVE_MARCAS, {});
        marcas[id] = Object.assign({}, marcas[id], { [casilla.dataset.red]: casilla.checked });
        almacen.guardar(CLAVE_MARCAS, marcas);
        pintar();
    });

    document.addEventListener('toggle', evento => {
        if (evento.target.matches && evento.target.matches('[data-directo]') && evento.target.open) abrirDirecto(evento.target);
    }, true);
    document.addEventListener('input', evento => {
        const panel = evento.target.closest && evento.target.closest('[data-directo]');
        if (panel) validarDirecto(panel);
    });

    const form = document.querySelector('[data-clave-form]');
    if (form) {
        form.addEventListener('submit', evento => {
            evento.preventDefault();
            const campo = form.querySelector('input');
            almacen.guardar(CLAVE_ACCESO, campo.value.trim());
            campo.value = '';
            conectar();
        });
    }

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
    conectar();
}());
