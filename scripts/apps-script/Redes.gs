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
 * TikTok (docs/guia-tiktok.md): «Enviar a TikTok» manda las fotos (carrusel) o el video a la BANDEJA de TikTok del
 * dueño (modo MEDIA_UPLOAD, permitido sin la auditoría de TikTok); él elige la música y publica en la app. Propiedades:
 * TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET y URL_APP (la URL /exec); «conectarTikTok» da el enlace para autorizar y
 * doGet recibe el código. El permiso dura 2 h y se renueva solo con el de renovación (180 días, cambia en cada uso).
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

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.code || p.error) return ContentService.createTextOutput(terminarConexionTikTok_(p));
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
      case 'tiktok': return respuesta_({ ok: true, resultado: enviarTikTok_(id, tipo), estado: estado_() });
      case 'tiktok-info': return respuesta_({ ok: true, creador: creadorTikTok_() });
      case 'tiktok-revisar': return respuesta_({ ok: true, resultado: revisarTikTokProducto_(id, tipo), estado: estado_() });
      case 'tiktok-publicar': return respuesta_({ ok: true, resultado: publicarTikTok_(id, tipo, datos.opciones || {}), estado: estado_() });
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

const PERMISOS = ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts',
  'business_management', 'read_insights', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'];

/**
 * Ejecutar a mano: pregunta a Meta qué permisos tiene de verdad el token guardado (debug_token, con APP_ID y
 * APP_SECRET) y lista los que faltan. Si falta alguno: agrégalo en la app y genera el token otra vez (guía, paso 3).
 */
