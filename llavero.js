/**
 * Personalizador «Diseña tu llavero» (/llavero/, D14).
 *  - Vista previa en SVG que cambia con cada opción. El nombre se escribe con textContent (nunca como HTML) y solo
 *    admite letras (con tildes y ñ), números, espacios, &, punto y guion, hasta data-max caracteres.
 *  - Precio por unidad según la cantidad (data-escalas del modelo: [[desde, precio], ...]) y total referencial.
 *  - «Pedir por WhatsApp»: registra el pedido (tienda.js, tipo «Comprar», con código S3D) y abre WhatsApp con todo el
 *    diseño. Sin tienda.js el enlace del HTML abre WhatsApp con un saludo genérico.
 *  - ?modelo=<id> elige el modelo al abrir (enlace desde la ficha del soporte para celular).
 */
(function () {
    const form = document.getElementById('ll-form');
    const dibujo = document.getElementById('ll-dibujo');
    const svg = document.getElementById('ll-svg');
    const boton = document.getElementById('ll-pedir');
    if (!form || !dibujo || !svg || !boton) return;

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const MAX = Number(form.dataset.max) || 12;
    const NO_PERMITIDOS = /[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ &.-]/g;
    const HAY_NO_PERMITIDOS = /[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ &.-]/;
    const FS = 100;   // tamaño de letra del dibujo (el viewBox se ajusta después)
    const HUECO = '#eef2f7';   // color del agujero de la argolla (el fondo de la vista previa)
    const nombre = document.getElementById('ll-nombre');
    const cantidad = document.getElementById('ll-cantidad');
    const cuenta = document.getElementById('ll-cuenta');
    const error = document.getElementById('ll-error');
    const contraste = document.getElementById('ll-contraste');
    const formas = document.getElementById('ll-formas');
    const total = document.getElementById('ll-total');
    const unitario = document.getElementById('ll-unitario');
    const titulo = document.getElementById('ll-svg-titulo');
    const PAGINA = location.href.split(/[?#]/)[0];
    const track = (evento, datos) => { if (window.s3dTrack) window.s3dTrack(evento, datos); };
    const dinero = numero => `S/ ${numero.toFixed(2)}`;
    const elegido = campo => form.querySelector(`input[name="${campo}"]:checked`);
    const limpiar = texto => String(texto).replace(NO_PERMITIDOS, '').replace(/\s+/g, ' ').replace(/^ /, '').slice(0, MAX);

    // Modelo pedido en la dirección (solo si existe entre las opciones).
    const pedido = new URLSearchParams(location.search).get('modelo');
    const radioPedido = [...form.querySelectorAll('input[name="modelo"]')].find(radio => radio.value === pedido);
    if (radioPedido) radioPedido.checked = true;

    function leerCantidad() {
        const n = Math.floor(Number(cantidad.value));
        return Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1;
    }

    function estado() {
        const modelo = elegido('modelo');
        let escalas;
        try { escalas = JSON.parse(modelo.dataset.escalas); } catch (e) { escalas = [[1, 0]]; }
        const n = leerCantidad();
        const escala = escalas.filter(([desde]) => n >= desde).pop() || escalas[0];
        const forma = modelo.dataset.formas === '1' ? elegido('forma') : null;
        const letra = elegido('letra'), base = elegido('base'), letras = elegido('letras');
        return {
            modelo: modelo.value, modeloNombre: modelo.dataset.nombre, registro: modelo.dataset.registro,
            forma: forma ? forma.value : 'soporte', formaNombre: forma ? forma.dataset.nombre : '',
            letra: letra.dataset.nombre, familia: letra.dataset.familia,
            base: base.value, baseHex: base.dataset.hex, letras: letras.value, letrasHex: letras.dataset.hex,
            nombre: nombre.value.trim(), cantidad: n, precio: escala[1], desde: escala[0]
        };
    }

    // ---------- Dibujo ----------
    const nuevo = (etiqueta, atributos, padre) => {
        const el = document.createElementNS(SVG_NS, etiqueta);
        Object.entries(atributos).forEach(([clave, valor]) => el.setAttribute(clave, valor));
        padre.appendChild(el);
        return el;
    };
    const oscurecer = (hex, factor) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * factor).toString(16).padStart(2, '0')).join('');
    const texto = (s, atributos, padre) => {
        const el = nuevo('text', Object.assign({ x: 0, y: 0, 'font-family': `'${s.familia}', sans-serif`, 'font-size': FS }, atributos), padre);
        el.textContent = s.nombre || 'Tu nombre';
        return el;
    };

    function dibujar() {
        const s = estado();
        dibujo.replaceChildren();
        const medida = texto(s, {}, dibujo);
        const caja = medida.getBBox();
        medida.remove();
        const sombra = oscurecer(s.baseHex, 0.72);
        const relieve = FS * 0.06;
        let agujero;
        if (s.forma === 'letras') {
            // Base que sigue el contorno de las letras: el mismo texto con un trazo grueso, y la argolla a la izquierda.
            const borde = FS * 0.32, r = FS * 0.2;
            agujero = { x: caja.x - borde / 2 - r * 0.55, y: caja.y + caja.height * 0.45 };
            [[relieve, sombra], [0, s.baseHex]].forEach(([dy, color]) => {
                const capa = nuevo('g', { transform: `translate(0 ${dy})` }, dibujo);
                nuevo('circle', { cx: agujero.x, cy: agujero.y, r, fill: color }, capa);
                texto(s, { fill: color, stroke: color, 'stroke-width': borde, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, capa);
            });
        } else {
            // Placa rectangular o soporte para celular (una barra con la pestaña que se abre a la derecha).
            const pad = FS * 0.22, aro = FS * 0.42;
            const x = caja.x - pad - aro, y = caja.y - pad * 0.8, ancho = caja.width + pad * 2 + aro, alto = caja.height + pad * 1.6;
            const pestana = s.forma === 'soporte' ? alto * 1.15 : 0;
            [[relieve, sombra], [0, s.baseHex]].forEach(([dy, color]) => {
                nuevo('rect', { x, y: y + dy, width: ancho + pestana, height: alto, rx: Math.min(alto * 0.3, FS * 0.3), fill: color }, dibujo);
            });
            if (pestana) {
                nuevo('line', { x1: x + ancho, y1: y + alto * 0.15, x2: x + ancho, y2: y + alto * 0.85, stroke: sombra, 'stroke-width': FS * 0.04, 'stroke-linecap': 'round' }, dibujo);
                nuevo('rect', { x: x + ancho + pestana * 0.25, y: y + alto * 0.32, width: pestana * 0.5, height: alto * 0.36, rx: alto * 0.12, fill: sombra, opacity: 0.55 }, dibujo);
            }
            agujero = { x: x + aro * 0.6, y: y + alto / 2 };
        }
        nuevo('circle', { cx: agujero.x, cy: agujero.y, r: FS * 0.09, fill: HUECO }, dibujo);
        const letras = texto(s, { fill: s.letrasHex, stroke: 'rgba(15,23,42,.18)', 'stroke-width': FS * 0.015, 'paint-order': 'stroke' }, dibujo);
        if (!s.nombre) letras.setAttribute('opacity', '0.55');
        // Argolla metálica que pasa por el agujero.
        nuevo('circle', { cx: agujero.x - FS * 0.3, cy: agujero.y, r: FS * 0.33, fill: 'none', stroke: '#9ca3af', 'stroke-width': FS * 0.05 }, dibujo);
        const todo = dibujo.getBBox(), margen = FS * 0.25;
        svg.setAttribute('viewBox', [todo.x - margen, todo.y - margen, todo.width + margen * 2, todo.height + margen * 2].map(n => n.toFixed(1)).join(' '));
        titulo.textContent = `Vista previa: ${s.modeloNombre}${s.formaNombre ? ` (${s.formaNombre})` : ''} con «${s.nombre || 'Tu nombre'}» en letra ${s.letra}, base ${s.base} y letras ${s.letras}`;
    }

    // ---------- Formulario ----------
    function actualizar() {
        const s = estado();
        cuenta.textContent = `${nombre.value.length}/${MAX}`;
        formas.hidden = !s.formaNombre;
        form.querySelectorAll('.ll-escalas').forEach(lista => {
            lista.hidden = lista.dataset.modelo !== s.modelo;
            lista.querySelectorAll('li').forEach(li => li.classList.toggle('ll-activa', Number(li.dataset.desde) === s.desde));
        });
        total.textContent = dinero(s.precio * s.cantidad);
        unitario.textContent = `${s.cantidad} × ${dinero(s.precio)}`;
        contraste.hidden = s.base !== s.letras;
        dibujar();
    }

    function mostrarError(texto) {
        error.textContent = texto;
        error.hidden = !texto;
        nombre.setAttribute('aria-invalid', texto ? 'true' : 'false');
    }

    nombre.addEventListener('input', () => {
        const valor = nombre.value;
        const limpio = limpiar(valor);
        if (limpio !== valor) nombre.value = limpio;
        mostrarError(HAY_NO_PERMITIDOS.test(valor) ? 'Solo letras, números, espacios, &, punto y guion.' : '');
        actualizar();
    });
    form.addEventListener('change', evento => {
        if (evento.target === cantidad) cantidad.value = leerCantidad();
        actualizar();
    });
    cantidad.addEventListener('input', actualizar);
    form.addEventListener('click', evento => {
        const delta = evento.target.closest('[data-delta]');
        if (!delta) return;
        cantidad.value = Math.min(999, Math.max(1, leerCantidad() + Number(delta.dataset.delta)));
        actualizar();
    });
    form.addEventListener('submit', evento => { evento.preventDefault(); boton.click(); });

    boton.addEventListener('click', evento => {
        const s = estado();
        if (!s.nombre) {
            evento.preventDefault();
            mostrarError('Escribe el nombre que llevará el llavero.');
            nombre.focus();
            return;
        }
        const lineas = [
            `• Modelo: ${s.modeloNombre}${s.formaNombre ? ` — ${s.formaNombre}` : ''}`,
            `• Nombre: ${s.nombre}`,
            `• Letra: ${s.letra}`,
            `• Colores: base ${s.base}, letras ${s.letras}`,
            `• Cantidad: ${s.cantidad} × ${dinero(s.precio)} = ${dinero(s.precio * s.cantidad)} (incluye IGV)`
        ];
        const mensaje = `Hola, quiero este llavero personalizado:\n${lineas.join('\n')}\nQuedo atento para confirmar el diseño, el envío y el tiempo de entrega.\n${PAGINA}`;
        const tienda = window.S3D;
        if (tienda) {
            const codigo = tienda.registrarPedido('comprar', {
                items: [{ nombre: s.registro, cantidad: s.cantidad, precio: s.precio, color: `base ${s.base}, letras ${s.letras}`, medida: [s.nombre, s.letra, s.formaNombre].filter(Boolean).join(', ') }],
                total: s.precio * s.cantidad,
                detalle: mensaje
            });
            boton.href = tienda.urlWhatsApp(tienda.conCodigo(codigo, mensaje));
            if (codigo) tienda.aviso(`Tu código de pedido: ${codigo}`);
        }
        track('llavero_pedir', { modelo: s.modelo, forma: s.forma, cantidad: s.cantidad });
    });

    actualizar();
    // Las letras propias llegan después del primer dibujo: se vuelve a medir cuando están listas.
    if (document.fonts) document.fonts.ready.then(dibujar).catch(() => {});
    form.addEventListener('change', evento => {
        if (evento.target.name === 'letra' && document.fonts) document.fonts.load(`${FS}px '${estado().familia}'`).then(dibujar).catch(() => {});
    });
})();
