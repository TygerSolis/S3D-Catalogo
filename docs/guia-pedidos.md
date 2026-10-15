# Guía: registro de pedidos

Cada vez que un cliente pulsa **Comprar**, envía **Mi pedido** o pide una **cotización**, la web:

1. crea un código de pedido, por ejemplo `S3D-7K4Q2`, y lo pone al inicio del mensaje de WhatsApp;
2. guarda el pedido en la hoja **Pedidos S3D** (productos, cantidades, colores/medidas, total, página y fecha);
3. te envía un correo a ventas.s3d@gmail.com.

WhatsApp se abre al instante: el registro va por detrás y, si Google fallara, el cliente puede pedir igual.
No se guardan nombres ni teléfonos (esos datos llegan solo por WhatsApp).

Si en la hoja aparece un pedido que nunca llegó por WhatsApp, el cliente no completó el envío: es una venta que puedes recuperar.

## Instalación (una sola vez, ~10 minutos)

1. **Crea la hoja:** en Google Sheets, una hoja nueva llamada **Pedidos S3D** (con la cuenta ventas.s3d@gmail.com).
   No hace falta compartirla con nadie.
2. **Pega el programa:** en la hoja, menú **Extensiones → Apps Script**. Borra lo que haya en `Código.gs` y pega
   todo el contenido de [`scripts/apps-script/Pedidos.gs`](../scripts/apps-script/Pedidos.gs). Guarda (icono del disquete).
3. **Prepara la hoja y da permisos:** arriba, en la lista de funciones, elige **preparar** y pulsa **Ejecutar**.
   Google pedirá permisos («Revisar permisos» → tu cuenta → *Configuración avanzada* → *Ir a … (no seguro)* → **Permitir**).
   Es normal: el programa es tuyo y solo pide acceso a esta hoja y a enviar correos desde tu cuenta.
   Al terminar, la hoja tendrá la pestaña **Pedidos** con sus columnas.
4. **Publícalo:** botón **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Descripción: `Pedidos web`
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
5. **Envíame esa URL.** La pongo en `config.json` y el registro queda encendido en la web.

## Uso diario

- Columna **Estado**: elige Nuevo, Confirmado, En producción, Listo, Entregado, Cancelado o Sin respuesta.
- Columna **Notas**: libre (nombre del cliente, fecha de entrega, etc.). El programa nunca toca filas ya escritas.
- Para buscar un pedido que llega por WhatsApp: Ctrl+F con el código (`S3D-7K4Q2`).

## Si cambias el programa

Tras editar `Pedidos.gs` en Apps Script: **Implementar → Gestionar implementaciones → editar (lápiz) →
Versión: Nueva versión → Implementar**. Así la URL no cambia.

## Límites

- Gmail permite unos 100 correos al día desde Apps Script; si se agotan, el pedido se guarda igual sin correo.
- Como freno ante envíos masivos, se aceptan como máximo 60 pedidos cada 10 minutos.