function revisarPermisos() {
  const props = PropertiesService.getScriptProperties();
  const app = (props.getProperty('APP_ID') || '').trim() + '|' + (props.getProperty('APP_SECRET') || '').trim();
  const d = get_('debug_token', { input_token: token_() }, app).data || {};
  const tiene = d.scopes || [];
  const faltan = PERMISOS.filter(p => tiene.indexOf(p) === -1);
  console.log('Permisos del token: ' + tiene.join(', '));
  console.log(faltan.length ? 'FALTAN: ' + faltan.join(', ') + ' → agrégalos en la app y genera el token otra vez (guía, paso 3, puntos 4 a 6)'
    : 'Están todos los permisos necesarios.');
  if (d.is_valid === false) console.log('El token NO es válido: genera uno nuevo (guía, paso 3).');
  return faltan;
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
      if (f[4] !== 'tiktok') e.programado = null;   // enviar a TikTok no cuenta como publicar lo programado
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
 * Necesita los permisos instagram_manage_insights, read_insights y pages_read_user_content (guía, paso 6);
 * «revisarPermisos» dice cuáles tiene el token.
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
  try { renovarTikTok(); } catch (e) { /* si TikTok pide reconectar, se avisa al enviar */ }
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
  // La nota dice qué dato falló y por qué (el mensaje de Meta va entre paréntesis); «revisarPermisos» dice qué falta.
  const nota = (que, e) => {
    const texto = que + ': ' + (/permiso/.test(e.message) ? 'falta un permiso (ejecuta revisarPermisos) ' : '') + e.message;
    m.nota = (m.nota ? m.nota + ' | ' : '') + texto.slice(0, 250);
  };
  if (red === 'instagram') {
    const id = r.id || idInstagramDe_(r.enlace, cuentas.instagram);
    if (!id) { m.nota = 'no se encontró la publicación en Instagram'; return m; }
    try {
      const b = get_(id, { fields: 'like_count,comments_count' });
      m.me_gusta = b.like_count === undefined ? '' : b.like_count;
      m.comentarios = b.comments_count === undefined ? '' : b.comments_count;
    } catch (e) { nota('me gusta y comentarios', e); }
    try {
      const d = get_(id + '/insights', { metric: 'reach,views,saved,shares' }).data;
      m.alcance = valorInsight_(d, 'reach');
      m.vistas = valorInsight_(d, 'views');
      m.guardados = valorInsight_(d, 'saved');
      m.compartidos = valorInsight_(d, 'shares');
    } catch (e) { nota('alcance y vistas', e); }
  } else {
    const id = r.id || (String(r.enlace).match(/facebook\.com\/(?:\d+\/videos\/)?([\d_]+)/) || [])[1];
    if (!id) { m.nota = 'no se encontró la publicación en Facebook'; return m; }
    // Por separado: los comentarios piden pages_read_user_content; las reacciones, pages_read_engagement.
    try {
      const b = get_(id, { fields: 'reactions.summary(total_count).limit(0)' + (/_/.test(id) ? ',shares' : '') });
      m.me_gusta = b.reactions && b.reactions.summary ? b.reactions.summary.total_count : '';
      if (/_/.test(id)) m.compartidos = b.shares ? b.shares.count : 0;
    } catch (e) { nota('me gusta', e); }
    try {
      const b = get_(id, { fields: 'comments.summary(total_count).limit(0)' });
      m.comentarios = b.comments && b.comments.summary ? b.comments.summary.total_count : '';
    } catch (e) { nota('comentarios', e); }
    if (/_/.test(id)) {   // los ids de publicaciones llevan «página_post»; los videos no tienen estas métricas
      try {
        const d = get_(id + '/insights', { metric: 'post_total_media_view_unique,post_media_view' }).data;
        m.alcance = valorInsight_(d, 'post_total_media_view_unique');
        m.vistas = valorInsight_(d, 'post_media_view');
      } catch (e) { nota('alcance y vistas', e); }
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

// ---------------------------------------------------------------- TikTok (enviar a la bandeja)

const TIKTOK_API = 'https://open.tiktokapis.com/v2/';
// video.publish es para la publicación directa (necesita la auditoría de TikTok para cuentas públicas). Si la app
// todavía no lo tiene aprobado, pon la propiedad TIKTOK_ALCANCES = user.info.basic,video.upload
const TIKTOK_ALCANCES = 'user.info.basic,video.upload,video.publish';
const PRIVACIDADES = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];

/**
 * Ejecutar a mano (una vez, y otra vez si TikTok pide reconectar): muestra el enlace para autorizar a la app de
 * TikTok. Ábrelo con la sesión de TikTok de S3D y acepta; TikTok vuelve a URL_APP y doGet guarda el permiso.
 */
function conectarTikTok() {
  const props = PropertiesService.getScriptProperties();
  const [clave, url] = ['TIKTOK_CLIENT_KEY', 'URL_APP'].map(k => (props.getProperty(k) || '').trim());
  if (!clave || !url) throw new Error('faltan TIKTOK_CLIENT_KEY o URL_APP en las propiedades (guía de TikTok, paso 3)');
  const estado = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('tiktok-estado', estado, 900);
  const enlace = 'https://www.tiktok.com/v2/auth/authorize/?client_key=' + encodeURIComponent(clave) +
    '&response_type=code&scope=' + encodeURIComponent((props.getProperty('TIKTOK_ALCANCES') || TIKTOK_ALCANCES).trim()) + '&redirect_uri=' + encodeURIComponent(url) +
    '&state=' + estado;
  console.log('Abre este enlace (vale 15 minutos) con tu sesión de TikTok de S3D y acepta:\n' + enlace);
  return enlace;
}

function terminarConexionTikTok_(p) {
  if (p.error) return 'TikTok no autorizó la conexión: ' + p.error + ' ' + (p.error_description || '') + '. Vuelve a ejecutar conectarTikTok.';
  const cache = CacheService.getScriptCache();
  const esperado = cache.get('tiktok-estado');
  if (!esperado || !igualSeguro_(String(p.state || ''), esperado)) return 'El enlace venció o no es válido: vuelve a ejecutar conectarTikTok y abre el enlace nuevo.';
  cache.put('tiktok-estado', '', 1);
  const props = PropertiesService.getScriptProperties();
  try {
    guardarTokenTikTok_(tokenTikTok_({ grant_type: 'authorization_code', code: p.code, redirect_uri: (props.getProperty('URL_APP') || '').trim() }));
    return 'Listo: TikTok quedó conectado. Ya puedes cerrar esta pestaña y usar «Enviar a TikTok».';
  } catch (error) {
    return 'No se pudo conectar TikTok: ' + error.message;
  }
}

function tokenTikTok_(params) {
  const props = PropertiesService.getScriptProperties();
  const datos = Object.assign({
    client_key: (props.getProperty('TIKTOK_CLIENT_KEY') || '').trim(),
    client_secret: (props.getProperty('TIKTOK_CLIENT_SECRET') || '').trim()
  }, params);
  const r = UrlFetchApp.fetch(TIKTOK_API + 'oauth/token/', { method: 'post', payload: datos, muteHttpExceptions: true });
  let cuerpo;
  try { cuerpo = JSON.parse(r.getContentText()); } catch (e) { cuerpo = {}; }
  if (!cuerpo.access_token) throw new Error('TikTok no entregó el permiso (' + (cuerpo.error || r.getResponseCode()) + ': ' + (cuerpo.error_description || 'sin detalle') + ')');
  return cuerpo;
}

function guardarTokenTikTok_(t) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('TIKTOK_ACCESS', t.access_token);
  props.setProperty('TIKTOK_VENCE', String(Date.now() + (Number(t.expires_in) || 7200) * 1000));
  // El de renovación cambia cada vez: hay que guardar siempre el nuevo (con el viejo, TikTok pide reconectar).
  if (t.refresh_token) props.setProperty('TIKTOK_REFRESH', t.refresh_token);
}

/** Permiso vigente de TikTok (lo renueva si le quedan menos de 5 minutos). */
function accesoTikTok_() {
  const props = PropertiesService.getScriptProperties();
  const acceso = props.getProperty('TIKTOK_ACCESS');
  if (acceso && Number(props.getProperty('TIKTOK_VENCE') || 0) > Date.now() + 300000) return acceso;
  const renovar = props.getProperty('TIKTOK_REFRESH');
  if (!renovar) throw new Error('TikTok no está conectado: ejecuta conectarTikTok (guía de TikTok, paso 4)');
  try {
    guardarTokenTikTok_(tokenTikTok_({ grant_type: 'refresh_token', refresh_token: renovar }));
  } catch (error) {
    throw new Error('el permiso de TikTok venció: ejecuta conectarTikTok otra vez (' + error.message + ')');
  }
  return props.getProperty('TIKTOK_ACCESS');
}

/** Ejecutar a mano o desde el informe de los lunes: mantiene vivo el permiso de TikTok (vence a los 180 días sin uso). */
function renovarTikTok() {
  if (!PropertiesService.getScriptProperties().getProperty('TIKTOK_REFRESH')) return false;
  PropertiesService.getScriptProperties().setProperty('TIKTOK_VENCE', '0');
  accesoTikTok_();
  return true;
}

function tiktok_(ruta, cuerpo) {
  const r = UrlFetchApp.fetch(TIKTOK_API + ruta, {
    method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify(cuerpo),
    headers: { Authorization: 'Bearer ' + accesoTikTok_() }, muteHttpExceptions: true
  });
  let datos;
  try { datos = JSON.parse(r.getContentText()); } catch (e) { datos = {}; }
  const error = datos.error || {};
  if (r.getResponseCode() >= 400 || (error.code && error.code !== 'ok')) throw new Error(errorTikTok_(error, r.getResponseCode()));
  return datos.data || {};
}

/** Mensajes de TikTok en palabras simples (el código original va entre paréntesis). */
function errorTikTok_(error, http) {
  const original = ' (TikTok ' + (error.code || http) + ': ' + (error.message || 'sin detalle') + ')';
  const textos = {
    access_token_invalid: 'el permiso de TikTok no es válido: ejecuta conectarTikTok',
    scope_not_authorized: 'falta el permiso «video.upload» en la app de TikTok o al conectar (guía de TikTok)',
    url_ownership_unverified: 'TikTok aún no verificó que la web es tuya (guía de TikTok, paso 2)',
    spam_risk_too_many_pending_share: 'tienes 5 envíos esperando en tu bandeja de TikTok: publícalos o descártalos y vuelve a intentar',
    spam_risk_user_banned_from_posting: 'TikTok no permite publicar desde esta cuenta por ahora',
    rate_limit_exceeded: 'TikTok pide esperar un minuto: demasiados envíos seguidos',
    app_version_check_failed: 'actualiza la app de TikTok en tu celular (se necesita la versión 31.8 o superior)',
    unaudited_client_can_only_post_to_private_accounts: 'la publicación directa necesita la auditoría de TikTok (mientras tanto, solo funciona con la cuenta en privado)',
    privacy_level_option_mismatch: 'esa privacidad no está disponible para tu cuenta: elige otra',
    reached_active_user_cap: 'TikTok alcanzó el límite diario de publicaciones de la app: intenta mañana'
  };
  return (textos[error.code] || 'TikTok rechazó el envío') + original;
}

/** Espera a que TikTok termine de procesar el envío y lo deje en la bandeja (o lo publique). */
function esperarTikTok_(publicacion) {
  for (let i = 0; i < 20; i++) {
    const d = tiktok_('post/publish/status/fetch/', { publish_id: publicacion });
    if (d.status === 'SEND_TO_USER_INBOX' || d.status === 'PUBLISH_COMPLETE') return d.status;
    if (d.status === 'FAILED') throw new Error('TikTok no pudo procesar el envío (' + (d.fail_reason || 'sin detalle') + ')');
    Utilities.sleep(i < 5 ? 3000 : 10000);
  }
  return 'PROCESSING';   // sigue procesando: se anota «procesando» y se revisa después («Revisar estado» o revisarTikTok)
}

/** Estado final según TikTok: bandeja → «enviado», publicado → «publicado», aún procesando → «procesando». */
function estadoFinal_(fase, directo) {
  if (fase === 'PROCESSING') return 'procesando';
  return directo ? 'publicado' : 'enviado';
}

/** Vuelve a preguntar a TikTok por un envío que quedó «procesando» y anota el resultado. */
function revisarEnvioTikTok_(id, tipo, nombre, r) {
  const directo = r.detalle === 'directo' || r.detalle === 'TikTok aún lo procesa';   // la 2.ª es de la versión anterior
  const d = tiktok_('post/publish/status/fetch/', { publish_id: r.id });
  if (d.status === 'FAILED') {
    anotar_(id, nombre, tipo, 'tiktok', 'error', '', 'TikTok no pudo procesarlo (' + (d.fail_reason || 'sin detalle') + ')', r.id);
  } else if (d.status === 'SEND_TO_USER_INBOX' || d.status === 'PUBLISH_COMPLETE') {
    anotar_(id, nombre, tipo, 'tiktok', estadoFinal_(d.status, d.status === 'PUBLISH_COMPLETE' || directo), r.enlace || 'https://www.tiktok.com/', '', r.id);
  }
  return d;
}

/** Desde la página («Revisar estado»): revisa el envío a TikTok de un producto que quedó procesando. */
function revisarTikTokProducto_(id, tipo) {
  const e = estado_()[id + ':' + tipo] || {};
  if (!e.tiktok || e.tiktok.estado !== 'procesando' || !e.tiktok.id) return { tiktok: e.tiktok || null };
  const d = revisarEnvioTikTok_(id, tipo, e.nombre || '', e.tiktok);
  return { tiktok: { estado: d.status, detalle: d.fail_reason || '' } };
}

/**
 * Ejecutar a mano: muestra en el registro el estado real en TikTok de los envíos de los últimos 7 días (y el motivo
 * si TikTok los rechazó), y corrige la hoja de los que quedaron «procesando».
 */
function revisarTikTok() {
  const filas = hoja_().getDataRange().getValues().slice(1);
  const desde = Date.now() - 7 * 86400000;
  const vistos = {};
  filas.forEach(f => {
    const fecha = f[0] instanceof Date ? f[0] : new Date(f[0]);
    if (f[4] !== 'tiktok' || !f[8] || fecha.getTime() < desde || vistos[f[8]]) return;
    vistos[f[8]] = true;
    const d = tiktok_('post/publish/status/fetch/', { publish_id: String(f[8]) });
    console.log('Producto ' + f[1] + ' (' + f[3] + '), anotado «' + f[5] + '» el ' + fecha.toISOString() + ': TikTok dice ' +
      d.status + (d.fail_reason ? ' — motivo: ' + d.fail_reason : '') +
      (d.publicaly_available_post_id && d.publicaly_available_post_id.length ? ' — publicación ' + d.publicaly_available_post_id.join(', ') : ''));
  });
  const estado = estado_();
  Object.keys(estado).forEach(clave => {
    const r = estado[clave].tiktok;
    // También las que la versión anterior anotó «publicado» sin que TikTok hubiera terminado.
    const pendiente = r && r.id && (r.estado === 'procesando' || r.detalle === 'TikTok aún lo procesa');
    if (pendiente) revisarEnvioTikTok_(Number(clave.split(':')[0]), clave.split(':')[1], estado[clave].nombre, r);
  });
  if (!Object.keys(vistos).length) console.log('No hay envíos a TikTok de los últimos 7 días.');
}

function tiktokFotos_(p) {
  const d = tiktok_('post/publish/content/init/', {
    post_info: { title: p.tiktokTitulo, description: p.tiktok },
    source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: p.fotos.slice(0, 35) },
    post_mode: 'MEDIA_UPLOAD',
    media_type: 'PHOTO'
  });
  return { id: d.publish_id, fase: esperarTikTok_(d.publish_id) };
}

