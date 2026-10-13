(async function() {

        document.getElementById('current-year').textContent = new Date().getFullYear();

        // Las imágenes diferidas no se imprimen si no se han cargado: se fuerzan antes de imprimir.
        window.addEventListener('beforeprint', () => {
            document.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
        });

        // Menú móvil
        const navToggle = document.getElementById('nav-toggle');
        const mobileMenu = document.getElementById('mobile-menu');
        function cerrarMenuMovil() {
            mobileMenu.hidden = true;
            navToggle.setAttribute('aria-expanded', 'false');
            navToggle.setAttribute('aria-label', 'Abrir menú');
        }
        navToggle.addEventListener('click', () => {
            const abrir = mobileMenu.hidden;
            mobileMenu.hidden = !abrir;
            navToggle.setAttribute('aria-expanded', String(abrir));
            navToggle.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
        });
        mobileMenu.addEventListener('click', event => { if (event.target.closest('a')) cerrarMenuMovil(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && !mobileMenu.hidden) { cerrarMenuMovil(); navToggle.focus(); } });
        window.matchMedia('(min-width: 1024px)').addEventListener('change', event => { if (event.matches) cerrarMenuMovil(); });

        // Botón Volver Arriba: visible tras desplazarse, y oculto cuando el pie ya está a la vista
        // (ahí taparía los íconos de contacto).
        const btnArriba = document.getElementById('btn-volver-arriba');
        let pieVisible = false;
        const actualizarBtnArriba = () => btnArriba.classList.toggle('visible', window.scrollY > 500 && !pieVisible);
        window.addEventListener('scroll', actualizarBtnArriba, { passive: true });
        const pie = document.getElementById('contacto');
        if (pie && 'IntersectionObserver' in window) {
            new IntersectionObserver(([entrada]) => { pieVisible = entrada.isIntersecting; actualizarBtnArriba(); }).observe(pie);
        }

;

        let productos = [];

        const normalizar = value => String(value ?? '')
            .toLocaleLowerCase('es')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        const escaparHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));

        const ordenDeseado = [
            "Muñecos Coleccionables",
            "Adornos", 
            "Holders",
            "Barbería", 
            "Mascota", 
            "Llaveros", 
            "Line Art", 
            "Iluminación LED 3D", 
            "Dummy", 
            "Accesorios"
        ];
        
        let categoriasPresentes = [...new Set(productos.map(p => p.categoria))];
        let categorias = ["Todas"];
        
        ordenDeseado.forEach(cat => {
            if (categoriasPresentes.includes(cat)) categorias.push(cat);
        });

        let categoriaActual = "Todas";
        let terminoBusqueda = "";
        let ordenActual = "default";
        let debounceBusqueda;
        const filtersContainer = document.getElementById('category-filters');
        const sortSelect = document.getElementById('sort-select');
        const resultsCount = document.getElementById('results-count');

        function actualizarURL() {
            const params = new URLSearchParams();
            if (categoriaActual !== "Todas") params.set("categoria", categoriaActual);
            if (terminoBusqueda) params.set("buscar", terminoBusqueda);
            if (ordenActual !== "default") params.set("orden", ordenActual);
            const query = params.toString();
            history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
        }
        
        function renderFilters() {
            filtersContainer.innerHTML = categorias.map(cat => `
                <button 
                    onclick="filtrarPorCategoria('${cat}')"
                    class="category-filter px-4 py-2 text-sm font-semibold transition-all duration-300 whitespace-nowrap shrink-0
                    ${categoriaActual === cat 
                        ? 'category-filter-active text-brand-accent'
                        : 'text-gray-500 hover:text-brand-accent'}"
                >
                    ${cat === 'Novedades' ? '<span class="filter-new-dot" aria-hidden="true"></span>' : ''}${cat}
                </button>
            `).join('');
        }

        function renderFeaturedProducts() {
            const container = document.getElementById('hero-products');
            if (!container) return;
            // El primero (tile grande) lo marca heroOrden en productos.json; el resto sigue el orden del catálogo.
            const destacados = productos
                .filter(producto => producto.badge === 'Top Ventas')
                .sort((a, b) => (a.heroOrden ?? Infinity) - (b.heroOrden ?? Infinity))
                .slice(0, 4);
            container.innerHTML = destacados.map((producto, index) => {
                const imagen = producto.colores?.length ? producto.colores[0].img : producto.imagenes[0];
                const precio = producto.requiereCotizacion ? 'Cotizar' : `S/ ${producto.precio.toFixed(2)}`;
                return `
                <button type="button" class="hero-product" data-hero-product="${producto.id}" aria-label="Ver ${escaparHTML(producto.nombre)}">
                    <picture>
                        <source srcset="${imagen.replace(/\.(webp|png|jpe?g)$/i, '.avif')}" type="image/avif">
                        <img src="${imagen}" alt="${escaparHTML(producto.nombre)}"${producto.heroFoco ? ` style="object-position: ${escaparHTML(producto.heroFoco)}"` : ''} ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
                    </picture>
                    ${esNuevo(producto) ? '<span class="hero-product-new">Nuevo</span>' : ''}
                    <span class="hero-product-label"><strong>${escaparHTML(producto.nombre)}</strong><span>${precio}</span></span>
                </button>`;
            }).join('');
        }

        // Un producto es "nuevo" durante NUEVO_DIAS días a partir de su fechaAlta (AAAA-MM-DD).
        const NUEVO_DIAS = 14;
        function esNuevo(producto) {
            if (!producto.fechaAlta) return false;
            const [anio, mes, dia] = producto.fechaAlta.split('-').map(Number);
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const dias = Math.round((hoy - new Date(anio, mes - 1, dia)) / 86400000);
            return dias >= 0 && dias <= NUEVO_DIAS;
        }

        function mensajeWhatsApp(producto, colorNombre) {
            const color = colorNombre ? ` (Color: ${colorNombre})` : '';
            const base = producto.requiereCotizacion
                ? `Hola, me interesa cotizar el modelo 3D: ${producto.nombre}${color}.`
                : `Hola, me interesa el modelo 3D: ${producto.nombre}${color} - Precio: S/ ${producto.precio.toFixed(2)} (incluye IGV).`;
            const enlace = producto.slug ? `\n${new URL(`producto/${producto.slug}/`, document.baseURI).href}` : '';
            return `${base} Es un producto elaborado a pedido y deseo consultar el costo de envío.${enlace}`;
        }

        const urlWhatsApp = (producto, colorNombre) =>
            `https://api.whatsapp.com/send?phone=51955107609&text=${encodeURIComponent(mensajeWhatsApp(producto, colorNombre))}`;

        function generarHTMLProductoCarrusel(producto) {
            const tieneColores = Array.isArray(producto.colores) && producto.colores.length > 0;
            const img = tieneColores ? producto.colores[0].img : producto.imagenes[0];
            const rutaAvif = img ? img.replace(/\.(webp|png|jpe?g)$/i, '.avif') : '';
            const colorInicial = tieneColores ? producto.colores[0].nombre : null;

            const coloresHTML = tieneColores ? `
                <div class="catalog-carousel-swatches" role="group" aria-label="Colores disponibles de ${escaparHTML(producto.nombre)}">
                    ${producto.colores.map((color, index) => `
                    <button type="button" data-color-product="${producto.id}" data-color-index="${index}" class="catalog-carousel-swatch${index === 0 ? ' is-active' : ''}" style="background-color: ${escaparHTML(color.hex)};" aria-label="Color ${escaparHTML(color.nombre)}" aria-pressed="${index === 0}" title="${escaparHTML(color.nombre)}"></button>`).join('')}
                </div>
                <p class="catalog-carousel-color-name" data-color-label aria-live="polite">Color: ${escaparHTML(colorInicial)}</p>` : '';

            const miniaturasHTML = tieneColores ? '' : producto.imagenes.map((imagen, index) => `
                <button type="button" data-carousel-thumbnail="${producto.id}" data-carousel-index="${index}" class="catalog-carousel-thumbnail${index === 0 ? ' is-active' : ''}" aria-label="Mostrar imagen ${index + 1} de ${producto.nombre}">
                    <img src="${imagen}" loading="lazy" decoding="async" alt="">
                </button>
            `).join('') + (producto.video ? `
                <button type="button" data-carousel-thumbnail="${producto.id}" data-carousel-index="${producto.imagenes.length}" data-carousel-video="${producto.video}" class="catalog-carousel-thumbnail catalog-carousel-thumbnail-video" aria-label="Ver video de ${producto.nombre}">
                    <span aria-hidden="true">▶</span>
                </button>
            ` : '');

            return `
            <article id="producto-${producto.id}" class="catalog-carousel-card${esNuevo(producto) ? ' is-new' : ''}">
                <div data-lightbox-product="${producto.id}" class="catalog-carousel-image" role="button" tabindex="0" aria-label="Ver ${producto.nombre} en grande">
                    ${esNuevo(producto) ? '<span class="catalog-new-ribbon" aria-hidden="true"><span>Nuevo</span></span><span class="sr-only">Producto nuevo</span>' : ''}
                    ${producto.badge ? `<span class="catalog-carousel-badge">${producto.badge}</span>` : ''}
                    <picture>
                        <source data-carousel-main-source srcset="${rutaAvif}" type="image/avif">
                        <img data-carousel-main-image src="${img}" loading="lazy" decoding="async" alt="${producto.nombre}" onerror="this.src='https://placehold.co/700x700/f3f7fb/003366?text=Sin+Foto'">
                    </picture>
                    ${producto.video ? `<video data-carousel-main-video src="${producto.video}" class="hidden absolute inset-0 h-full w-full object-contain" controls playsinline preload="none"></video>` : ''}
                    <span class="catalog-carousel-expand" aria-hidden="true"><i data-lucide="maximize-2" class="w-4 h-4"></i></span>
                </div>
                ${tieneColores ? coloresHTML : `<div class="catalog-carousel-thumbnails" aria-label="Miniaturas de ${producto.nombre}">
                    ${miniaturasHTML}
                </div>`}
                <div class="catalog-carousel-info">
                    <p class="catalog-card-kicker">${escaparHTML(producto.coleccion || producto.categoria)}</p>
                    <h3>${producto.slug ? `<a href="producto/${producto.slug}/" class="catalog-card-link">${producto.nombre}</a>` : producto.nombre}</h3>
                    <div class="catalog-carousel-meta">
                        <span>${producto.requiereCotizacion ? 'Cotizar' : `S/ ${producto.precio.toFixed(2)}`}</span>
                        <span>${[producto.medida, producto.material].filter(Boolean).join(' · ')}</span>
                    </div>
                    <a href="${urlWhatsApp(producto, colorInicial)}" data-carousel-buy target="_blank" rel="noopener noreferrer" class="catalog-carousel-buy">Comprar</a>
                </div>
            </article>`;
        }

        const mainContainer = document.getElementById('main-content');
        
        function renderizarProductos() {
            renderFilters();
            
            const productosFiltrados = productos.filter(p => {
                const cumpleCategoria = categoriaActual === "Todas" || (categoriaActual === "Novedades" ? esNuevo(p) : p.categoria === categoriaActual);
                const cumpleBusqueda = terminoBusqueda === "" || 
                    normalizar(p.nombre).includes(normalizar(terminoBusqueda)) || 
                    normalizar(p.descripcion).includes(normalizar(terminoBusqueda)) ||
                    (p.coleccion && normalizar(p.coleccion).includes(normalizar(terminoBusqueda)));
                
                return cumpleCategoria && cumpleBusqueda;
            });
            const productosOrdenados = [...productosFiltrados];
            // Los productos "a cotizar" no tienen precio publicado: siempre van al final del orden por precio.
            const precioOrden = p => (p.requiereCotizacion || !p.precio) ? Infinity : p.precio;
            const compararPrecio = direccion => (a, b) => {
                const pa = precioOrden(a);
                const pb = precioOrden(b);
                if (pa === pb) return 0;
                if (pa === Infinity) return 1;
                if (pb === Infinity) return -1;
                return direccion * (pa - pb);
            };
            // "Más recientes": por fecha de alta, del más nuevo al más antiguo (a igual fecha, el orden del catálogo).
            const enNovedades = categoriaActual === "Novedades";
            if (ordenActual === "recent" || (enNovedades && ordenActual === "default")) {
                productosOrdenados.sort((a, b) => (b.fechaAlta || '').localeCompare(a.fechaAlta || ''));
            }
            if (ordenActual === "price-asc") productosOrdenados.sort(compararPrecio(1));
            if (ordenActual === "price-desc") productosOrdenados.sort(compararPrecio(-1));
            if (ordenActual === "name") productosOrdenados.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
            // Con un orden explícito la lista se muestra plana: agrupar por categoría rompería el orden global.
            const ordenGlobal = ordenActual !== "default" || enNovedades;
            if (resultsCount) resultsCount.textContent = `${productosOrdenados.length} ${productosOrdenados.length === 1 ? "producto encontrado" : "productos encontrados"}`;
            actualizarURL();

            let grupos = [];
            if (ordenGlobal) {
                if (productosOrdenados.length) {
                    grupos.push({ categoria: categoriaActual !== "Todas" ? categoriaActual : (ordenActual === "recent" ? "Más recientes" : "Todos los productos"), items: productosOrdenados });
                }
            } else {
                ordenDeseado.forEach(cat => {
                    const items = productosOrdenados.filter(p => p.categoria === cat);
                    if (items.length) grupos.push({ categoria: cat, items });
                });
            }

            let htmlCompleto = '';

            for (const { categoria, items } of grupos) {

                let extraHeaderNote = '';
                if (categoria === "Holders") {
                    extraHeaderNote = `<p class="text-sm text-brand-accent font-semibold mt-2">✨ Exclusivos organizadores de escritorio impresos en 3D. Personalizables de tu equipo de preferencia.</p>`;
                } else if (categoria === "Accesorios") {
                    extraHeaderNote = `<p class="text-sm text-brand-accent font-semibold mt-2">✨ Personaliza el color y el nombre inscrito en él a tu gusto.</p>`;
                } else if (categoria === "Mascota") {
                    extraHeaderNote = `<p class="text-sm text-brand-accent font-semibold mt-2">🐾 Placas de identificación. Disponibles en hermosos colores por modelo.</p>`;
                } else if (categoria === "Iluminación LED 3D") {
                    extraHeaderNote = `<p class="text-sm text-brand-accent font-semibold mt-2">💡 Diseños únicos iluminados para resaltar cualquier espacio.</p>`;
                }

                let categoryBanner = '';
                if (categoria === "Mascota") {
                    categoryBanner = `
                    <div class="bg-gradient-to-r from-[#003366] to-[#004d99] rounded-[2rem] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-8 mb-10 shadow-float text-white border border-white/10 relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                        <div class="max-w-xl relative z-10">
                            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold tracking-widest uppercase mb-4 shadow-sm backdrop-blur-sm">
                                <i data-lucide="info" class="w-3.5 h-3.5"></i> Video Explicativo
                            </div>
                            <h3 class="font-title text-2xl md:text-3xl font-bold mb-3 tracking-tight">¿Cómo funcionan nuestras placas?</h3>
                            <p class="text-brand-light text-sm md:text-base leading-relaxed opacity-90">Mira esta breve presentación donde detallamos las funcionalidades, los materiales y por qué son la opción ideal para mantener seguro a tu engreído.</p>
                        </div>
                        <div class="w-full md:w-80 shrink-0 relative z-10">
                            <button onclick="abrirVideoGeneral('assets/video/pet-video-presentacion.mp4')" class="w-full aspect-video bg-black/60 rounded-2xl border border-white/20 hover:border-brand-accent flex items-center justify-center group overflow-hidden relative transition-all shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:-translate-y-1" title="Reproducir Video">
                                <img src="assets/pet-video-poster.webp" class="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity duration-300" onerror="this.src='https://placehold.co/600x337/002244/ffffff?text=Ver+Video'">
                                <div class="w-14 h-14 rounded-full bg-brand-accent flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(0,102,204,0.6)] z-10">
                                    <i data-lucide="play" class="w-6 h-6 text-white ml-1 fill-white"></i>
                                </div>
                            </button>
                        </div>
                    </div>
                    `;
                }

                htmlCompleto += `
                    <div class="mb-16 first:mt-0 mt-8">
                        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                            <div>
                                <h2 class="font-title text-3xl font-bold text-brand-900">${escaparHTML(categoria)}</h2>
                                <div class="w-12 h-1 bg-brand-accent mt-3 rounded-full"></div>
                                ${extraHeaderNote}
                            </div>
                            <span class="text-sm font-semibold text-gray-500 bg-white px-4 py-1.5 rounded-full w-fit shadow-sm border border-gray-200">${items.length} modelos</span>
                        </div>
                        ${categoryBanner}
                        <div class="catalog-carousel-shell">
                            <div class="catalog-carousel-track">
                                ${items.map(producto => generarHTMLProductoCarrusel(producto)).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }

            mainContainer.innerHTML = htmlCompleto || `
                <div class="text-center py-20 px-4 bg-white rounded-3xl border border-gray-100 shadow-sm mt-8">
                    <div class="w-20 h-20 bg-brand-light rounded-full flex items-center justify-center mx-auto mb-6 text-brand-accent">
                        <i data-lucide="search-x" class="w-10 h-10"></i>
                    </div>
                    <h3 class="font-title text-2xl font-bold text-gray-900 mb-3">No encontramos resultados</h3>
                    <p class="text-gray-500 text-lg">Intenta buscar con otros términos o cambia de categoría.</p>
                </div>
            `;

            mainContainer.querySelectorAll('.catalog-carousel-thumbnail').forEach(thumbnail => {
                thumbnail.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const card = thumbnail.closest('.catalog-carousel-card');
                    const index = Number(thumbnail.dataset.carouselIndex);
                    const product = productos.find(item => item.id === Number(thumbnail.dataset.carouselThumbnail));
                    const mainImage = card?.querySelector('[data-carousel-main-image]');
                    const mainSource = card?.querySelector('[data-carousel-main-source]');
                    const mainPicture = mainSource?.parentElement;
                    const mainVideo = card?.querySelector('[data-carousel-main-video]');
                    if (!product || !mainImage || !Number.isInteger(index)) return;
                    if (index === product.imagenes.length && product.video && mainVideo) {
                        if (mainPicture) mainPicture.style.display = 'none';
                        mainImage.style.display = 'none';
                        mainVideo.style.display = 'block';
                        mainVideo.play().catch(() => {});
                        card.querySelector('.catalog-carousel-image').dataset.lightboxIndex = String(index);
                    } else if (product.imagenes[index]) {
                        const image = product.imagenes[index];
                        mainVideo?.pause();
                        if (mainPicture) mainPicture.style.display = 'block';
                        mainImage.style.display = 'block';
                        if (mainVideo) mainVideo.style.display = 'none';
                        mainImage.src = image;
                        if (mainSource) mainSource.srcset = image.replace(/\.(webp|png|jpe?g)$/i, '.avif');
                        card.querySelector('.catalog-carousel-image').dataset.lightboxIndex = String(index);
                    } else return;
                    card.querySelectorAll('.catalog-carousel-thumbnail').forEach(item => item.classList.remove('is-active'));
                    thumbnail.classList.add('is-active');
                });
            });

            mainContainer.querySelectorAll('.catalog-carousel-swatch').forEach(swatch => {
                swatch.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const card = swatch.closest('.catalog-carousel-card');
                    const product = productos.find(item => item.id === Number(swatch.dataset.colorProduct));
                    const color = product?.colores?.[Number(swatch.dataset.colorIndex)];
                    const mainImage = card?.querySelector('[data-carousel-main-image]');
                    const mainSource = card?.querySelector('[data-carousel-main-source]');
                    if (!product || !color || !mainImage) return;
                    mainImage.src = color.img;
                    if (mainSource) mainSource.srcset = color.img.replace(/\.(webp|png|jpe?g)$/i, '.avif');
                    card.querySelector('.catalog-carousel-image').dataset.lightboxIndex = swatch.dataset.colorIndex;
                    card.querySelectorAll('.catalog-carousel-swatch').forEach(item => {
                        const activo = item === swatch;
                        item.classList.toggle('is-active', activo);
                        item.setAttribute('aria-pressed', String(activo));
                    });
                    const label = card.querySelector('[data-color-label]');
                    if (label) label.textContent = `Color: ${color.nombre}`;
                    const buy = card.querySelector('[data-carousel-buy]');
                    if (buy) buy.href = urlWhatsApp(product, color.nombre);
                });
            });

            mainContainer.querySelectorAll('.catalog-carousel-image').forEach(viewer => {
                const openLightbox = () => window.abrirModal(Number(viewer.dataset.lightboxProduct), Number(viewer.dataset.lightboxIndex || 0));
                viewer.addEventListener('click', openLightbox);
                viewer.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openLightbox();
                    }
                });
            });

            lucide.createIcons();
        }

        window.filtrarPorCategoria = function(categoria) {
            categoriaActual = categoria;
            renderizarProductos();
        };

        document.addEventListener('click', event => {
            const tile = event.target.closest('[data-hero-product]');
            if (tile) window.abrirModal(Number(tile.dataset.heroProduct));
        });

        document.getElementById('search-input').addEventListener('input', function(e) {
            terminoBusqueda = e.target.value;
            clearTimeout(debounceBusqueda);
            debounceBusqueda = setTimeout(renderizarProductos, 250);
        });

        sortSelect.addEventListener('change', function(e) {
            ordenActual = e.target.value;
            renderizarProductos();
        });

        // ---------- Lightbox ----------
        let currentLightboxMediaArray = [];
        let currentLightboxIndex = 0;
        let currentLightboxProduct = null;
        let lightboxReturnFocus = null;
        const zoom = { scale: 1, x: 0, y: 0 };
        const ZOOM_MAX = 4;

        const lightboxEl = document.getElementById('lightbox');
        const stageEl = document.getElementById('lightbox-stage');
        const imgEl = document.getElementById('lightbox-img');
        const sourceEl = document.getElementById('lightbox-source');
        const vidEl = document.getElementById('lightbox-vid');
        const avifDe = ruta => ruta.replace(/\.(webp|png|jpe?g)$/i, '.avif');

        function aplicarZoom() {
            imgEl.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
            imgEl.classList.toggle('is-zoomed', zoom.scale > 1);
        }

        function limitarZoom() {
            const maxX = Math.max(0, (imgEl.clientWidth * zoom.scale - stageEl.clientWidth) / 2);
            const maxY = Math.max(0, (imgEl.clientHeight * zoom.scale - stageEl.clientHeight) / 2);
            zoom.x = Math.min(maxX, Math.max(-maxX, zoom.x));
            zoom.y = Math.min(maxY, Math.max(-maxY, zoom.y));
        }

        function reiniciarZoom() {
            zoom.scale = 1; zoom.x = 0; zoom.y = 0;
            imgEl.classList.remove('is-dragging');
            aplicarZoom();
        }

        // Zoom manteniendo fijo el punto (cx, cy), relativo al centro de la imagen.
        function cambiarZoom(nuevaEscala, cx = 0, cy = 0) {
            const escala = Math.min(ZOOM_MAX, Math.max(1, nuevaEscala));
            const razon = escala / zoom.scale;
            zoom.x = cx - razon * (cx - zoom.x);
            zoom.y = cy - razon * (cy - zoom.y);
            zoom.scale = escala;
            if (escala === 1) { zoom.x = 0; zoom.y = 0; }
            limitarZoom();
            aplicarZoom();
        }

        const centroImagen = () => {
            // Centro sin traslación: getBoundingClientRect ya incluye la transformación actual.
            const r = imgEl.getBoundingClientRect();
            return { x: r.left + r.width / 2 - zoom.x, y: r.top + r.height / 2 - zoom.y };
        };
        const imagenActiva = () => currentLightboxMediaArray[currentLightboxIndex]?.type === 'img';

        function abrirLightbox(mediaArray, indice, producto) {
            currentLightboxMediaArray = mediaArray;
            currentLightboxProduct = producto;
            currentLightboxIndex = Number.isInteger(indice) && indice >= 0 && indice < mediaArray.length ? indice : 0;
            lightboxReturnFocus = document.activeElement;
            actualizarLightbox();
            lightboxEl.classList.add('active');
            document.body.style.overflow = 'hidden';
            document.getElementById('lightbox-close').focus();
        }

        window.abrirVideoGeneral = function(src) {
            abrirLightbox([{ type: 'vid', src }], 0, null);
        };

        window.abrirModal = function(productoId, initialIndex = 0) {
            const prod = productos.find(p => p.id === productoId);
            if (!prod) return;
            const imagenes = prod.colores?.length
                ? prod.colores.map(color => ({ type: 'img', src: color.img, color: color.nombre }))
                : prod.imagenes.map(src => ({ type: 'img', src }));
            if (prod.video) imagenes.push({ type: 'vid', src: prod.video });
            abrirLightbox(imagenes, initialIndex, prod);
        };

        window.cerrarModal = function(event, forceClose = false) {
            if (!forceClose && event.target.id !== 'lightbox') return;
            lightboxEl.classList.remove('active');
            document.body.style.overflow = 'auto';
            vidEl.pause();
            reiniciarZoom();
            if (lightboxReturnFocus && document.contains(lightboxReturnFocus)) lightboxReturnFocus.focus();
            lightboxReturnFocus = null;
        };

        window.cambiarImagenLightbox = function(direccion, event) {
            if (event) event.stopPropagation();
            const total = currentLightboxMediaArray.length;
            if (total <= 1) return;
            currentLightboxIndex = (currentLightboxIndex + direccion + total) % total;
            actualizarLightbox();
        };

        function irALightbox(indice) {
            currentLightboxIndex = indice;
            actualizarLightbox();
        }

        function actualizarLightbox() {
            const media = currentLightboxMediaArray[currentLightboxIndex];
            if (!media) return;
            const total = currentLightboxMediaArray.length;

            imgEl.classList.add('hidden');
            vidEl.classList.add('hidden');
            vidEl.pause();
            reiniciarZoom();

            if (media.type === 'img') {
                sourceEl.srcset = avifDe(media.src);
                imgEl.src = media.src;
                imgEl.classList.remove('hidden');
                // Precarga las imágenes vecinas para que el cambio sea inmediato.
                [1, -1].forEach(d => {
                    const vecina = currentLightboxMediaArray[(currentLightboxIndex + d + total) % total];
                    if (vecina?.type === 'img') new Image().src = vecina.src;
                });
            } else {
                vidEl.src = media.src;
                vidEl.classList.remove('hidden');
                vidEl.play().catch(() => {});
            }

            document.getElementById('lightbox-prev').style.display = total > 1 ? 'flex' : 'none';
            document.getElementById('lightbox-next').style.display = total > 1 ? 'flex' : 'none';
            document.getElementById('lightbox-counter').textContent = `${currentLightboxIndex + 1} / ${total}`;
            document.getElementById('lightbox-counter').style.display = total > 1 ? 'block' : 'none';
            document.getElementById('lightbox-tools').style.display = media.type === 'img' ? 'flex' : 'none';

            const thumbs = document.getElementById('lightbox-thumbs');
            thumbs.style.display = total > 1 ? 'flex' : 'none';
            thumbs.innerHTML = total > 1 ? currentLightboxMediaArray.map((item, i) => `
                <button type="button" class="lightbox-thumb${i === currentLightboxIndex ? ' is-active' : ''}" data-lightbox-thumb="${i}" aria-label="${item.type === 'vid' ? 'Ver video' : `Ver imagen ${i + 1}`}"${i === currentLightboxIndex ? ' aria-current="true"' : ''}>
                    ${item.type === 'vid' ? '<span aria-hidden="true">▶</span>' : `<img src="${item.src}" alt="" loading="lazy" decoding="async">`}
                </button>`).join('') : '';

            const info = document.getElementById('lightbox-info');
            const prod = currentLightboxProduct;
            info.classList.toggle('no-product', !prod);
            if (prod) {
                document.getElementById('lightbox-title').textContent = prod.nombre;
                document.getElementById('lightbox-new').hidden = !esNuevo(prod);
                const partes = [prod.requiereCotizacion ? 'Cotizar' : `S/ ${prod.precio.toFixed(2)}`, media.color ? `Color: ${media.color}` : null, prod.medida].filter(Boolean);
                document.getElementById('lightbox-meta').textContent = partes.join(' · ');
                const buy = document.getElementById('lightbox-buy');
                buy.href = urlWhatsApp(prod, media.color || null);
                buy.textContent = prod.requiereCotizacion ? 'Cotizar' : 'Comprar';
            }
        }

        document.getElementById('lightbox-thumbs').addEventListener('click', event => {
            event.stopPropagation();
            const boton = event.target.closest('[data-lightbox-thumb]');
            if (boton) irALightbox(Number(boton.dataset.lightboxThumb));
        });
        document.getElementById('lightbox-zoom-in').addEventListener('click', event => { event.stopPropagation(); cambiarZoom(zoom.scale * 1.5); });
        document.getElementById('lightbox-zoom-out').addEventListener('click', event => { event.stopPropagation(); cambiarZoom(zoom.scale / 1.5); });
        document.getElementById('lightbox-zoom-reset').addEventListener('click', event => { event.stopPropagation(); reiniciarZoom(); });

        // Rueda del ratón: zoom hacia el cursor.
        stageEl.addEventListener('wheel', event => {
            if (!imagenActiva()) return;
            event.preventDefault();
            const c = centroImagen();
            cambiarZoom(zoom.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX - c.x, event.clientY - c.y);
        }, { passive: false });

        // Gestos: arrastrar para mover, pellizco para zoom, deslizar para cambiar de foto, doble toque/clic para ampliar.
        const punteros = new Map();
        let gesto = null;
        let ultimoToque = { t: 0, x: 0, y: 0 };

        stageEl.addEventListener('pointerdown', event => {
            if (!imagenActiva() || event.target.closest('button')) return;
            stageEl.setPointerCapture(event.pointerId);
            punteros.set(event.pointerId, { x: event.clientX, y: event.clientY });
            gesto = {
                inicioX: event.clientX, inicioY: event.clientY, inicioT: Date.now(),
                enFondo: event.target === stageEl, zoomX: zoom.x, zoomY: zoom.y, movido: false, pellizco: punteros.size === 2 ? distanciaPunteros() : null, escalaInicial: zoom.scale
            };
            if (punteros.size === 2) gesto.pellizco = distanciaPunteros();
        });

        function distanciaPunteros() {
            const [a, b] = [...punteros.values()];
            return Math.hypot(a.x - b.x, a.y - b.y);
        }

        stageEl.addEventListener('pointermove', event => {
            if (!punteros.has(event.pointerId) || !gesto) return;
            punteros.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (punteros.size === 2 && gesto.pellizco) {
                const [a, b] = [...punteros.values()];
                const c = centroImagen();
                gesto.movido = true;
                cambiarZoom(gesto.escalaInicial * distanciaPunteros() / gesto.pellizco, (a.x + b.x) / 2 - c.x, (a.y + b.y) / 2 - c.y);
                return;
            }
            const dx = event.clientX - gesto.inicioX;
            const dy = event.clientY - gesto.inicioY;
            if (Math.hypot(dx, dy) > 8) gesto.movido = true;
            if (zoom.scale > 1 && gesto.movido) {
                zoom.x = gesto.zoomX + dx;
                zoom.y = gesto.zoomY + dy;
                limitarZoom();
                imgEl.classList.add('is-dragging');
                aplicarZoom();
            }
        });

        function terminarPuntero(event) {
            if (!punteros.has(event.pointerId) || !gesto) return;
            const eraUnico = punteros.size === 1;
            punteros.delete(event.pointerId);
            imgEl.classList.remove('is-dragging');
            if (!eraUnico) { gesto = null; return; }
            const dx = event.clientX - gesto.inicioX;
            const dy = event.clientY - gesto.inicioY;
            const toque = !gesto.movido && Date.now() - gesto.inicioT < 400;
            if (toque) {
                const ahora = Date.now();
                const dobleToque = ahora - ultimoToque.t < 320 && Math.hypot(event.clientX - ultimoToque.x, event.clientY - ultimoToque.y) < 30;
                if (dobleToque) {
                    const c = centroImagen();
                    cambiarZoom(zoom.scale > 1 ? 1 : 2.5, event.clientX - c.x, event.clientY - c.y);
                    ultimoToque = { t: 0, x: 0, y: 0 };
                } else {
                    ultimoToque = { t: ahora, x: event.clientX, y: event.clientY };
                    if (gesto.enFondo) cerrarModal(event, true);
                }
            } else if (zoom.scale === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                cambiarImagenLightbox(dx < 0 ? 1 : -1);
            }
            gesto = null;
        }
        stageEl.addEventListener('pointerup', terminarPuntero);
        stageEl.addEventListener('pointercancel', event => { punteros.delete(event.pointerId); gesto = null; imgEl.classList.remove('is-dragging'); });

        document.addEventListener('keydown', function(event) {
            if (!lightboxEl.classList.contains('active')) return;
            if (event.key === 'Escape') cerrarModal(event, true);
            else if (event.key === 'ArrowRight') cambiarImagenLightbox(1);
            else if (event.key === 'ArrowLeft') cambiarImagenLightbox(-1);
            else if (event.key === '+' || event.key === '=') cambiarZoom(zoom.scale * 1.5);
            else if (event.key === '-') cambiarZoom(zoom.scale / 1.5);
            else if (event.key === '0') reiniciarZoom();
            else if (event.key === 'Tab') {
                // Mantiene el foco dentro del diálogo.
                const foco = [...lightboxEl.querySelectorAll('button, a[href], video[controls]')].filter(el => el.offsetParent !== null);
                if (!foco.length) return;
                const primero = foco[0], ultimo = foco[foco.length - 1];
                if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo.focus(); }
                else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus(); }
                else if (!lightboxEl.contains(document.activeElement)) { event.preventDefault(); primero.focus(); }
            }
        });

        lucide.createIcons();

    async function cargarProductos() {
        try {
            const response = await fetch('productos.json?v=nuevo-2');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            productos = await response.json();
            const ids = new Set();
            productos.forEach(producto => {
                if (ids.has(producto.id)) throw new Error(`ID de producto duplicado: ${producto.id}`);
                if (!producto.nombre || !producto.categoria || !Array.isArray(producto.imagenes) || producto.imagenes.length === 0) {
                    throw new Error(`Producto incompleto: ${producto.id}`);
                }
                ids.add(producto.id);
            });
            categoriasPresentes = [...new Set(productos.map(p => p.categoria))];
            categorias = ["Todas"];
            ordenDeseado.forEach(cat => {
                if (categoriasPresentes.includes(cat)) categorias.push(cat);
            });
            // "Novedades" solo existe mientras haya productos con el aviso "Nuevo" vigente.
            if (productos.some(esNuevo)) categorias.splice(1, 0, "Novedades");
            const params = new URLSearchParams(window.location.search);
            const requestedCategory = params.get("categoria");
            if (requestedCategory && categorias.includes(requestedCategory)) categoriaActual = requestedCategory;
            terminoBusqueda = params.get("buscar") || "";
            ordenActual = ["recent", "price-asc", "price-desc", "name"].includes(params.get("orden")) ? params.get("orden") : "default";
            document.getElementById("search-input").value = terminoBusqueda;
            sortSelect.value = ordenActual;
            renderFeaturedProducts();
            renderizarProductos();
        } catch (error) {
            console.error('No se pudo cargar el catalogo:', error);
            mainContainer.innerHTML = `
                <div class="text-center py-20 px-4 bg-white rounded-3xl border border-gray-100 shadow-sm mt-8">
                    <h3 class="font-title text-2xl font-bold text-gray-900 mb-3">No se pudo cargar el catalogo</h3>
                    <p class="text-gray-500 text-lg">Recarga la pagina o intenta nuevamente mas tarde.</p>
                </div>
            `;
        }
    }

    cargarProductos();

})();
