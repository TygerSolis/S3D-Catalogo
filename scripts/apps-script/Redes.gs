/**
 * Publicación automática de S3D en Facebook e Instagram (Google Apps Script vinculado a la hoja del catálogo).
 *
 * La página interna /redes/ de la web llama a este script con la CLAVE del dueño. El script:
 *   1. lee los textos y fotos de cada producto de la web PUBLICADA (redes/publicaciones.json): nadie puede enviarle
 *      otro contenido, solo elegir un producto de la cola;
 *   2. publica con la API de Meta (Graph API) en la página de Facebook y en el Instagram profesional vinculado:
 *      fotos (publicación con varias fotos / carrusel) o el video (Reel);
 *   3. anota cada resultado en la pestaña «publicaciones» de la hoja (fecha, producto, red, enlace o error);
 *   4. publica solos, 2 por día (HORAS), los productos que el dueño aprobó con «Aprobar».
 * Nunca publica dos veces lo mismo: si una red ya salió, la salta (un reintento solo completa la que falló).
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   CLAVE          la clave del dueño (la crea «generarClave»)
 *   APP_ID, APP_SECRET, TOKEN_TEMPORAL   para «guardarPermiso» (que deja META_TOKEN y borra TOKEN_TEMPORAL)
 *   META_TOKEN     permiso de publicación de la página (no vence; se invalida si cambias la contraseña de Facebook)
 * Instalación paso a paso: docs/guia-redes.md
 */
const SITIO = 'https://tygersolis.github.io/S3D-Catalogo/';
const API = 'https://graph.facebook.com/v27.0/';
const ZONA = 'America/Lima';
const HORAS = [11, 19];            // publicaciones programadas: 2 por día
const HOJA = 'publicaciones';
const COLUMNAS = ['Fecha', 'Producto', 'Nombre', 'Tipo', 'Red', 'Estado', 'Enlace', 'Detalle'];
const AVISO_CORREO = 'ventas.s3d@gmail.com';
const MAX_FALLOS_CLAVE = 10;       // claves erradas por hora antes de bloquear
const REDES = ['facebook', 'instagram'];

function doGet() {
  return ContentService.createTextOutput('Publicación en redes S3D: activo');
}

function doPost(e) {
  try {
    const datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    comprobarClave_(datos.clave);
    const id = Number(datos.id);
    const tipo = datos.tipo === 'reel' ? 'reel' : 'fotos';
    switch (datos.accion) {
      case 'estado': return respuesta_({ ok: true, estado: estado_(), horas: HORAS });
      case 'publicar': return respuesta_({ ok: true, resultado: publicar_(id, tipo), estado: estado_() });
      case 'aprobar': return respuesta_({ ok: true, resultado: programar_(id, tipo, true), estado: estado_() });
      case 'cancelar': return respuesta_({ ok: true, resultado: programar_(id, tipo, false), estado: estado_() });
      default: throw new Error('acción desconocida');
    }
  } catch (error) {
    return respuesta_({ ok: false, error: String(error && error.message || error) });
  }
}

function respuesta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- clave del dueño

function comprobarClave_(clave) {
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get('fallos-clave') || 0);
  if (fallos >= MAX_FALLOS_CLAVE) throw new Error('demasiados intentos con clave incorrecta; espera una hora');
  const real = PropertiesService.getScriptProperties().getProperty('CLAVE') || '';
  if (real.length < 20) throw new Error('falta configurar la CLAVE del script (ejecuta generarClave)');
  if (!igualSeguro_(String(clave || ''), real)) {
    cache.put('fallos-clave', String(fallos + 1), 3600);
    throw new Error('clave incorrecta');
  }
}

/** Compara sin cortar en la primera diferencia (no revela por el tiempo cuántos caracteres coinciden). */
function igualSeguro_(a, b) {
  let distinto = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) distinto |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return distinto === 0;
}

/** Ejecutar UNA vez a mano: crea una clave al azar, la guarda y la muestra en el registro para copiarla al celular. */
function generarClave() {
  const clave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
  PropertiesService.getScriptProperties().setProperty('CLAVE', clave);
  console.log('Tu clave (cópiala en la página de publicaciones): ' + clave);
  return clave;
}

// ---------------------------------------------------------------- permiso de Meta

/**
 * Ejecutar a mano tras pegar en las propiedades APP_ID, APP_SECRET y TOKEN_TEMPORAL (el token de usuario del
 * Explorador de la Graph API). Lo cambia por uno de larga duración, obtiene el permiso de la página (que no vence),
 * lo guarda como META_TOKEN y borra TOKEN_TEMPORAL.
 */
