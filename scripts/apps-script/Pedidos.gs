/**
 * Registro de pedidos de la web S3D (Google Apps Script vinculado a la hoja «Pedidos S3D»).
 *
 * La web envía cada pedido (Mi pedido, Comprar o Cotizar) antes de abrir WhatsApp. Este script:
 *   1. valida los datos (tamaños, tipos, código S3D-XXXXX) y descarta duplicados y ráfagas;
 *   2. añade una fila con un correlativo, la fecha y el estado «Nuevo»;
 *   3. envía un correo a AVISO_CORREO.
 * No guarda nombres ni teléfonos: esos datos solo llegan por WhatsApp.
 * Además, cada mañana (RESUMEN_HORA, hora de Lima) «resumenDiario» avisa por correo de los pedidos que siguen en
 * «Nuevo» desde hace más de 24 h, para retomarlos por WhatsApp. Se activa ejecutando «instalarResumen» una vez.
 *
 * Instalación: ver docs/guia-pedidos.md (Extensiones > Apps Script, pegar este archivo, ejecutar «preparar»
 * una vez e Implementar > Nueva implementación > Aplicación web, «Ejecutar como: yo», «Acceso: cualquier usuario»).
 */
const AVISO_CORREO = 'ventas.s3d@gmail.com';
const HOJA = 'Pedidos';
const ESTADOS = ['Nuevo', 'Confirmado', 'En producción', 'Listo', 'Entregado', 'Cancelado', 'Sin respuesta'];
const COLUMNAS = ['N°', 'Fecha', 'Código', 'Tipo', 'Productos', 'Unidades', 'Total (S/)', 'Detalle', 'Página', 'Estado', 'Notas'];
const TIPOS = { pedido: 'Mi pedido', comprar: 'Comprar', cotizar: 'Cotizar' };
const MAX_POR_10_MIN = 60;   // freno ante envíos masivos
const ZONA = 'America/Lima';
const RESUMEN_HORA = 9;       // hora del correo de pendientes
const PENDIENTE_HORAS = 24;   // un pedido «Nuevo» cuenta como pendiente pasadas estas horas
const PENDIENTE_DIAS = 7;     // los más antiguos solo se cuentan (para no alargar el correo cada día)

function doGet() {
  return ContentService.createTextOutput('Registro de pedidos S3D: activo');
}

function doPost(e) {
  try {
    const datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const pedido = validar_(datos);
    const cache = CacheService.getScriptCache();
    if (cache.get('codigo:' + pedido.codigo)) return respuesta_({ ok: true, repetido: true });
    const rafaga = Number(cache.get('rafaga') || 0);
    if (rafaga >= MAX_POR_10_MIN) return respuesta_({ ok: false, error: 'demasiados pedidos seguidos' });
    cache.put('rafaga', String(rafaga + 1), 600);
    cache.put('codigo:' + pedido.codigo, '1', 21600);

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let numero;
    try {
      const hoja = hoja_();
      numero = Math.max(hoja.getLastRow() - 1, 0) + 1;
      hoja.appendRow([numero, new Date(), pedido.codigo, TIPOS[pedido.tipo], pedido.productos, pedido.unidades,
        pedido.total === null ? '' : pedido.total, pedido.detalle, pedido.pagina, 'Nuevo', '']);
    } finally {
      lock.releaseLock();
    }
    avisar_(numero, pedido);
    return respuesta_({ ok: true, numero: numero });
  } catch (error) {
    return respuesta_({ ok: false, error: String(error && error.message || error) });
  }
}