function tiktokVideo_(p) {
  // El video se sube desde aquí (FILE_UPLOAD, en un solo trozo: pesan menos de 64 MB) y no necesita la verificación.
  const bytes = UrlFetchApp.fetch(p.video).getBlob().getBytes();
  const n = bytes.length;
  const d = tiktok_('post/publish/inbox/video/init/', { source_info: { source: 'FILE_UPLOAD', video_size: n, chunk_size: n, total_chunk_count: 1 } });
  const r = UrlFetchApp.fetch(d.upload_url, {
    method: 'put', contentType: 'video/mp4', payload: bytes, muteHttpExceptions: true,
    headers: { 'Content-Range': 'bytes 0-' + (n - 1) + '/' + n }
  });
  if (r.getResponseCode() >= 300) throw new Error('TikTok no recibió el video (' + r.getResponseCode() + ')');
  return { id: d.publish_id, fase: esperarTikTok_(d.publish_id) };
}

function enviarTikTok_(id, tipo) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('hay otro envío en curso; espera un momento y vuelve a intentar');
  try {
    const p = contenido_(id, tipo);
    const actual = (estado_()[id + ':' + tipo] || {}).tiktok;
    if (actual && ['enviado', 'publicado', 'procesando'].indexOf(actual.estado) > -1) return { tiktok: actual };
    try {
      const envio = tipo === 'reel' ? tiktokVideo_(p) : tiktokFotos_(p);
      const final = estadoFinal_(envio.fase, false);
      anotar_(id, p.nombre, tipo, 'tiktok', final, 'https://www.tiktok.com/', final === 'procesando' ? 'bandeja' : '', envio.id);
      return { tiktok: { estado: final } };
    } catch (error) {
      anotar_(id, p.nombre, tipo, 'tiktok', 'error', '', error.message, '');
      return { tiktok: { estado: 'error', detalle: error.message } };
    }
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- TikTok: publicación directa (tras la auditoría)
// Normas de TikTok (Content Sharing Guidelines): la página muestra la cuenta, el dueño elige la privacidad (sin valor
// por defecto), las interacciones (desmarcadas) y el contenido comercial, puede editar el texto y acepta la
// Confirmación de uso de música antes de publicar. Aquí se vuelve a consultar la cuenta y se valida todo.

/** Datos de la cuenta de TikTok que la página debe mostrar antes de publicar (se consultan siempre al momento). */
function creadorTikTok_() {
  const d = tiktok_('post/publish/creator_info/query/', {});
  return {
    nombre: d.creator_nickname || d.creator_username || '',
    usuario: d.creator_username || '',
    privacidades: (d.privacy_level_options || []).filter(p => PRIVACIDADES.indexOf(p) > -1),
    sinComentarios: !!d.comment_disabled,
    sinDuo: !!d.duet_disabled,
    sinStitch: !!d.stitch_disabled,
    maxSegundos: Number(d.max_video_post_duration_sec) || 0
  };
}

function publicarTikTok_(id, tipo, o) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('hay otra publicación en curso; espera un momento y vuelve a intentar');
  try {
    const p = contenido_(id, tipo);
    const actual = (estado_()[id + ':' + tipo] || {}).tiktok;
    if (actual && ['enviado', 'publicado', 'procesando'].indexOf(actual.estado) > -1) return { tiktok: actual };
    const creador = creadorTikTok_();
    // Validaciones de las normas de TikTok (la página ya las aplica; aquí se repiten por seguridad).
    if (o.acepta !== true) throw new Error('falta aceptar la Confirmación de uso de música de TikTok');
    if (creador.privacidades.indexOf(o.privacidad) === -1) throw new Error('elige quién puede ver la publicación');
    if (o.contenidoMarca && o.privacidad === 'SELF_ONLY') throw new Error('el contenido de marca no puede ser privado («Solo yo»)');
    if (o.comercial && !o.tuMarca && !o.contenidoMarca) throw new Error('indica si el contenido promociona tu marca, la de un tercero o ambas');
    if (tipo === 'reel' && creador.maxSegundos && p.videoSegundos > creador.maxSegundos) {
      throw new Error('el video dura ' + Math.round(p.videoSegundos) + ' s y tu cuenta permite hasta ' + creador.maxSegundos + ' s');
    }
    const titulo = String(o.titulo || p.tiktokTitulo).slice(0, 90);
    const texto = String(o.texto || p.tiktok).slice(0, tipo === 'reel' ? 2200 : 4000);
    const comunes = {
      privacy_level: o.privacidad,
      disable_comment: creador.sinComentarios || !o.comentarios,
      brand_content_toggle: !!(o.comercial && o.contenidoMarca),
      brand_organic_toggle: !!(o.comercial && o.tuMarca)
    };
    try {
      let publicacion;
      if (tipo === 'reel') {
        const bytes = UrlFetchApp.fetch(p.video).getBlob().getBytes();
        const n = bytes.length;
        const d = tiktok_('post/publish/video/init/', {
          post_info: Object.assign({ title: texto, disable_duet: creador.sinDuo || !o.duo, disable_stitch: creador.sinStitch || !o.stitch,
            video_cover_timestamp_ms: 1000 }, comunes),
          source_info: { source: 'FILE_UPLOAD', video_size: n, chunk_size: n, total_chunk_count: 1 }
        });
        const r = UrlFetchApp.fetch(d.upload_url, { method: 'put', contentType: 'video/mp4', payload: bytes, muteHttpExceptions: true,
          headers: { 'Content-Range': 'bytes 0-' + (n - 1) + '/' + n } });
        if (r.getResponseCode() >= 300) throw new Error('TikTok no recibió el video (' + r.getResponseCode() + ')');
        publicacion = d.publish_id;
      } else {
        publicacion = tiktok_('post/publish/content/init/', {
          post_info: Object.assign({ title: titulo, description: texto, auto_add_music: true }, comunes),
          source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: p.fotos.slice(0, 35) },
          post_mode: 'DIRECT_POST',
          media_type: 'PHOTO'
        }).publish_id;
      }
      const final = estadoFinal_(esperarTikTok_(publicacion), true);
      anotar_(id, p.nombre, tipo, 'tiktok', final, 'https://www.tiktok.com/@' + creador.usuario, final === 'procesando' ? 'directo' : '', publicacion);
      return { tiktok: { estado: final, procesando: final === 'procesando' } };
    } catch (error) {
      anotar_(id, p.nombre, tipo, 'tiktok', 'error', '', error.message, '');
      return { tiktok: { estado: 'error', detalle: error.message } };
    }
  } finally {
    lock.releaseLock();
  }
}
