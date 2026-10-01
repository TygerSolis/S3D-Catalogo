(async function() {

        document.getElementById('current-year').textContent = new Date().getFullYear();

        // Control del Botón Volver Arriba
        window.addEventListener('scroll', function() {
            const btnArriba = document.getElementById('btn-volver-arriba');
            if (window.scrollY > 500) {
                btnArriba.classList.add('visible');
            } else {
                btnArriba.classList.remove('visible');
            }
        });

;

        let productos = [];

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
                    ${cat}
                </button>
            `).join('');
        }

        function generarHTMLProducto(producto) {
            let colorActualNombre = producto.colores ? producto.colores[0].nombre : null;

            const whatsappText = producto.requiereCotizacion 
                ? `Hola, me interesa cotizar el modelo 3D: ${producto.nombre}. Es un producto elaborado a pedido y deseo consultar el costo de envío.`
                : `Hola, me interesa el modelo 3D: ${producto.nombre}${producto.colores ? ` (Color: ${colorActualNombre})` : ''} - Precio: S/ ${producto.precio.toFixed(2)} (incluye IGV). Es un producto elaborado a pedido y deseo consultar el costo de envío.`;
                
            const img1 = producto.imagenes[0];
            const img2 = producto.imagenes.length > 1 ? producto.imagenes[1] : null;
            const img3 = producto.imagenes.length > 2 ? producto.imagenes[2] : null;
            const hasVideo = !!producto.video; 
            const rutaAvif = ruta => ruta ? ruta.replace(/\.(webp|png|jpe?g)$/i, '.avif') : '';
            
            let midSectionHTML = '';

            // Si el producto tiene colores, mostramos la paleta en lugar de las miniaturas
            if (producto.colores) {
                midSectionHTML = `
                <div class="flex flex-col items-center justify-center p-3.5 bg-gray-50/80 border-b border-gray-100 z-30 relative shadow-[0_-5px_15px_-10px_rgba(0,0,0,0.05)] min-h-[5.5rem] no-print">
                    <span class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2 block text-center">Color seleccionado: <span id="color-name-${producto.id}" class="text-brand-900 ml-1">${producto.colores[0].nombre}</span></span>
                    <div class="flex justify-center gap-3">
                        ${producto.colores.map((color, idx) => `
                            <button onclick="cambiarColor(${producto.id}, '${color.img}', '${color.nombre}', event)"
                                    class="w-8 h-8 rounded-full shadow-sm transition-all duration-300 hover:scale-110 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-brand-accent/30 ${idx === 0 ? 'ring-2 ring-offset-2 ring-brand-accent scale-110' : 'border border-gray-200'}"
                                    style="background-color: ${color.hex};"
                                    title="${color.nombre}"
                                    id="color-btn-${producto.id}-${idx}">
                            </button>
                        `).join('')}
                    </div>
                </div>
                `;
            } else {
                // Si no tiene colores, mostramos las miniaturas tradicionales
                let miniaturasHTML = ``;
                if (img1) {
                    miniaturasHTML += `
                    <button onclick="switchMedia(${producto.id}, 0, event)" id="thumb-0-${producto.id}" class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 border-brand-accent bg-gray-50 transition-all cursor-pointer shadow-sm shrink-0" title="Foto 1">
                        <img src="${img1}" loading="lazy" decoding="async" alt="${producto.nombre} - Foto 1" class="w-full h-full object-cover">
                    </button>`;
                }
                if (img2) {
                    miniaturasHTML += `
                    <button onclick="switchMedia(${producto.id}, 1, event)" id="thumb-1-${producto.id}" class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 border-transparent hover:border-brand-accent bg-gray-50 transition-all cursor-pointer shadow-sm shrink-0" title="Foto 2">
                        <img src="${img2}" loading="lazy" decoding="async" alt="${producto.nombre} - Foto 2" class="w-full h-full object-cover">
                    </button>`;
                }
                if (img3) {
                    miniaturasHTML += `
                    <button onclick="switchMedia(${producto.id}, 3, event)" id="thumb-3-${producto.id}" class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 border-transparent hover:border-brand-accent bg-gray-50 transition-all cursor-pointer shadow-sm shrink-0" title="Foto 3">
                        <img src="${img3}" loading="lazy" decoding="async" alt="${producto.nombre} - Foto 3" class="w-full h-full object-cover">
                    </button>`;
                }
                if (hasVideo) {
                    miniaturasHTML += `
                    <button onclick="switchMedia(${producto.id}, 2, event)" id="thumb-2-${producto.id}" class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 border-transparent hover:border-brand-accent bg-gray-900 transition-all cursor-pointer relative flex items-center justify-center group/vid shadow-sm shrink-0" title="Ver Video">
                        <img src="${img1}" loading="lazy" decoding="async" alt="${producto.nombre} - Vista previa del video" class="absolute inset-0 w-full h-full object-cover opacity-60 blur-[3px] group-hover/vid:opacity-40 transition-opacity duration-300">
                        <div class="relative z-10 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/40 group-hover/vid:bg-brand-accent group-hover/vid:border-brand-accent transition-all duration-300 shadow-lg">
                            <i data-lucide="play" class="w-4 h-4 text-white ml-0.5 group-hover/vid:scale-110 transition-transform"></i>
                        </div>
                    </button>`;
                }

                midSectionHTML = `
                <div class="thumbnails-container flex justify-center gap-3 sm:gap-4 p-4 bg-white border-b border-gray-50 z-30 relative shadow-[0_-5px_15px_-10px_rgba(0,0,0,0.05)] min-h-[5.5rem]">
                    ${miniaturasHTML}
                </div>
                `;
            }

            return `
            <div class="print-break-avoid bg-white rounded-3xl overflow-hidden shadow-soft hover:shadow-float transition-all duration-500 border border-gray-100 flex flex-col h-full group print-shadow-none">
                
                <div class="media-viewer relative w-full h-[24rem] sm:h-[26rem] bg-[#f8fafc] border-b border-gray-50 flex items-center justify-center p-0 cursor-pointer overflow-hidden group/media" onclick="abrirModal(${producto.id})">
                    
                    ${producto.badge ? `
                    <div class="absolute top-4 left-4 z-20 no-print">
                        <span class="bg-gradient-to-r ${producto.badge === 'Top Ventas' ? 'from-orange-500 to-red-500' : 'from-brand-accent to-blue-500'} text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm border border-white/20 flex items-center gap-1.5">
                            ${producto.badge === 'Top Ventas' ? '<i data-lucide="flame" class="w-3 h-3"></i>' : '<i data-lucide="sparkles" class="w-3 h-3"></i>'}
                            ${producto.badge}
                        </span>
                    </div>` : ''}

                    <picture class="contents">
                        <source srcset="${rutaAvif(img1)}" type="image/avif">
                        <img id="media-img1-${producto.id}" src="${img1}" loading="lazy" decoding="async" alt="${producto.nombre}" class="media-active absolute inset-0 w-full h-full object-contain p-4 media-transition transform group-hover/media:scale-105" onerror="this.src='https://placehold.co/600x600/e6f0fa/003366?text=Sin+Foto'">
                    </picture>
                    
                    ${img2 ? `<picture class="contents"><source srcset="${rutaAvif(img2)}" type="image/avif"><img id="media-img2-${producto.id}" src="${img2}" loading="lazy" decoding="async" alt="${producto.nombre}" class="media-hidden absolute inset-0 w-full h-full object-contain p-4 media-transition" onerror="this.src='https://placehold.co/600x600/f8fafc/cbd5e1?text=Sin+Foto'"></picture>` : ''}
                    ${img3 ? `<picture class="contents"><source srcset="${rutaAvif(img3)}" type="image/avif"><img id="media-img3-${producto.id}" src="${img3}" loading="lazy" decoding="async" alt="${producto.nombre}" class="media-hidden absolute inset-0 w-full h-full object-contain p-4 media-transition" onerror="this.src='https://placehold.co/600x600/f8fafc/cbd5e1?text=Sin+Foto'"></picture>` : ''}
                    ${hasVideo ? `<video id="media-vid-${producto.id}" src="${producto.video}" class="media-hidden absolute inset-0 w-full h-full object-contain p-4 media-transition" muted loop playsinline onerror="this.poster='https://placehold.co/600x600/e6f0fa/003366?text=Video'"></video>` : ''}

                    <div class="absolute top-4 right-4 bg-white/80 backdrop-blur-sm p-2 rounded-full opacity-0 group-hover/media:opacity-100 transition-opacity duration-300 shadow-sm z-20 no-print">
                        <i data-lucide="maximize-2" class="w-5 h-5 text-brand-900"></i>
                    </div>
                </div>

                ${midSectionHTML}

                <div class="print-card-body p-6 md:p-8 flex flex-col flex-grow bg-white z-30">
                    <div class="flex flex-wrap gap-2 mb-3">
                        ${producto.coleccion ? `
                        <span class="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                            <i data-lucide="tag" class="w-3 h-3"></i> ${producto.coleccion}
                        </span>` : ''}
                        <span class="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-[11px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                            <i data-lucide="ruler" class="w-3.5 h-3.5"></i> ${producto.medida}
                        </span>
                        <span class="inline-flex items-center gap-1.5 bg-brand-light text-brand-800 text-[11px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                            <i data-lucide="layers" class="w-3.5 h-3.5"></i> ${producto.material}
                        </span>
                    </div>

                    <h3 class="print-title font-title text-xl font-bold text-brand-900 leading-tight mb-3">${producto.nombre}</h3>
                    <p class="print-text-sm text-gray-500 text-sm leading-relaxed flex-grow whitespace-pre-line">${producto.descripcion}</p>
                    
                    <div class="print-mt-auto flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
                        <div class="flex flex-col">
                            <span class="text-[10px] text-gray-400 font-bold tracking-widest uppercase mb-1">${producto.requiereCotizacion ? 'Precio' : 'Precio incluye IGV'}</span>
                            <div class="flex items-start">
                                ${producto.requiereCotizacion 
                                    ? `<span class="print-price font-title text-2xl font-black text-brand-900 tracking-tight mt-1">Cotizar</span>`
                                    : `<span class="font-title text-sm font-bold text-brand-900 mt-1 mr-1">S/</span>
                                       <span class="print-price font-title text-3xl font-black text-brand-900 tracking-tight">${producto.precio.toFixed(2)}</span>`
                                }
                            </div>
                        </div>
                        
                        <a id="ws-btn-${producto.id}" href="https://api.whatsapp.com/send?phone=51955107609&text=${encodeURIComponent(whatsappText)}" target="_blank" rel="noopener noreferrer" class="no-print bg-brand-900 hover:bg-brand-accent text-white w-auto px-4 sm:px-6 h-12 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2" title="Pedir por WhatsApp">
                            <i data-lucide="shopping-cart" class="w-5 h-5"></i>
                            <span class="font-bold text-xs sm:text-sm tracking-wide">${producto.requiereCotizacion ? 'Cotizar' : 'Comprar'}</span>
                        </a>
                    </div>
                </div>
            </div>
            `;
        }

        window.switchMedia = function(productId, index, event) {
            if(event) event.stopPropagation();

            const img1 = document.getElementById(`media-img1-${productId}`);
            const img2 = document.getElementById(`media-img2-${productId}`);
            const img3 = document.getElementById(`media-img3-${productId}`);
            const vid = document.getElementById(`media-vid-${productId}`);
            
            const thumb0 = document.getElementById(`thumb-0-${productId}`);
            const thumb1 = document.getElementById(`thumb-1-${productId}`);
            const thumb2 = document.getElementById(`thumb-2-${productId}`);
            const thumb3 = document.getElementById(`thumb-3-${productId}`);

            if (img1) img1.className = "media-hidden absolute inset-0 w-full h-full object-contain p-4 media-transition transform group-hover/media:scale-105";
            if (img2) img2.className = "media-hidden absolute inset-0 w-full h-full object-contain p-4 media-transition";
            if (img3) img3.className = "media-hidden absolute inset-0 w-full h-full object-contain p-4 media-transition";
            if (vid) {
                vid.className = "media-hidden absolute inset-0 w-full h-full object-contain p-4 media-transition";
                vid.pause();
            }

            if (thumb0) { thumb0.classList.remove('border-brand-accent'); thumb0.classList.add('border-transparent'); }
            if (thumb1) { thumb1.classList.remove('border-brand-accent'); thumb1.classList.add('border-transparent'); }
            if (thumb2) { thumb2.classList.remove('border-brand-accent'); thumb2.classList.add('border-transparent'); }
            if (thumb3) { thumb3.classList.remove('border-brand-accent'); thumb3.classList.add('border-transparent'); }

            if(index === 0 && img1) {
                img1.classList.remove('media-hidden');
                img1.classList.add('media-active');
                if (thumb0) { thumb0.classList.remove('border-transparent'); thumb0.classList.add('border-brand-accent'); }
            } else if (index === 1 && img2) {
                img2.classList.remove('media-hidden');
                img2.classList.add('media-active');
                if (thumb1) { thumb1.classList.remove('border-transparent'); thumb1.classList.add('border-brand-accent'); }
            } else if (index === 3 && img3) {
                img3.classList.remove('media-hidden');
                img3.classList.add('media-active');
                if (thumb3) { thumb3.classList.remove('border-transparent'); thumb3.classList.add('border-brand-accent'); }
            } else if (index === 2 && vid) {
                vid.classList.remove('media-hidden');
                vid.classList.add('media-active');
                if (thumb2) { thumb2.classList.remove('border-transparent'); thumb2.classList.add('border-brand-accent'); }
                vid.play();
            }
        };

        window.cambiarColor = function(productId, imgSrc, colorName, event) {
            if(event) event.stopPropagation();
            
            // 1. Cambiar la imagen principal
            const img1 = document.getElementById(`media-img1-${productId}`);
            if(img1) img1.src = imgSrc;

            // 2. Cambiar el texto del color
            const nameSpan = document.getElementById(`color-name-${productId}`);
            if(nameSpan) nameSpan.textContent = colorName;

            // 3. Actualizar bordes en los botones de color
            const btns = document.querySelectorAll(`button[id^="color-btn-${productId}-"]`);
            btns.forEach(btn => {
                btn.classList.remove('ring-2', 'ring-offset-2', 'ring-brand-accent', 'scale-110');
                btn.classList.add('border', 'border-gray-200');
            });
            event.currentTarget.classList.remove('border', 'border-gray-200');
            event.currentTarget.classList.add('ring-2', 'ring-offset-2', 'ring-brand-accent', 'scale-110');

            // 4. Actualizar el link de WhatsApp dinámicamente con el color
            const wsBtn = document.getElementById(`ws-btn-${productId}`);
            if(wsBtn) {
                const prod = productos.find(p => p.id === productId);
                const text = `Hola, me interesa el modelo 3D: ${prod.nombre} (Color: ${colorName}) - Precio: S/ ${prod.precio.toFixed(2)} (incluye IGV). Es un producto elaborado a pedido y deseo consultar el costo de envío.`;
                wsBtn.href = `https://api.whatsapp.com/send?phone=51955107609&text=${encodeURIComponent(text)}`;
            }
        };

        const mainContainer = document.getElementById('main-content');
        
        function renderizarProductos() {
            renderFilters();
            
            const productosFiltrados = productos.filter(p => {
                const cumpleCategoria = categoriaActual === "Todas" || p.categoria === categoriaActual;
                const cumpleBusqueda = terminoBusqueda === "" || 
                    p.nombre.toLowerCase().includes(terminoBusqueda.toLowerCase()) || 
                    p.descripcion.toLowerCase().includes(terminoBusqueda.toLowerCase()) ||
                    (p.coleccion && p.coleccion.toLowerCase().includes(terminoBusqueda.toLowerCase()));
                
                return cumpleCategoria && cumpleBusqueda;
            });
            const productosOrdenados = [...productosFiltrados];
            if (ordenActual === "price-asc") productosOrdenados.sort((a, b) => a.precio - b.precio);
            if (ordenActual === "price-desc") productosOrdenados.sort((a, b) => b.precio - a.precio);
            if (ordenActual === "name") productosOrdenados.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
            if (resultsCount) resultsCount.textContent = `${productosOrdenados.length} ${productosOrdenados.length === 1 ? "producto encontrado" : "productos encontrados"}`;
            actualizarURL();

            let categoriasA_Renderizar = [];
            ordenDeseado.forEach(cat => {
                if (productosOrdenados.some(p => p.categoria === cat)) {
                    categoriasA_Renderizar.push(cat);
                }
            });

            let htmlCompleto = '';

            for (const categoria of categoriasA_Renderizar) {
                const items = productosOrdenados.filter(p => p.categoria === categoria);
                if(items.length === 0) continue;

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
                            <h3 class="font-title text-2xl md:text-3xl font-black mb-3 tracking-tight">¿Cómo funcionan nuestras placas?</h3>
                            <p class="text-brand-light text-sm md:text-base leading-relaxed opacity-90">Mira esta breve presentación donde detallamos las funcionalidades, los materiales y por qué son la opción ideal para mantener seguro a tu engreído.</p>
                        </div>
                        <div class="w-full md:w-80 shrink-0 relative z-10">
                            <button onclick="abrirVideoGeneral('assets/pet-video-presentacion.mp4')" class="w-full aspect-video bg-black/60 rounded-2xl border border-white/20 hover:border-brand-accent flex items-center justify-center group overflow-hidden relative transition-all shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:-translate-y-1" title="Reproducir Video">
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
                    <div class="mb-16 first:mt-0 mt-8 print-break-avoid">
                        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                            <div>
                                <h2 class="font-title text-3xl font-black text-brand-900">${categoria}</h2>
                                <div class="w-12 h-1 bg-brand-accent mt-3 rounded-full"></div>
                                ${extraHeaderNote}
                            </div>
                            <span class="text-sm font-semibold text-gray-500 bg-white px-4 py-1.5 rounded-full w-fit shadow-sm border border-gray-200">${items.length} modelos</span>
                        </div>
                        ${categoryBanner}
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 xl:gap-10">
                            ${items.map(producto => generarHTMLProducto(producto)).join('')}
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
            
            lucide.createIcons();
        }

        window.filtrarPorCategoria = function(categoria) {
            categoriaActual = categoria;
            renderizarProductos();
        };

        document.getElementById('search-input').addEventListener('input', function(e) {
            terminoBusqueda = e.target.value;
            clearTimeout(debounceBusqueda);
            debounceBusqueda = setTimeout(renderizarProductos, 250);
        });

        sortSelect.addEventListener('change', function(e) {
            ordenActual = e.target.value;
            renderizarProductos();
        });

        window.abrirVideoGeneral = function(src) {
            currentLightboxMediaArray = [{ type: 'vid', src: src }];
            currentLightboxIndex = 0;
            actualizarLightbox();
            document.getElementById('lightbox').classList.add('active');
            document.body.style.overflow = 'hidden';
        };

        let currentLightboxMediaArray = [];
        let currentLightboxIndex = 0;

        function abrirModal(productoId) {
            const prod = productos.find(p => p.id === productoId);
            if(!prod) return;
            document.getElementById('lightbox-title').textContent = prod.nombre;

            // Obtener la imagen actual (por si se cambió con la paleta de colores)
            const imgEl = document.getElementById(`media-img1-${productoId}`);
            const currentImgSrc = imgEl ? imgEl.getAttribute('src') : prod.imagenes[0];

            currentLightboxMediaArray = [
                { type: 'img', src: currentImgSrc }
            ];
            
            if (prod.imagenes.length > 1) {
                currentLightboxMediaArray.push({ type: 'img', src: prod.imagenes[1] });
            }
            if (prod.imagenes.length > 2) {
                currentLightboxMediaArray.push({ type: 'img', src: prod.imagenes[2] });
            }
            if (prod.video) {
                currentLightboxMediaArray.push({ type: 'vid', src: prod.video });
            }

            const img2 = document.getElementById(`media-img2-${productoId}`);
            const img3 = document.getElementById(`media-img3-${productoId}`);
            const vid = document.getElementById(`media-vid-${productoId}`);
            
            if (vid && vid.classList.contains('media-active')) currentLightboxIndex = currentLightboxMediaArray.findIndex(m => m.type === 'vid');
            else if (img3 && img3.classList.contains('media-active')) currentLightboxIndex = 2;
            else if (img2 && img2.classList.contains('media-active')) currentLightboxIndex = 1;
            else currentLightboxIndex = 0;

            actualizarLightbox();
            document.getElementById('lightbox').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function cerrarModal(event, forceClose = false) {
            if (forceClose || event.target.id === 'lightbox') {
                document.getElementById('lightbox').classList.remove('active');
                document.body.style.overflow = 'auto';
                document.getElementById('lightbox-vid').pause();
            }
        }

        function cambiarImagenLightbox(direccion, event) {
            if(event) event.stopPropagation(); 

            const total = currentLightboxMediaArray.length;
            if(total <= 1) return;

            currentLightboxIndex += direccion;
            if (currentLightboxIndex >= total) currentLightboxIndex = 0;
            if (currentLightboxIndex < 0) currentLightboxIndex = total - 1;

            actualizarLightbox();
        }

        function actualizarLightbox() {
            const imgEl = document.getElementById('lightbox-img');
            const vidEl = document.getElementById('lightbox-vid');
            const counterEl = document.getElementById('lightbox-counter');
            const prevBtn = document.getElementById('lightbox-prev');
            const nextBtn = document.getElementById('lightbox-next');
            
            const currentMedia = currentLightboxMediaArray[currentLightboxIndex];

            imgEl.classList.add('hidden');
            vidEl.classList.add('hidden');
            vidEl.pause();

            if(currentMedia.type === 'img') {
                imgEl.src = currentMedia.src;
                imgEl.classList.remove('hidden');
            } else if (currentMedia.type === 'vid') {
                vidEl.src = currentMedia.src;
                vidEl.classList.remove('hidden');
                vidEl.play();
            }

            const total = currentLightboxMediaArray.length;
            counterEl.textContent = `${currentLightboxIndex + 1} / ${total}`;
            
            if (total <= 1) {
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
                counterEl.style.display = 'none';
            } else {
                prevBtn.style.display = 'flex';
                nextBtn.style.display = 'flex';
                counterEl.style.display = 'block';
            }
        }

        document.addEventListener('keydown', function(event) {
            if (!document.getElementById('lightbox').classList.contains('active')) return;
            if (event.key === 'Escape') cerrarModal(event, true);
            if (event.key === 'ArrowRight') cambiarImagenLightbox(1);
            if (event.key === 'ArrowLeft') cambiarImagenLightbox(-1);
        });

        lucide.createIcons();

    async function cargarProductos() {
        try {
            const response = await fetch('productos.json');
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
            const params = new URLSearchParams(window.location.search);
            const requestedCategory = params.get("categoria");
            if (requestedCategory && categorias.includes(requestedCategory)) categoriaActual = requestedCategory;
            terminoBusqueda = params.get("buscar") || "";
            ordenActual = ["price-asc", "price-desc", "name"].includes(params.get("orden")) ? params.get("orden") : "default";
            document.getElementById("search-input").value = terminoBusqueda;
            sortSelect.value = ordenActual;
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