/** Ejecutar UNA vez a mano: crea la pestaña con encabezados, formatos y la lista de estados. */
function preparar() {
  const hoja = hoja_();
  hoja.setFrozenRows(1);
  hoja.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold').setBackground('#002244').setFontColor('#ffffff');
  hoja.getRange('B2:B').setNumberFormat('dd/mm/yyyy hh:mm');
  hoja.getRange('G2:G').setNumberFormat('0.00');
  hoja.getRange('E2:E').setWrap(true);
  hoja.getRange('H2:H').setWrap(true);
  const regla = SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).setAllowInvalid(false).build();
  hoja.getRange('J2:J').setDataValidation(regla);
  [50, 130, 95, 85, 320, 70, 80, 320, 220, 110, 200].forEach((ancho, i) => hoja.setColumnWidth(i + 1, ancho));
  MailApp.getRemainingDailyQuota();   // fuerza a Google a pedir el permiso de correo al ejecutar «preparar»
}

function hoja_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(HOJA);
  if (!hoja) hoja = libro.insertSheet(HOJA);
  if (hoja.getLastRow() === 0) hoja.appendRow(COLUMNAS);
  return hoja;
}

// ---------- validación: nada se escribe tal cual llega ----------
function texto_(valor, maximo) {
  let t = String(valor == null ? '' : valor).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, maximo);
  // Evita que un texto se interprete como fórmula en la hoja (=, +, -, @).
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return t;
}

function validar_(d) {
  if (!d || typeof d !== 'object') throw new Error('datos vacíos');
  const codigo = String(d.codigo || '');
  if (!/^S3D-[0-9A-Z]{5}$/.test(codigo)) throw new Error('código inválido');
  if (!TIPOS[d.tipo]) throw new Error('tipo inválido');
  const items = Array.isArray(d.items) ? d.items.slice(0, 40) : [];
  const lineas = items.map(function (it) {
    const cantidad = Math.max(1, Math.min(99, Math.floor(Number(it && it.cantidad) || 1)));
    const extra = [texto_(it && it.color, 40), texto_(it && it.medida, 40)].filter(String).join(', ');
    const precio = Number(it && it.precio) > 0 ? ' — S/ ' + Number(it.precio).toFixed(2) : ' — por cotizar';
    return { cantidad: cantidad, texto: cantidad + ' × ' + texto_(it && it.nombre, 120) + (extra ? ' (' + extra + ')' : '') + precio };
  });
  const total = Number(d.total);
  let pagina = texto_(d.pagina, 300);
  if (pagina && !/^'?https:\/\/tygersolis\.github\.io\//.test(pagina)) pagina = '';
  return {
    codigo: codigo,
    tipo: d.tipo,
    productos: lineas.map(function (l) { return l.texto; }).join('\n') || '(sin productos)',
    unidades: lineas.reduce(function (s, l) { return s + l.cantidad; }, 0),
    total: isFinite(total) && total > 0 && total < 100000 ? Math.round(total * 100) / 100 : null,
    detalle: texto_(d.detalle, 1500),
    pagina: pagina
  };
}

function avisar_(numero, p) {
  if (!AVISO_CORREO || MailApp.getRemainingDailyQuota() < 3) return;
  const asunto = 'Pedido ' + p.codigo + ' (' + TIPOS[p.tipo] + ')' + (p.total !== null ? ' · S/ ' + p.total.toFixed(2) : '');
  const cuerpo = [
    'Nuevo registro n.° ' + numero + ' desde la web.',
    '',
    'Código: ' + p.codigo + '  (el cliente lo verá al inicio de su mensaje de WhatsApp)',
    'Tipo: ' + TIPOS[p.tipo],
    '',
    p.productos,
    '',
    p.total !== null ? 'Total referencial: S/ ' + p.total.toFixed(2) : 'Sin total (por cotizar)',
    p.detalle ? '\nDetalle:\n' + p.detalle : '',
    p.pagina ? '\nPágina: ' + p.pagina : '',
    '',
    'Si el mensaje no llega por WhatsApp, el cliente no completó el envío.',
    'Hoja de pedidos: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
  ].join('\n');
  MailApp.sendEmail(AVISO_CORREO, asunto, cuerpo);
}

function respuesta_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- correo diario de pedidos sin cerrar ----------

/** Ejecutar UNA vez a mano: programa «resumenDiario» todos los días a las RESUMEN_HORA (hora de Lima). */
function instalarResumen() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'resumenDiario'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('resumenDiario').timeBased().atHour(RESUMEN_HORA).everyDays(1).inTimezone(ZONA).create();
  Logger.log('Listo: cada día a las ' + RESUMEN_HORA + ':00 llegará a ' + AVISO_CORREO + ' la lista de pedidos sin cerrar (solo si hay).');
}