function guardarPermiso() {
  const props = PropertiesService.getScriptProperties();
  // trim: un espacio o salto de línea al pegar el valor hace que Meta no lo reconozca.
  const [appId, secreto, temporal] = ['APP_ID', 'APP_SECRET', 'TOKEN_TEMPORAL'].map(k => (props.getProperty(k) || '').trim());
  if (!appId || !secreto || !temporal) throw new Error('faltan APP_ID, APP_SECRET o TOKEN_TEMPORAL en las propiedades');
  const largo = get_('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: appId, client_secret: secreto, fb_exchange_token: temporal }, '');
  const paginas = get_('me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}' }, largo.access_token).data || [];
  if (!paginas.length) throw new Error('el token no tiene acceso a ninguna página: revisa los permisos marcados (guía, paso 2)');
  const pagina = paginas.find(p => p.instagram_business_account) || paginas[0];
  props.setProperty('META_TOKEN', pagina.access_token);
  props.setProperty('PAGINA_ID', pagina.id);
  if (pagina.instagram_business_account) props.setProperty('INSTAGRAM_ID', pagina.instagram_business_account.id);
  props.deleteProperty('TOKEN_TEMPORAL');
  console.log('Listo: página «' + pagina.name + '»' + (pagina.instagram_business_account
    ? ' e Instagram @' + pagina.instagram_business_account.username : ' (SIN Instagram vinculado: revisa la guía)'));
}

/** Ejecutar a mano para comprobar la conexión sin publicar nada. */
function probarConexion() {
  const p = get_('me', { fields: 'id,name,instagram_business_account{id,username}' });
  console.log('Página: ' + p.name + ' (' + p.id + ')');
  console.log(p.instagram_business_account ? 'Instagram: @' + p.instagram_business_account.username : 'Instagram: NO vinculado a la página');
  return p;
}

function cuentas_() {
  const props = PropertiesService.getScriptProperties();
  let pagina = props.getProperty('PAGINA_ID');
  let instagram = props.getProperty('INSTAGRAM_ID');
  if (!pagina || !instagram) {
    const p = get_('me', { fields: 'id,instagram_business_account' });
    pagina = p.id;
    instagram = p.instagram_business_account && p.instagram_business_account.id;
    props.setProperty('PAGINA_ID', pagina);
    if (instagram) props.setProperty('INSTAGRAM_ID', instagram);
  }
  return { pagina: pagina, instagram: instagram };
}

function token_() {
  const t = (PropertiesService.getScriptProperties().getProperty('META_TOKEN') || '').trim();
  if (!t) throw new Error('falta el permiso de Meta (META_TOKEN): sigue la guía, paso 3');
  return t;
}

function llamar_(metodo, ruta, params, token) {
  const datos = Object.assign({}, params, { access_token: token === undefined ? token_() : token });
  if (!datos.access_token) delete datos.access_token;
  const consulta = Object.keys(datos).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(datos[k])).join('&');
  const r = metodo === 'get'
    ? UrlFetchApp.fetch(API + ruta + '?' + consulta, { muteHttpExceptions: true })
    : UrlFetchApp.fetch(API + ruta, { method: 'post', payload: datos, muteHttpExceptions: true });
  let cuerpo;
  try { cuerpo = JSON.parse(r.getContentText()); } catch (e) { cuerpo = {}; }
  if (r.getResponseCode() >= 400 || cuerpo.error) throw new Error(errorMeta_(cuerpo.error || {}, r.getResponseCode()));
  return cuerpo;
}
const get_ = (ruta, params, token) => llamar_('get', ruta, params, token);
const post_ = (ruta, params) => llamar_('post', ruta, params);

/** Mensajes de Meta en palabras simples (el original va entre paréntesis para buscarlo si hace falta). */
function errorMeta_(error, http) {
  const original = ' (Meta ' + (error.code || http) + ': ' + (error.error_user_msg || error.message || 'sin detalle') + ')';
  if (error.code === 101 || error.code === 1 && /client|secret/i.test(error.message || '')) {
    return 'Meta no reconoce APP_ID o APP_SECRET: copia el «Identificador de la app» y la «Clave secreta de la app» de Configuración de la app → Básica (no los de Instagram)' + original;
  }
  if (error.code === 190) return 'el permiso de Meta venció o fue revocado: genera uno nuevo (guía, paso 3)' + original;
  if (error.code === 10 || error.code === 200 || error.code === 3) return 'falta un permiso en la app de Meta (guía, paso 2)' + original;
  if ([4, 17, 32, 613].indexOf(error.code) > -1 || error.code === 9) return 'Meta pide esperar: demasiadas publicaciones seguidas' + original;
  if (error.code === 9004 || error.code === 36003 || error.error_subcode === 2207052) return 'Meta no pudo descargar la foto o el video de la web' + original;
  return 'Meta rechazó la solicitud' + original;
}

