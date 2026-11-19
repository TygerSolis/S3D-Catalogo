# Guía: WhatsApp Business de S3D

Número del negocio: **+51 955 107 609** (el mismo de la web: no cambiarlo sin avisar, está en `config.json`).
Atención: **24 horas**. Las imágenes del perfil están en `Escritorio\S3D\WHATSAPP\`.

## 1. Perfil (WhatsApp Business → Configuración → Herramientas para la empresa → Perfil de empresa)

| Campo | Qué poner |
|---|---|
| Foto de perfil | `whatsapp-perfil.jpg` (logo; WhatsApp la muestra en círculo) |
| Foto de portada | `whatsapp-portada-navidad.jpg` hasta el 6 de enero; luego `whatsapp-portada-general.jpg` |
| Nombre | `S3D` |
| Categoría | **Compras y ventas minoristas** (o la más parecida: «Tienda de regalos», «Artes y manualidades») |
| Descripción | ver abajo |
| Dirección | la del taller (la misma de Google Maps) o solo `Lima, Perú` si prefieres no mostrarla |
| Horario | **Siempre abierto** |
| Correo | `ventas.s3d@gmail.com` |
| Sitio web 1 | `https://tygersolis.github.io/S3D-Catalogo/?utm_source=whatsapp&utm_medium=perfil` |
| Sitio web 2 | el enlace de tu perfil de Instagram |

**Descripción** (226 de 256 caracteres):

```
Figuras, adornos y regalos impresos en 3D, hechos a pedido en nuestro taller de Lima 🎁 Personalizamos colores y medidas. Envíos a todo el Perú. Pagos con Yape, Plin, transferencia o efectivo. Mira el catálogo y pide por aquí 👇
```

**Info / Acerca de** (Configuración → tu perfil → Info):

```
Imprimimos tu mundo 🖨️ Regalos en 3D a pedido · Atención 24 h
```

## 2. Mensaje de bienvenida (Herramientas para la empresa → Mensaje de bienvenida → Activar)

Destinatarios: **Todos**.

```
¡Hola! 😊 Gracias por escribir a S3D, te atendemos las 24 horas.
Aquí ves todos nuestros productos con precios: https://tygersolis.github.io/S3D-Catalogo/?utm_source=whatsapp&utm_medium=bienvenida
Si ya elegiste, cuéntanos qué producto, color y cantidad quieres 🎁
```

No hace falta «Mensaje de ausencia»: atiendes las 24 horas.

## 3. Respuestas rápidas (Herramientas para la empresa → Respuestas rápidas → +)

Escribes el atajo en un chat (por ejemplo `/envio`) y aparece el texto completo.

| Atajo | Mensaje |
|---|---|
| `/catalogo` | Aquí tienes nuestro catálogo completo con fotos y precios 👉 https://tygersolis.github.io/S3D-Catalogo/?utm_source=whatsapp&utm_medium=respuesta |
| `/navidad` | ¡Nuestra Colección Navideña 🎄! Snoopy, árboles con luz LED, angelitos y más: https://tygersolis.github.io/S3D-Catalogo/?categoria=Navidad&utm_source=whatsapp&utm_medium=respuesta#catalogo |
| `/envio` | Hacemos envíos a todo el Perú 🚚 El costo depende de tu distrito o provincia: dime dónde estás y te lo calculo. En Lima también podemos coordinar la entrega. |
| `/pago` | Puedes pagar con Yape, Plin, transferencia o efectivo 💳 Al confirmar tu pedido te paso los datos. |
| `/tiempo` | Trabajamos a pedido: normalmente está listo de un día para otro, según el modelo y la cantidad de pedidos ⏱️ Te confirmo la fecha exacta al hacer tu pedido. |
| `/medidas` | Las medidas publicadas corresponden al precio indicado. Si lo quieres más grande o en otro color, también se puede: dime la medida y te lo cotizo 📏 |
| `/disponible` | ¡Sí, está disponible! 😊 Lo elaboramos a pedido. ¿En qué color lo quieres y para cuándo lo necesitas? |
| `/gracias` | ¡Gracias por tu compra! 🙌 Si te gustó, nos ayudaría mucho una foto o una reseña en Instagram o Facebook. |

## 4. Etiquetas (Chats → ⋮ → Etiquetas)

`Nuevo pedido` · `Pagado` · `En producción` · `Enviado` · `Entregado` · `Cotización`

## 5. Catálogo: se llena solo desde la web

La web publica un catálogo para Meta que se actualiza solo: **https://tygersolis.github.io/S3D-Catalogo/meta/catalogo.csv**
(un artículo por producto con precio; el árbol navideño, una variante por color con su precio; foto cuadrada, enlace a
la ficha y disponibilidad). Los productos «Cotizar» no van porque Meta exige un precio. Cuando cambias algo en la hoja,
en la noche Meta lo vuelve a leer y el catálogo de WhatsApp y Facebook se actualiza solo.

**Conectarlo (una sola vez, desde una computadora):**

1. Entra a **https://business.facebook.com/commerce** (Administrador de ventas) con tu Facebook.
2. **Crear catálogo** (o **+ Agregar catálogo**) → tipo **Comercio electrónico** (*E-commerce / productos en línea*) →
   **Subir información de productos** → propietario: tu portafolio comercial de S3D (o tu cuenta) → nombre
   `Catálogo S3D` → **Crear**.
3. En el catálogo: **Catálogo → Orígenes de datos** (*Data sources*) → **Agregar artículos** → **Lista de datos**
   (*Data feed*) → **Programada** (*Scheduled feed*).
4. URL: `https://tygersolis.github.io/S3D-Catalogo/meta/catalogo.csv` (sin usuario ni contraseña).
5. Frecuencia: **Diaria**, de madrugada. Moneda: **PEN (sol peruano)**. Nombre del origen: `Web S3D`. **Subir**.
6. Espera a que termine (unos minutos) y revisa **Problemas** (*Issues*): mándame una captura si aparece algo.
7. **Conectar a WhatsApp**: en la app WhatsApp Business → **Herramientas para la empresa → Catálogo → ⋮ →**
   la opción para conectar un catálogo de Meta / Commerce Manager → elige `Catálogo S3D`.
   (Si la opción pide hacerlo desde el Administrador de ventas: **Configuración → Activos comerciales → Cuentas de
   WhatsApp → Agregar**.)
8. Opcional: en la página de Facebook, **Configuración → Plantillas y pestañas** o **Tienda**, conecta el mismo catálogo.

No borres ni edites los productos a mano dentro del catálogo de Meta: la lista diaria los reemplaza con lo de la web.