/** Correo con los pedidos en «Nuevo» de más de 24 h y el resumen de las últimas 24 h. Sin pendientes, no envía nada. */
function resumenDiario() {
  const hoja = hoja_();
  const ultima = hoja.getLastRow();
  const filas = ultima > 1 ? hoja.getRange(2, 1, ultima - 1, COLUMNAS.length).getValues() : [];
  const ahora = new Date().getTime();
  const HORA = 3600 * 1000;
  const conFecha = filas.map(function (f) { return { f: f, t: new Date(f[1]).getTime() }; })
    .filter(function (x) { return !isNaN(x.t); });
  const nuevos = conFecha.filter(function (x) { return String(x.f[9]).trim() === 'Nuevo' && ahora - x.t >= PENDIENTE_HORAS * HORA; });
  const recientes = nuevos.filter(function (x) { return ahora - x.t < PENDIENTE_DIAS * 24 * HORA; })
    .sort(function (a, b) { return b.t - a.t; });
  const antiguos = nuevos.length - recientes.length;
  if (!nuevos.length || !AVISO_CORREO || MailApp.getRemainingDailyQuota() < 3) return;

  const ultimas24 = conFecha.filter(function (x) { return ahora - x.t < 24 * HORA; });
  const porTipo = {};
  ultimas24.forEach(function (x) { porTipo[x.f[3]] = (porTipo[x.f[3]] || 0) + 1; });
  const tipos = Object.keys(porTipo).map(function (k) { return porTipo[k] + ' ' + k; }).join(', ');

  const lineas = recientes.map(function (x) {
    const f = x.f;
    const total = f[6] === '' || f[6] === null ? 'por cotizar' : 'S/ ' + Number(f[6]).toFixed(2);
    const productos = String(f[4]).split('\n');
    return '• ' + f[2] + ' · ' + Utilities.formatDate(new Date(x.t), ZONA, 'dd/MM HH:mm') + ' · ' + f[3] + ' · ' + total +
      '\n   ' + productos[0] + (productos.length > 1 ? ' (+' + (productos.length - 1) + ' más)' : '');
  });
  const cuerpo = [
    'Pedidos de la web que siguen en «Nuevo» desde hace más de ' + PENDIENTE_HORAS + ' h:',
    '',
    lineas.join('\n'),
    antiguos ? '\nAdemás hay ' + antiguos + ' en «Nuevo» de hace más de ' + PENDIENTE_DIAS + ' días: márcalos como «Sin respuesta» o «Cancelado».' : '',
    '',
    'Qué hacer: busca el código en WhatsApp (el cliente lo ve al inicio de su mensaje) y retoma la conversación.',
    'Si no aparece en WhatsApp, el cliente no llegó a enviar el mensaje: no hay forma de contactarlo.',
    'Cuando lo atiendas, cambia su Estado en la hoja (Confirmado, Sin respuesta, Cancelado…) y no volverá a salir aquí.',
    '',
    'Últimas 24 h: ' + (ultimas24.length ? ultimas24.length + (ultimas24.length === 1 ? ' registro (' : ' registros (') + tipos + ')' : 'ningún registro nuevo') + '.',
    'Hoja de pedidos: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
  ].join('\n');
  const asunto = 'S3D: ' + nuevos.length + (nuevos.length === 1 ? ' pedido por retomar' : ' pedidos por retomar');
  MailApp.sendEmail(AVISO_CORREO, asunto, cuerpo);
}