// ---------------------------------------------------------------- contenido (de la web publicada)

function contenido_(id, tipo) {
  const r = UrlFetchApp.fetch(SITIO + 'redes/publicaciones.json?t=' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('no se pudo leer redes/publicaciones.json de la web');
  const p = JSON.parse(r.getContentText()).productos[String(id)];
  if (!p) throw new Error('el producto ' + id + ' no está en la cola de la web principal (¿falta el «aprobado»?)');
  if (tipo === 'reel' && !p.video) throw new Error('el producto ' + id + ' no tiene video');
  if (tipo === 'fotos' && !p.fotos.length) throw new Error('el producto ' + id + ' no tiene fotos');
  return p;
}

// ---------------------------------------------------------------- publicar

function publicar_(id, tipo) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('hay otra publicación en curso; espera un momento y vuelve a intentar');
  try {
    const p = contenido_(id, tipo);
    const actual = estado_()[id + ':' + tipo] || {};
    const cuentas = cuentas_();
    const resultado = {};
    REDES.forEach(red => {
      if (actual[red] && actual[red].estado === 'publicado') { resultado[red] = actual[red]; return; }
      try {
        if (red === 'instagram' && !cuentas.instagram) throw new Error('la página de Facebook no tiene un Instagram profesional vinculado');
        const enlace = red === 'facebook'
          ? (tipo === 'fotos' ? facebookFotos_(cuentas.pagina, p) : facebookVideo_(cuentas.pagina, p))
          : (tipo === 'fotos' ? instagramFotos_(cuentas.instagram, p) : instagramReel_(cuentas.instagram, p));
        anotar_(id, p.nombre, tipo, red, 'publicado', enlace, '');
        resultado[red] = { estado: 'publicado', enlace: enlace };
      } catch (error) {
        anotar_(id, p.nombre, tipo, red, 'error', '', error.message);
        resultado[red] = { estado: 'error', detalle: error.message };
      }
    });
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

function facebookFotos_(pagina, p) {
  // Cada foto se sube sin publicar y luego todas van juntas en una sola publicación con el texto.
  const params = { message: p.facebook };
  p.fotos.forEach((url, i) => {
    const foto = post_(pagina + '/photos', { url: url, published: 'false' });
    params['attached_media[' + i + ']'] = JSON.stringify({ media_fbid: foto.id });
  });
  const post = post_(pagina + '/feed', params);
  return 'https://www.facebook.com/' + post.id;
}

function facebookVideo_(pagina, p) {
  const video = post_(pagina + '/videos', { file_url: p.video, description: p.facebook });
  return 'https://www.facebook.com/' + pagina + '/videos/' + video.id;
}

function instagramFotos_(ig, p) {
  let contenedor;
  if (p.fotos.length === 1) {
    contenedor = post_(ig + '/media', { image_url: p.fotos[0], caption: p.instagram }).id;
  } else {
    const hijos = p.fotos.map(url => post_(ig + '/media', { image_url: url, is_carousel_item: 'true' }).id);
    hijos.forEach(h => esperarContenedor_(h, 3000, 10));
    contenedor = post_(ig + '/media', { media_type: 'CAROUSEL', children: hijos.join(','), caption: p.instagram }).id;
  }
  esperarContenedor_(contenedor, 3000, 10);
  return publicarInstagram_(ig, contenedor);
}

function instagramReel_(ig, p) {
  const contenedor = post_(ig + '/media', { media_type: 'REELS', video_url: p.video, caption: p.instagram, share_to_feed: 'true' }).id;
  esperarContenedor_(contenedor, 10000, 27);   // Instagram procesa el video: hasta ~4,5 minutos
  return publicarInstagram_(ig, contenedor);
}

function esperarContenedor_(id, pausa, intentos) {
  for (let i = 0; i < intentos; i++) {
    const estado = get_(id, { fields: 'status_code,status' });
    if (estado.status_code === 'FINISHED') return;
    if (estado.status_code === 'ERROR' || estado.status_code === 'EXPIRED') {
      throw new Error('Instagram no pudo procesar la foto o el video (' + (estado.status || estado.status_code) + ')');
    }
    Utilities.sleep(pausa);
  }
  throw new Error('Instagram tardó demasiado en procesar el contenido; vuelve a intentar en unos minutos');
}

function publicarInstagram_(ig, contenedor) {
  const media = post_(ig + '/media_publish', { creation_id: contenedor });
  try {
    return get_(media.id, { fields: 'permalink' }).permalink || 'https://www.instagram.com/';
  } catch (e) {
    return 'https://www.instagram.com/';
  }
}

// ---------------------------------------------------------------- programación (2 por día)

function programar_(id, tipo, aprobar) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('el script está ocupado; vuelve a intentar');
  try {
    const actual = estado_()[id + ':' + tipo] || {};
    if (!aprobar) {
      if (actual.programado) anotar_(id, actual.nombre || '', tipo, '', 'cancelado', '', '');
      return { programado: false };
    }
    if (REDES.every(red => actual[red] && actual[red].estado === 'publicado')) throw new Error('ya está publicado en Facebook e Instagram');
    if (actual.programado) return { programado: true };
    const p = contenido_(id, tipo);
    anotar_(id, p.nombre, tipo, '', 'programado', '', '');
    return { programado: true };
  } finally {
    lock.releaseLock();
  }
}

/** Lo ejecutan los activadores diarios (ver «instalar»): publica el primer producto aprobado que espera. */
function publicarProgramadas() {
  const cola = programadas_();
  if (!cola.length) return;
  const siguiente = cola[0];
  const resultado = publicar_(siguiente.id, siguiente.tipo);
  const errores = REDES.filter(red => resultado[red] && resultado[red].estado === 'error');
  if (errores.length) {
    MailApp.sendEmail(AVISO_CORREO, 'S3D: falló una publicación programada',
      'Producto ' + siguiente.id + ' (' + siguiente.tipo + '):\n' + errores.map(red => red + ': ' + resultado[red].detalle).join('\n') +
      '\n\nPuedes reintentarlo con «Publicar ahora» en la página de publicaciones: solo se completa la red que falló.');
  }
}

/** Ejecutar UNA vez a mano: crea la pestaña «publicaciones» y los activadores de las HORAS (hora de Lima). */
function instalar() {
  hoja_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'publicarProgramadas')
    .forEach(t => ScriptApp.deleteTrigger(t));
  HORAS.forEach(h => ScriptApp.newTrigger('publicarProgramadas').timeBased().atHour(h).everyDays(1).inTimezone(ZONA).create());
  console.log('Listo: publicaciones programadas a las ' + HORAS.join(':00 y ') + ':00 (hora de Lima).');
}

