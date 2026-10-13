/**
 * Funciones de compra compartidas por la portada y las fichas de producto:
 *  - Pedido de varios productos: se guarda en el navegador (localStorage), tiene un botón flotante y un panel
 *    donde se ajustan las cantidades y se envía UN solo mensaje a WhatsApp.
 *  - Favoritos: ids guardados en el navegador.
 * Todo queda en el dispositivo de la persona; no se envía a ningún servidor.
 *
 * API global: window.S3D = { pedido: {...}, favoritos: {...}, aviso(texto) }
 */
(function () {
    const RAIZ = new URL('./', document.currentScript.src).href;   // raíz del sitio (funciona en la portada y en las fichas)
    const WHATSAPP = '51955107609';
    const CLAVE_PEDIDO = 's3d.pedido';
    const CLAVE_FAVORITOS = 's3d.favoritos';

    const leer = (clave, defecto) => {
        try { const valor = JSON.parse(localStorage.getItem(clave)); return valor == null ? defecto : valor; } catch (error) { return defecto; }
    };
    const guardar = (clave, valor) => { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (error) { /* sin almacenamiento */ } };
    const dinero = numero => `S/ ${Number(numero).toFixed(2)}`;
    const track = (evento, datos) => { if (window.s3dTrack) window.s3dTrack(evento, datos); };
    const escapar = texto => String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

    const itemValido = item => item && Number.isFinite(item.id) && typeof item.nombre === 'string' && item.cantidad >= 1;
    let items = leer(CLAVE_PEDIDO, []).filter(itemValido);
    let favoritos = leer(CLAVE_FAVORITOS, []).filter(Number.isFinite);
    const oyentes = new Set();
    const avisar = () => oyentes.forEach(funcion => funcion());
    const claveDe = item => `${item.id}|${item.color || ''}`;

    window.addEventListener('storage', evento => {
        if (evento.key === CLAVE_PEDIDO) items = leer(CLAVE_PEDIDO, []).filter(itemValido);
        if (evento.key === CLAVE_FAVORITOS) favoritos = leer(CLAVE_FAVORITOS, []).filter(Number.isFinite);
        if (evento.key === CLAVE_PEDIDO || evento.key === CLAVE_FAVORITOS) avisar();
    });

    // ---------- Pedido ----------
    const totales = () => {
        let unidades = 0, total = 0, porCotizar = 0;
        items.forEach(item => {
            unidades += item.cantidad;
            if (item.cotizar || !item.precio) porCotizar += 1;
            else total += item.precio * item.cantidad;
        });
        return { unidades, total, porCotizar };
    };

    function mensajeWhatsApp() {
        const { total, porCotizar } = totales();
        const lineas = items.map((item, i) => {
            const detalle = [item.color ? `Color: ${item.color}` : null, item.medida ? `Medida: ${item.medida}` : null].filter(Boolean).join(', ');
            const precio = (item.cotizar || !item.precio) ? 'por cotizar' : `${dinero(item.precio)} c/u`;
            return `${i + 1}. ${item.cantidad} × ${item.nombre}${detalle ? ` (${detalle})` : ''} — ${precio}\n   ${RAIZ}producto/${item.slug}/`;
        });
        const resumen = total > 0 ? `Total referencial: ${dinero(total)} (incluye IGV)${porCotizar ? ' + productos por cotizar' : ''}.` : 'Todos los productos están por cotizar.';
        return `Hola, quiero hacer este pedido en S3D:\n\n${lineas.join('\n')}\n\n${resumen}\nSon productos elaborados a pedido y deseo consultar el costo de envío y los tiempos de entrega.`;
    }
    const urlWhatsApp = () => `https://api.whatsapp.com/send?phone=${WHATSAPP}&text=${encodeURIComponent(mensajeWhatsApp())}`;

    const pedido = {
        items: () => items.map(item => ({ ...item })),
        totales,
        agregar(item) {
            const nuevo = { ...item, cantidad: 1 };
            const existente = items.find(actual => claveDe(actual) === claveDe(nuevo));
            if (existente) existente.cantidad = Math.min(99, existente.cantidad + 1);
            else items.push(nuevo);
            guardar(CLAVE_PEDIDO, items);
            track('pedido_agregar', { producto: item.nombre });
            avisar();
            aviso(`Añadido al pedido: ${item.nombre}`);
        },
        cambiarCantidad(clave, delta) {
            const item = items.find(actual => claveDe(actual) === clave);
            if (!item) return;
            item.cantidad = Math.max(1, Math.min(99, item.cantidad + delta));
            guardar(CLAVE_PEDIDO, items);
            avisar();
        },
        quitar(clave) { items = items.filter(actual => claveDe(actual) !== clave); guardar(CLAVE_PEDIDO, items); avisar(); },
        vaciar() { items = []; guardar(CLAVE_PEDIDO, items); avisar(); },
        mensajeWhatsApp,
        abrir: () => abrirPanel(),
        alCambiar: funcion => oyentes.add(funcion)
    };

    // ---------- Favoritos ----------
    const api = {
        ids: () => [...favoritos],
        tiene: id => favoritos.includes(id),
        alternar(id, nombre) {
            const estaba = favoritos.includes(id);
            favoritos = estaba ? favoritos.filter(f => f !== id) : [...favoritos, id];
            guardar(CLAVE_FAVORITOS, favoritos);
            if (!estaba) track('favorito_agregar', { producto: nombre || String(id) });
            avisar();
            return !estaba;
        },
        alCambiar: funcion => oyentes.add(funcion)
    };

    // ---------- Interfaz ----------
    let fab, panel, fondo, lista, pie, aviso_, temporizador, retorno;

    function aviso(texto) {
        if (!aviso_) return;
        aviso_.textContent = texto;
        aviso_.classList.add('is-visible');
        clearTimeout(temporizador);
        temporizador = setTimeout(() => aviso_.classList.remove('is-visible'), 2600);
    }

    function renderizar() {
        const { unidades, total, porCotizar } = totales();
        fab.hidden = unidades === 0 && panel.hidden;
        fab.querySelector('.s3d-fab-cuenta').textContent = String(unidades);
        fab.setAttribute('aria-label', `Mi pedido: ${unidades} ${unidades === 1 ? 'producto' : 'productos'}`);
        if (panel.hidden) return;
        if (!items.length) {
            lista.innerHTML = '<p class="s3d-vacio">Tu pedido está vacío. Usa el botón con el signo + en cada producto para añadirlo.</p>';
            pie.hidden = true;
            return;
        }
        pie.hidden = false;
        lista.innerHTML = items.map(item => {
            const clave = claveDe(item);
            const detalle = [item.color ? `Color: ${item.color}` : null, item.medida || null].filter(Boolean).join(' · ');
            const precio = (item.cotizar || !item.precio) ? 'Por cotizar' : `${dinero(item.precio)} × ${item.cantidad} = ${dinero(item.precio * item.cantidad)}`;
            return `
            <li class="s3d-item" data-clave="${escapar(clave)}">
                <a class="s3d-item-img" href="${RAIZ}producto/${escapar(item.slug)}/" tabindex="-1" aria-hidden="true"><img src="${RAIZ}${escapar(item.imagen)}" alt="" loading="lazy"></a>
                <div class="s3d-item-info">
                    <a class="s3d-item-nombre" href="${RAIZ}producto/${escapar(item.slug)}/">${escapar(item.nombre)}</a>
                    ${detalle ? `<span class="s3d-item-detalle">${escapar(detalle)}</span>` : ''}
                    <span class="s3d-item-precio">${precio}</span>
                </div>
                <div class="s3d-item-acciones">
                    <div class="s3d-cantidad" role="group" aria-label="Cantidad de ${escapar(item.nombre)}">
                        <button type="button" data-delta="-1" aria-label="Quitar una unidad"${item.cantidad <= 1 ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-minus"/></svg></button>
                        <span aria-live="polite">${item.cantidad}</span>
                        <button type="button" data-delta="1" aria-label="Añadir una unidad"><svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg></button>
                    </div>
                    <button type="button" class="s3d-quitar" data-quitar aria-label="Quitar ${escapar(item.nombre)} del pedido"><svg class="ico" aria-hidden="true"><use href="#i-trash-2"/></svg></button>
                </div>
            </li>`;
        }).join('');
        pie.querySelector('.s3d-total-valor').textContent = total > 0 ? dinero(total) : 'Por cotizar';
        pie.querySelector('.s3d-total-nota').textContent = porCotizar
            ? `${total > 0 ? 'Más ' : ''}${porCotizar} ${porCotizar === 1 ? 'producto por cotizar' : 'productos por cotizar'}. El costo de envío se confirma por WhatsApp.`
            : 'Precios con IGV incluido. El costo de envío se confirma por WhatsApp.';
        pie.querySelector('.s3d-enviar').href = urlWhatsApp();
    }

    function abrirPanel() {
        retorno = document.activeElement;
        panel.hidden = false;
        fondo.hidden = false;
        document.body.classList.add('s3d-sin-scroll');
        renderizar();
        panel.querySelector('.s3d-cerrar').focus();
    }
    function cerrarPanel() {
        panel.hidden = true;
        fondo.hidden = true;
        document.body.classList.remove('s3d-sin-scroll');
        renderizar();
        if (retorno && document.contains(retorno)) retorno.focus();
    }

    function construir() {
        document.body.insertAdjacentHTML('beforeend', `
        <button type="button" id="s3d-fab" class="s3d-fab no-print" hidden>
            <svg class="ico ico-lg" aria-hidden="true"><use href="#i-shopping-bag"/></svg>
            <span class="s3d-fab-texto">Mi pedido</span><span class="s3d-fab-cuenta" aria-hidden="true">0</span>
        </button>
        <div id="s3d-fondo" class="s3d-fondo no-print" hidden></div>
        <aside id="s3d-panel" class="s3d-panel no-print" role="dialog" aria-modal="true" aria-labelledby="s3d-titulo" hidden>
            <header class="s3d-cabecera">
                <h2 id="s3d-titulo">Mi pedido</h2>
                <button type="button" class="s3d-cerrar" aria-label="Cerrar"><svg class="ico ico-lg" aria-hidden="true"><use href="#i-x"/></svg></button>
            </header>
            <ul class="s3d-lista" id="s3d-lista"></ul>
            <footer class="s3d-pie" id="s3d-pie" hidden>
                <div class="s3d-total"><span>Total referencial</span><strong class="s3d-total-valor"></strong></div>
                <p class="s3d-total-nota"></p>
                <a class="s3d-enviar" href="#" target="_blank" rel="noopener noreferrer"><svg class="ico" aria-hidden="true"><use href="#i-whatsapp"/></svg>Enviar pedido por WhatsApp</a>
                <button type="button" class="s3d-vaciar">Vaciar pedido</button>
            </footer>
        </aside>
        <div id="s3d-aviso" class="s3d-aviso no-print" role="status" aria-live="polite"></div>`);
        fab = document.getElementById('s3d-fab');
        panel = document.getElementById('s3d-panel');
        fondo = document.getElementById('s3d-fondo');
        lista = document.getElementById('s3d-lista');
        pie = document.getElementById('s3d-pie');
        aviso_ = document.getElementById('s3d-aviso');

        fab.addEventListener('click', abrirPanel);
        fondo.addEventListener('click', cerrarPanel);
        panel.querySelector('.s3d-cerrar').addEventListener('click', cerrarPanel);
        panel.querySelector('.s3d-vaciar').addEventListener('click', () => { pedido.vaciar(); });
        pie.querySelector('.s3d-enviar').addEventListener('click', () => track('pedido_enviar', { unidades: totales().unidades }));
        lista.addEventListener('click', evento => {
            const fila = evento.target.closest('.s3d-item');
            if (!fila) return;
            const clave = fila.dataset.clave;
            const delta = evento.target.closest('[data-delta]');
            if (delta) pedido.cambiarCantidad(clave, Number(delta.dataset.delta));
            else if (evento.target.closest('[data-quitar]')) pedido.quitar(clave);
        });
        document.addEventListener('keydown', evento => {
            if (panel.hidden) return;
            if (evento.key === 'Escape') { cerrarPanel(); return; }
            if (evento.key !== 'Tab') return;
            const foco = [...panel.querySelectorAll('a[href], button:not([disabled])')].filter(el => el.offsetParent !== null);
            if (!foco.length) return;
            const primero = foco[0], ultimo = foco[foco.length - 1];
            if (evento.shiftKey && document.activeElement === primero) { evento.preventDefault(); ultimo.focus(); }
            else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primero.focus(); }
        });
        pedido.alCambiar(renderizar);
        renderizar();
    }

    window.S3D = { pedido, favoritos: api, aviso, dinero, RAIZ };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', construir);
    else construir();
})();
