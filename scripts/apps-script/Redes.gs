/**
 * Publicación automática de S3D en Facebook e Instagram (Google Apps Script vinculado a la hoja del catálogo).
 *
 * La página interna /redes/ de la web llama a este script con la CLAVE del dueño. El script:
 *   1. lee los textos y fotos de cada producto de la web PUBLICADA (redes/publicaciones.json): nadie puede enviarle
 *      otro contenido, solo elegir un producto de la cola;
 *   2. publica con la API de Meta (Graph API) en la página de Facebook y en el Instagram profesional vinculado:
 *      fotos (publicación con varias fotos / carrusel) o el video (Reel);
 *   3. con las fotos publica también una HISTORIA en Facebook e Instagram (imagen 9:16 con nombre, precio y WhatsApp);
 *   4. anota cada resultado en la pestaña «publicaciones» de la hoja (fecha, producto, red, enlace o error, id de Meta);
 *   5. publica solos, 2 por día (HORAS), los productos que el dueño aprobó con «Aprobar»;
 *   6. cada lunes (informeSemanal) escribe en la pestaña «resultados» el alcance, vistas, me gusta, comentarios,
 *      guardados y compartidos de cada publicación de los últimos DIAS_INFORME días y manda un resumen por correo.
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
const COLUMNAS = ['Fecha', 'Producto', 'Nombre', 'Tipo', 'Red', 'Estado', 'Enlace', 'Detalle', 'IdMeta'];
const AVISO_CORREO = 'ventas.s3d@gmail.com';
const MAX_FALLOS_CLAVE = 10;       // claves erradas por hora antes de bloquear
const REDES = ['facebook', 'instagram'];   // publicaciones (las historias se agregan con redesDe_)
const HISTORIAS = ['historia_facebook', 'historia_instagram'];
const HOJA_RESULTADOS = 'resultados';
const DIAS_INFORME = 60;

/** Redes de una publicación: con las fotos van también las historias (si la web ya tiene la imagen 9:16). */
function redesDe_(tipo, p) {
  return tipo === 'fotos' && p && p.historia ? REDES.concat(HISTORIAS) : REDES;
}

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
    redesDe_(tipo, p).forEach(red => {
      if (actual[red] && actual[red].estado === 'publicado') { resultado[red] = actual[red]; return; }
      try {
        if (/instagram/.test(red) && !cuentas.instagram) throw new Error('la página de Facebook no tiene un Instagram profesional vinculado');
        const hecho = {
          facebook: () => (tipo === 'fotos' ? facebookFotos_(cuentas.pagina, p) : facebookVideo_(cuentas.pagina, p)),
          instagram: () => (tipo === 'fotos' ? instagramFotos_(cuentas.instagram, p) : instagramReel_(cuentas.instagram, p)),
          historia_facebook: () => facebookHistoria_(cuentas.pagina, p),
          historia_instagram: () => instagramHistoria_(cuentas.instagram, p)
        }[red]();
        anotar_(id, p.nombre, tipo, red, 'publicado', hecho.enlace, '', hecho.id);
        resultado[red] = { estado: 'publicado', enlace: hecho.enlace };
      } catch (error) {
        anotar_(id, p.nombre, tipo, red, 'error', '', error.message, '');
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
  return { enlace: 'https://www.facebook.com/' + post.id, id: post.id };
}

function facebookVideo_(pagina, p) {
  const video = post_(pagina + '/videos', { file_url: p.video, description: p.facebook });
  return { enlace: 'https://www.facebook.com/' + pagina + '/videos/' + video.id, id: video.id };
}

function facebookHistoria_(pagina, p) {
  const foto = post_(pagina + '/photos', { url: p.historia, published: 'false' });
  const historia = post_(pagina + '/photo_stories', { photo_id: foto.id });
  return { enlace: 'https://www.facebook.com/' + pagina, id: historia.post_id || historia.id || foto.id };
}

function instagramHistoria_(ig, p) {
  const contenedor = post_(ig + '/media', { image_url: p.historia, media_type: 'STORIES' }).id;
  esperarContenedor_(contenedor, 3000, 10);
  return publicarInstagram_(ig, contenedor);
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
  let enlace = 'https://www.instagram.com/';
  try {
    enlace = get_(media.id, { fields: 'permalink' }).permalink || enlace;
  } catch (e) { /* el enlace es opcional */ }
  return { enlace: enlace, id: media.id };
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
    const p = contenido_(id, tipo);
    if (redesDe_(tipo, p).every(red => actual[red] && actual[red].estado === 'publicado')) throw new Error('ya está publicado en Facebook e Instagram');
    if (actual.programado) return { programado: true };
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
  const errores = Object.keys(resultado).filter(red => resultado[red].estado === 'error');
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
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'informeSemanal')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('informeSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone(ZONA).create();
  console.log('Listo: publicaciones programadas a las ' + HORAS.join(':00 y ') + ':00 e informe cada lunes a las 8:00 (hora de Lima).');
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
  } else if (hoja.getRange(1, COLUMNAS.length).getValue() !== COLUMNAS[COLUMNAS.length - 1]) {
    // Pestaña creada con una versión anterior: se completa el encabezado (columnas nuevas al final).
    hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold').setBackground('#002244').setFontColor('#ffffff');
  }
  return hoja;
}

function anotar_(id, nombre, tipo, red, estado, enlace, detalle, idMeta) {
  hoja_().appendRow([new Date(), id, nombre, tipo, red, estado, enlace, String(detalle).slice(0, 500), idMeta ? String(idMeta) : '']);
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
      e[f[4]] = { estado: f[5], fecha: fecha.toISOString(), enlace: f[6] || '', detalle: f[7] || '', id: f[8] ? String(f[8]) : '' };
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

// ---------------------------------------------------------------- informe semanal

const COLUMNAS_RESULTADOS = ['Producto', 'Nombre', 'Tipo', 'Red', 'Publicado', 'Alcance', 'Vistas', 'Me gusta',
  'Comentarios', 'Guardados', 'Compartidos', 'Interacciones', 'Enlace', 'Nota'];

/**
 * Lo ejecuta el activador de los lunes (o a mano): reescribe la pestaña «resultados» con las métricas de cada
 * publicación (no historias: Meta las borra a las 24 h) de los últimos DIAS_INFORME días y manda un resumen.
 * Métricas: Instagram /insights (reach, views, saved, shares) + like_count/comments_count; Facebook
 * post_total_media_view_unique (alcance), post_media_view (vistas), reacciones, comentarios y compartidos.
 * Necesita los permisos instagram_manage_insights y read_insights (guía, paso 6).
 */
function informeSemanal() {
  const estado = estado_();
  const desde = new Date(Date.now() - DIAS_INFORME * 86400000);
  const cuentas = cuentas_();
  const filas = [];
  Object.keys(estado).forEach(clave => {
    const [id, tipo] = clave.split(':');
    REDES.forEach(red => {
      const r = estado[clave][red];
      if (!r || r.estado !== 'publicado' || new Date(r.fecha) < desde) return;
      const m = metricas_(red, r, cuentas);
      const interacciones = ['me_gusta', 'comentarios', 'guardados', 'compartidos'].reduce((s, k) => s + (Number(m[k]) || 0), 0);
      filas.push([Number(id), estado[clave].nombre, tipo, red, new Date(r.fecha), m.alcance, m.vistas, m.me_gusta,
        m.comentarios, m.guardados, m.compartidos, interacciones, r.enlace, m.nota || '']);
    });
  });
  filas.sort((a, b) => b[11] - a[11]);
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA_RESULTADOS) || libro.insertSheet(HOJA_RESULTADOS);
  hoja.clear();
  hoja.getRange(1, 1, 1, COLUMNAS_RESULTADOS.length).setValues([COLUMNAS_RESULTADOS])
    .setFontWeight('bold').setBackground('#002244').setFontColor('#ffffff');
  hoja.setFrozenRows(1);
  if (filas.length) {
    hoja.getRange(2, 1, filas.length, COLUMNAS_RESULTADOS.length).setValues(filas);
    hoja.getRange(2, 5, filas.length, 1).setNumberFormat('dd/mm/yyyy');
  }
  MailApp.sendEmail(AVISO_CORREO, 'S3D: resultados de tus publicaciones', resumen_(filas, libro.getUrl()));
  return filas.length;
}

function resumen_(filas, url) {
  const semana = filas.filter(f => f[4] >= new Date(Date.now() - 7 * 86400000));
  const total = (lista, col) => lista.reduce((s, f) => s + (Number(f[col]) || 0), 0);
  const lineas = ['Resumen de tus publicaciones en Facebook e Instagram.', ''];
  lineas.push('Esta semana: ' + semana.length + ' publicaciones · alcance ' + total(semana, 5) + ' · interacciones ' + total(semana, 11) + '.');
  REDES.forEach(red => {
    const deRed = semana.filter(f => f[3] === red);
    if (deRed.length) lineas.push('  ' + red + ': ' + deRed.length + ' publicaciones, alcance ' + total(deRed, 5) + ', interacciones ' + total(deRed, 11));
  });
  lineas.push('', 'Las que más gustaron (últimos ' + DIAS_INFORME + ' días):');
  filas.slice(0, 5).forEach((f, i) => lineas.push('  ' + (i + 1) + '. ' + f[1] + ' (' + f[3] + '): ' + f[11] + ' interacciones, alcance ' + (f[5] === '' ? '—' : f[5]) + ' · ' + f[12]));
  if (!filas.length) lineas.push('  Todavía no hay publicaciones con datos.');
  const notas = filas.filter(f => f[13]).length;
  if (notas) lineas.push('', notas + ' publicaciones sin algunos datos: revisa la columna «Nota» de la pestaña resultados.');
  lineas.push('', 'Detalle completo en la pestaña «resultados»: ' + url,
    'Las visitas a la web que llegaron desde cada red las ves en Umami (fuente: facebook, instagram, marketplace).');
  return lineas.join('\n');
}

function valorInsight_(datos, nombre) {
  const m = (datos || []).find(x => x.name === nombre);
  if (!m) return '';
  if (m.total_value && m.total_value.value !== undefined) return m.total_value.value;
  return m.values && m.values.length ? m.values[m.values.length - 1].value : '';
}

function metricas_(red, r, cuentas) {
  const m = { alcance: '', vistas: '', me_gusta: '', comentarios: '', guardados: '', compartidos: '', nota: '' };
  const nota = e => { m.nota = m.nota || (/permiso/.test(e.message) ? 'falta el permiso de estadísticas (guía, paso 6)' : e.message.slice(0, 200)); };
  if (red === 'instagram') {
    const id = r.id || idInstagramDe_(r.enlace, cuentas.instagram);
    if (!id) { m.nota = 'no se encontró la publicación en Instagram'; return m; }
    try {
      const b = get_(id, { fields: 'like_count,comments_count' });
      m.me_gusta = b.like_count === undefined ? '' : b.like_count;
      m.comentarios = b.comments_count === undefined ? '' : b.comments_count;
    } catch (e) { nota(e); }
    try {
      const d = get_(id + '/insights', { metric: 'reach,views,saved,shares' }).data;
      m.alcance = valorInsight_(d, 'reach');
      m.vistas = valorInsight_(d, 'views');
      m.guardados = valorInsight_(d, 'saved');
      m.compartidos = valorInsight_(d, 'shares');
    } catch (e) { nota(e); }
  } else {
    const id = r.id || (String(r.enlace).match(/facebook\.com\/(?:\d+\/videos\/)?([\d_]+)/) || [])[1];
    if (!id) { m.nota = 'no se encontró la publicación en Facebook'; return m; }
    try {
      const b = get_(id, { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)' + (/_/.test(id) ? ',shares' : '') });
      m.me_gusta = b.reactions && b.reactions.summary ? b.reactions.summary.total_count : '';
      m.comentarios = b.comments && b.comments.summary ? b.comments.summary.total_count : '';
      if (/_/.test(id)) m.compartidos = b.shares ? b.shares.count : 0;
    } catch (e) { nota(e); }
    if (/_/.test(id)) {   // los ids de publicaciones llevan «página_post»; los videos no tienen estas métricas
      try {
        const d = get_(id + '/insights', { metric: 'post_total_media_view_unique,post_media_view' }).data;
        m.alcance = valorInsight_(d, 'post_total_media_view_unique');
        m.vistas = valorInsight_(d, 'post_media_view');
      } catch (e) { nota(e); }
    }
  }
  return m;
}

/** Publicaciones anotadas antes de guardar el id de Meta: se buscan por su enlace entre las últimas del Instagram. */
function idInstagramDe_(enlace, ig) {
  if (!ig || !enlace) return '';
  if (!idInstagramDe_.cache) {
    try {
      idInstagramDe_.cache = get_(ig + '/media', { fields: 'id,permalink', limit: 100 }).data || [];
    } catch (e) {
      idInstagramDe_.cache = [];
    }
  }
  const limpio = String(enlace).split('?')[0].replace(/\/$/, '');
  const m = idInstagramDe_.cache.find(x => String(x.permalink || '').split('?')[0].replace(/\/$/, '') === limpio);
  return m ? m.id : '';
}