// ---------------------------------------------------------------- registro en la hoja

function hoja_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA);
    hoja.appendRow(COLUMNAS);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold').setBackground('#002244').setFontColor('#ffffff');
    hoja.getRange('A2:A').setNumberFormat('dd/mm/yyyy hh:mm');
  }
  return hoja;
}

function anotar_(id, nombre, tipo, red, estado, enlace, detalle) {
  hoja_().appendRow([new Date(), id, nombre, tipo, red, estado, enlace, String(detalle).slice(0, 500)]);
}

/**
 * Estado de cada «producto:tipo» según la hoja (la última fila manda):
 *   { '3001:fotos': { nombre, programado: fecha ISO | null, salida: fecha ISO prevista, facebook: {estado, fecha, enlace, detalle}, instagram: {…} } }
 * Una fila «programado» lo pone en espera; «cancelado» o cualquier publicación/error lo saca de la espera.
 */
function estado_() {
  const filas = hoja_().getDataRange().getValues().slice(1);
  const estado = {};
  filas.forEach(f => {
    const fecha = f[0] instanceof Date ? f[0] : new Date(f[0]);
    const clave = f[1] + ':' + f[3];
    const e = estado[clave] = estado[clave] || { nombre: f[2], programado: null };
    if (f[5] === 'programado') e.programado = fecha.toISOString();
    else if (f[5] === 'cancelado') e.programado = null;
    else if (f[4]) {
      e[f[4]] = { estado: f[5], fecha: fecha.toISOString(), enlace: f[6] || '', detalle: f[7] || '' };
      e.programado = null;
    }
  });
  const cola = programadas_(estado);
  const salidas = horarios_(cola.length);
  cola.forEach((item, i) => { estado[item.id + ':' + item.tipo].salida = salidas[i].toISOString(); });
  return estado;
}

/** Productos aprobados que esperan, del más antiguo al más nuevo. */
function programadas_(estado) {
  const e = estado || estado_();
  return Object.keys(e)
    .filter(k => e[k].programado)
    .sort((a, b) => e[a].programado < e[b].programado ? -1 : 1)
    .map(k => ({ id: Number(k.split(':')[0]), tipo: k.split(':')[1] }));
}

/** Los próximos n horarios de publicación (HORAS, hora de Lima) a partir de ahora. */
function horarios_(n) {
  const salida = [];
  const ahora = new Date();
  for (let dia = 0; salida.length < n; dia++) {
    HORAS.forEach(h => {
      const d = new Date(Utilities.formatDate(ahora, ZONA, 'yyyy-MM-dd') + 'T' + ('0' + h).slice(-2) + ':00:00-05:00');
      d.setUTCDate(d.getUTCDate() + dia);
      if (d > ahora && salida.length < n) salida.push(d);
    });
  }
  return salida;
}
