'use strict';
// GYM LAB: pantallas y flujo de la sesión.

const BANDAS = ['larga', 'media', 'corta', 'doble'];
const COLOR_BANDA = { larga: '#7fb3ff', media: '#ffd166', corta: '#ff8c42', doble: '#ff4d6d' };
const ORDEN_FASES = ['base', 'desarrollo', 'choque'];
const LADOS = {
  PP: ['Primera pierna', 'Segunda pierna'],
  PB: ['Primer brazo', 'Segundo brazo'],
  PL: ['Primer lado', 'Segundo lado']
};
const SVG = d => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICO = {
  menos: SVG('<path d="M5 12h14"/>'),
  mas: SVG('<path d="M5 12h14M12 5v14"/>'),
  volver: SVG('<path d="M15 5l-7 7 7 7"/>'),
  listo: SVG('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  estrella: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
  repetir: SVG('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>')
};
const PASO_TEXTO = { bajar: 'Bajá', subir: 'Subí', pausa: 'Pausa' };
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const $app = document.getElementById('app');
let R = null;            // rutina
let timer = null;        // cuenta activa
let ritmo = null;        // marcador de ritmo activo
let wakeLock = null;
let ex = null;           // estado de la serie en pantalla
let form = null;         // formulario en pantalla
let ui = { tab: 'sesiones', progresoId: null, mes: null };
let alCambio = null;     // qué hacer al terminar el cambio de lado

const D = () => Registro.datos();
const guardar = () => Registro.guardar();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);
const poner = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };

function fmtSeg(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return String(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtFecha(iso, conDia = true) {
  const f = new Date(iso + 'T12:00:00');
  const t = `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}`;
  return conDia ? `${DIAS[f.getDay()]} ${t}` : t;
}

function limpiar() {
  if (timer) timer.detener();
  timer = null;
  if (ritmo) ritmo.detener();
  ritmo = null;
}

function mostrar(html) {
  limpiar();
  $app.innerHTML = html;
  window.scrollTo(0, 0);
}

function barra(titulo, volver = 'inicio') {
  return `<header class="barra">
    <button class="btn-icono" data-accion="${volver}" aria-label="Volver">${ICO.volver}</button>
    <div class="barra-titulo">${titulo}</div>
  </header>`;
}

function chips(grupo, valores, elegido, etiquetas = null) {
  return `<div class="chips" data-grupo="${grupo}">${valores.map((v, i) =>
    `<button class="chip${String(v) === String(elegido) ? ' activo' : ''}" data-accion="elegir" data-grupo="${grupo}" data-valor="${v}">${etiquetas ? etiquetas[i] : v}</button>`
  ).join('')}</div>`;
}

function stepper(campo, valor, etiqueta, paso = 1) {
  return `<div class="stepper">
    <div class="stepper-etiqueta">${etiqueta}</div>
    <div class="stepper-fila">
      <button class="btn-redondo" data-accion="ajustar" data-campo="${campo}" data-delta="${-paso}" aria-label="Menos">${ICO.menos}</button>
      <div class="stepper-valor" id="f-${campo}">${valor}</div>
      <button class="btn-redondo" data-accion="ajustar" data-campo="${campo}" data-delta="${paso}" aria-label="Más">${ICO.mas}</button>
    </div>
  </div>`;
}

function videosHtml(videos, titulo = 'Videos de referencia') {
  if (!videos || !videos.length) return '';
  return `<div class="videos"><div class="videos-titulo">${titulo}</div>${videos.map(v =>
    `<a class="video" href="${esc(v.url)}" target="_blank" rel="noopener">▶ ${esc(v.titulo)}</a>`
  ).join('')}</div>`;
}

function preguntar(texto, siTexto, alSi, noTexto = 'Cancelar') {
  const capa = document.createElement('div');
  capa.className = 'modal';
  capa.innerHTML = `<div class="modal-caja"><p>${texto}</p>
    <button class="btn-principal" data-si>${siTexto}</button>
    <button class="btn-sec" data-no>${noTexto}</button></div>`;
  document.body.appendChild(capa);
  capa.querySelector('[data-si]').onclick = () => { capa.remove(); alSi(); };
  capa.querySelector('[data-no]').onclick = () => capa.remove();
}

function aviso(texto) {
  const el = document.getElementById('aviso-flotante');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => { el.hidden = true; }, 2600);
}

async function mantenerPantalla(encendida) {
  try {
    if (encendida && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
    if (!encendida && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* el navegador no lo permite */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && D() && D().enCurso) mantenerPantalla(true);
});

// ---------- Rutina armada para una semana ----------

function armarEjercicio(ej, fid, fase) {
  const obj = ej.fases[fid];
  const lado = obj.lado || ej.lado || null;
  return {
    ...ej,
    obj,
    fid,
    lado,
    porLado: !!lado && !ej.alterna,
    series: fase.series,
    descanso: fase.descanso,
    reserva: fase.reserva,
    unidad: ej.pasos ? 'pasos' : 'repeticiones',
    usaBanda: !!obj.banda
  };
}

function plan(tipo, semana) {
  const fase = Registro.fase(semana);
  const ses = R.sesiones[tipo];
  const fid = fase.usaEjerciciosDe || fase.id;
  return { tipo, nombre: ses.nombre, subtitulo: ses.subtitulo, fase, ejercicios: ses.ejercicios.map(ej => armarEjercicio(ej, fid, fase)) };
}

function planActual() {
  const s = D().enCurso;
  return plan(s.tipo, s.semana);
}

function metaTexto(ej) {
  const o = ej.obj;
  if (o.tipo === 'tiempo') return `${o.segundos}"`;
  if (o.tipo === 'mixta') return `${o.total} en total`;
  return o.min === o.max ? `${o.max}` : `${o.min} a ${o.max}`;
}

function estimarMinutos(p) {
  let s = R.calentamiento.ejercicios.reduce((a, e) => a + e.segundos, 0) + 15;
  s += R.estiramientos.ejercicios.reduce((a, e) => a + e.segundos * (e.porLado ? 2 : 1) + (e.porLado ? 5 : 0), 0);
  p.ejercicios.forEach((ej, i) => {
    const o = ej.obj;
    const lados = ej.porLado ? 2 : 1;
    const rep = o.ritmo ? o.ritmo.reduce((a, r) => a + r.s, 0) : 3;
    const trabajo = o.tipo === 'tiempo' ? o.segundos + 3 : (o.tipo === 'mixta' ? o.total : o.max) * rep;
    const porSerie = trabajo * lados + (lados > 1 ? 5 : 0) + 20;
    const descansos = ej.series - 1 + (i < p.ejercicios.length - 1 ? 1 : 0);
    s += ej.series * porSerie + descansos * ej.descanso + 30;
  });
  return Math.round(s / 60);
}

function siguienteVariante(ej) {
  const i = ORDEN_FASES.indexOf(ej.fid);
  const sig = ORDEN_FASES[i + 1];
  return sig && ej.fases[sig] ? ej.fases[sig].texto : null;
}

// ---------- Inicio ----------

function irInicio() {
  const d = D();
  if (d.chequeoPendiente && d.chequeoPendiente.fecha !== Registro.hoy()) return renderChequeo();
  renderInicio();
}

function renderInicio() {
  const d = D();
  const fase = Registro.fase(d.semana);
  document.documentElement.style.setProperty('--fase', fase.color);
  let tarjeta = '';
  let botones = '';

  if (d.completado) {
    tarjeta = `<div class="tarjeta destacada"><div class="etiqueta">Programa</div>
      <h2>${esc(R.desafio.completado)}</h2>
      <p class="tenue">Podés seguir mirando tu historial o empezar el programa de nuevo desde Ajustes.</p></div>`;
  } else if (d.semana >= 11) {
    tarjeta = `<div class="tarjeta destacada"><div class="etiqueta">Semana 11 · ${esc(fase.nombre)}</div>
      <h2>${esc(R.desafio.titulo)}</h2>
      <ul class="lista-simple">${R.desafio.pruebas.map(p => `<li>${esc(p.nombre)}: <b>${esc(p.meta)}</b></li>`).join('')}</ul></div>`;
    botones = `<button class="btn-principal enorme" data-accion="irDesafio">Ir al desafío</button>`;
  } else {
    const tipo = R.ordenSemanal[d.indice];
    const p = plan(tipo, d.semana);
    const enCurso = d.enCurso && d.enCurso.tipo !== 'desafio' ? d.enCurso : null;
    const propuestas = p.ejercicios.filter(e => d.proponer[e.id]);
    tarjeta = `<div class="tarjeta destacada">
      <div class="etiqueta">Semana ${d.semana} de 11 · Fase ${esc(fase.nombre)}</div>
      <h2>Hoy toca: ${esc(p.nombre)}</h2>
      <p class="sub">${esc(p.subtitulo)}</p>
      <div class="datos-fila">
        <span><b>${d.indice + 1}</b> de 4 en la semana</span>
        <span><b>≈ ${estimarMinutos(p)}</b> min</span>
        <span><b>${fase.series}</b> series · descanso <b>${fase.descanso}"</b></span>
      </div>
      <details class="detalle"><summary>Ver ejercicios</summary>
        <ol class="lista-ejercicios">${p.ejercicios.map(e => `<li><span>${esc(e.nombre)}</span><b>${esc(e.obj.texto)}</b></li>`).join('')}</ol>
      </details>
      ${propuestas.length ? `<p class="alerta">Hay ${propuestas.length === 1 ? 'un ejercicio' : propuestas.length + ' ejercicios'} con alternativa propuesta por molestias: ${propuestas.map(e => esc(e.nombre)).join(', ')}.</p>` : ''}
    </div>`;
    const ultima = d.sesiones[d.sesiones.length - 1];
    if (!enCurso && ultima && Registro.diasEntre(ultima.fecha, Registro.hoy()) === 1 && R.descansoDespuesDe.includes(ultima.tipo)) {
      tarjeta += `<p class="nota-info">Ayer hiciste ${esc(R.sesiones[ultima.tipo].nombre)}: hoy toca descanso.</p>`;
    }
    if (enCurso) {
      const pe = plan(enCurso.tipo, enCurso.semana);
      const donde = enCurso.etapa === 'previa' || enCurso.etapa === 'calentamiento' ? 'en el calentamiento'
        : enCurso.etapa === 'estiramiento' ? 'en el estiramiento final'
        : `en el ejercicio ${enCurso.ej + 1} de ${pe.ejercicios.length}`;
      botones = `<button class="btn-principal enorme" data-accion="seguirSesion">Seguir sesión</button>
        <p class="tenue centro-texto">Quedaste ${donde}.</p>
        <button class="btn-texto" data-accion="descartarSesion">Empezar de cero</button>`;
    } else {
      botones = `<button class="btn-principal enorme" data-accion="empezar">Empezar</button>`;
    }
  }

  const faltaMedida = (d.semana === 1 || d.semana === 10) && !d.medidas.some(m => m.semana === d.semana);
  const medida = faltaMedida ? `<button class="tarjeta boton-tarjeta" data-accion="irMedidas" data-semana="${d.semana}">
      <b>Medidas de la semana ${d.semana}</b><span>Brazo, pecho y peso. Tocá para cargarlas.</span></button>` : '';

  mostrar(`<section class="pantalla inicio">
    <header class="marca"><div class="logo">GYM <span>LAB</span></div></header>
    ${tarjeta}
    ${botones}
    ${medida}
    ${tarjetaCalendario()}
    <nav class="menu">
      <button class="btn-sec" data-accion="irHistorial">Historial</button>
      <button class="btn-sec" data-accion="irAjustes">Ajustes</button>
    </nav>
  </section>`);
}

// ---------- Calendario y cuenta regresiva ----------

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function tarjetaCalendario() {
  const d = D();
  const total = R.ordenSemanal.length * 10;
  const hechas = d.completado || d.semana >= 11 ? total : (d.semana - 1) * R.ordenSemanal.length + d.indice;
  const faltan = total - hechas;
  const hoyTxt = Registro.hoy();
  if (!ui.mes) ui.mes = hoyTxt.slice(0, 7);
  const [anio, mes] = ui.mes.split('-').map(Number);
  const primero = new Date(anio, mes - 1, 1);
  const dias = new Date(anio, mes, 0).getDate();
  const corrimiento = (primero.getDay() + 6) % 7; // lunes primero
  const porFecha = {};
  for (const ses of d.sesiones) {
    const f = R.fases.find(x => x.id === ses.fase) || Registro.fase(ses.semana);
    porFecha[ses.fecha] = f.color;
  }
  let celdas = '<span class="cal-vacio"></span>'.repeat(corrimiento);
  for (let n = 1; n <= dias; n++) {
    const f = `${ui.mes}-${String(n).padStart(2, '0')}`;
    const color = porFecha[f];
    celdas += `<span class="cal-dia${color ? ' hecho' : ''}${f === hoyTxt ? ' hoy' : ''}"${color ? ` style="--c:${color}"` : ''}><span class="cifra">${n}</span></span>`;
  }
  const enMes = d.sesiones.filter(x => x.fecha.startsWith(ui.mes)).length;
  const texto = d.completado ? 'Programa completo'
    : faltan > 0 ? `Faltan <b>${faltan}</b> ${faltan === 1 ? 'sesión' : 'sesiones'} para el desafío`
    : '¡Llegó la semana del desafío!';
  return `<div class="tarjeta calendario">
    <div class="cuenta">
      <div class="cuenta-txt"><span>Sesión <b>${Math.min(hechas + 1, total)}</b> de ${total}</span><span>${texto}</span></div>
      <div class="barra-progreso"><i style="width:${(hechas / total * 100).toFixed(1)}%"></i></div>
      <div class="datos-fila"><span><b>${Registro.racha()}</b> días de racha</span><span><b>${d.sesiones.length}</b> entrenamientos</span></div>
    </div>
    <div class="cal-cabeza">
      <button class="btn-icono" data-accion="mes" data-delta="-1" aria-label="Mes anterior">${ICO.volver}</button>
      <b>${MESES[mes - 1]} ${anio}</b>
      <button class="btn-icono gira" data-accion="mes" data-delta="1" aria-label="Mes siguiente">${ICO.volver}</button>
    </div>
    <div class="cal-grilla">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="cal-sem">${x}</span>`).join('')}${celdas}</div>
    <p class="tenue chico-texto centro-texto">${enMes ? `Este mes: ${enMes} ${enMes === 1 ? 'entrenamiento' : 'entrenamientos'}` : 'Este mes todavía no entrenaste'}</p>
  </div>`;
}

// ---------- Chequeo del día siguiente ----------

function renderChequeo(resultado = null) {
  if (resultado) {
    const texto = resultado.length
      ? resultado.map(r => `<div class="tarjeta alerta-tarjeta"><b>Subió la molestia ${r.zona === 'codo' ? 'del codo' : 'de las rodillas'} (${r.valor} de 10).</b>
          ${r.ejercicios.length ? `<p>En la próxima sesión te propongo la alternativa de: ${r.ejercicios.map(esc).join(', ')}.</p>` : ''}</div>`).join('')
      : '<div class="tarjeta"><b>Todo en orden.</b><p class="tenue">Seguimos con el programa.</p></div>';
    mostrar(`<section class="pantalla">${barra('Chequeo')}${texto}
      <button class="btn-principal" data-accion="inicio">Seguir</button></section>`);
    return;
  }
  form = { codo: null, rodillas: null, _req: ['codo', 'rodillas'] };
  const nums = [...Array(11).keys()];
  mostrar(`<section class="pantalla">${barra('Chequeo')}
    <h1 class="titulo">¿Cómo amanecieron?</h1>
    <p class="tenue">Después de la última sesión. 0 es nada y 10 es mucho dolor.</p>
    <div class="campo"><div class="campo-etiqueta">Codo</div>${chips('codo', nums, null)}</div>
    <div class="campo"><div class="campo-etiqueta">Rodillas</div>${chips('rodillas', nums, null)}</div>
    <button class="btn-principal" id="guardar" data-accion="guardarChequeo" disabled>Guardar</button>
    <button class="btn-texto" data-accion="saltarChequeo">Ahora no</button>
  </section>`);
}

// ---------- Medidas ----------

function renderMedidas(semana) {
  const prev = D().medidas.find(m => m.semana === semana) || {};
  mostrar(`<section class="pantalla">${barra('Medidas', 'irHistorialMedidas')}
    <h1 class="titulo">Semana ${semana}</h1>
    <div class="chips" data-grupo="semanaMedida">
      <button class="chip${semana === 1 ? ' activo' : ''}" data-accion="irMedidas" data-semana="1">Semana 1</button>
      <button class="chip${semana === 10 ? ' activo' : ''}" data-accion="irMedidas" data-semana="10">Semana 10</button>
    </div>
    <label class="campo"><span class="campo-etiqueta">Brazo (cm)</span><input id="m-brazo" type="number" inputmode="decimal" step="0.1" value="${prev.brazo ?? ''}"></label>
    <label class="campo"><span class="campo-etiqueta">Pecho (cm)</span><input id="m-pecho" type="number" inputmode="decimal" step="0.1" value="${prev.pecho ?? ''}"></label>
    <label class="campo"><span class="campo-etiqueta">Peso (kg)</span><input id="m-peso" type="number" inputmode="decimal" step="0.1" value="${prev.peso ?? ''}"></label>
    <button class="btn-principal" data-accion="guardarMedidas" data-semana="${semana}">Guardar medidas</button>
  </section>`);
}

// ---------- Antes de empezar ----------

function renderPrevia() {
  const p = planActual();
  const tieneBanda = p.ejercicios.some(e => e.usaBanda);
  const tieneBrazo = p.ejercicios.some(e => e.zona === 'brazo');
  const tienePierna = p.ejercicios.some(e => e.zona === 'pierna');
  const tarjetas = [];
  if (tieneBanda) tarjetas.push(['Banda', R.avisos.banda]);
  if (tieneBrazo) tarjetas.push(['Codo', R.avisos.codo]);
  if (tienePierna) tarjetas.push(['Rodillas', R.avisos.rodillas]);
  mostrar(`<section class="pantalla">${barra('Antes de empezar', 'salirSesion')}
    <h1 class="titulo">${esc(p.nombre)}</h1>
    <p class="sub">${esc(p.subtitulo)} · Fase ${esc(p.fase.nombre)}</p>
    ${tarjetas.map(([t, txt]) => `<div class="tarjeta aviso-tarjeta"><b>${t}</b><p>${esc(txt)}</p></div>`).join('')}
    <button class="btn-principal enorme" data-accion="empezarCalentamiento">Empezar calentamiento</button>
    <button class="btn-texto" data-accion="saltarCalentamiento">Saltar el calentamiento</button>
  </section>`);
}

// ---------- Calentamiento y estiramiento guiados ----------

function guiadoDe(cual) { return cual === 'calentamiento' ? R.calentamiento : R.estiramientos; }

function renderGuiado(cual, { sinPreparar = false } = {}) {
  const g = guiadoDe(cual);
  const s = D().enCurso;
  const it = g.ejercicios[s.gi];
  const lado = it.porLado ? `<div class="lado">${s.gl === 0 ? 'Primer lado' : 'Segundo lado'}</div>` : '';
  const siguiente = g.ejercicios[s.gi + 1];
  mostrar(`<section class="pantalla">${barra(g.titulo, 'salirSesion')}
    <div class="progreso-texto">${s.gi + 1} de ${g.ejercicios.length}</div>
    <h1 class="nombre">${esc(it.nombre)}</h1>
    ${lado}
    <div class="reloj"><div class="tiempo-grande" id="t">${it.segundos}</div><div class="etiqueta" id="et">${sinPreparar ? 'Ahora' : 'Preparate'}</div></div>
    <p class="como-corto">${esc(it.como)}</p>
    <div class="fila">
      <button class="btn-sec" data-accion="anteriorGuiado" data-cual="${cual}">Anterior</button>
      <button class="btn-sec" data-accion="pausar" id="b-pausa">Pausar</button>
      <button class="btn-sec" data-accion="saltarGuiado" data-cual="${cual}">Siguiente</button>
    </div>
    ${siguiente ? `<p class="tenue centro-texto">Después: ${esc(siguiente.nombre)}</p>` : ''}
    <button class="btn-texto" data-accion="saltarTodoGuiado" data-cual="${cual}">Saltar ${cual === 'calentamiento' ? 'el calentamiento' : 'el estiramiento'}</button>
    ${videosHtml(g.videos)}
  </section>`);
  const arrancar = () => {
    poner('#et', 'Ahora');
    poner('#t', it.segundos);
    timer = new Cuenta({
      segundos: it.segundos,
      alTic: r => poner('#t', fmtSeg(r)),
      alAviso: () => Sonido.aviso(),
      alFin: () => { Sonido.fin(); siguienteGuiado(cual); }
    });
    timer.iniciar();
  };
  if (sinPreparar) arrancar();
  else preparar(3, arrancar);
}

function preparar(seg, despues) {
  timer = new Cuenta({
    segundos: seg,
    avisoEn: seg,
    alTic: r => poner('#t', r),
    alAviso: () => Sonido.tic(),
    alFin: despues
  });
  timer.iniciar();
}

function siguienteGuiado(cual) {
  const g = guiadoDe(cual);
  const s = D().enCurso;
  const it = g.ejercicios[s.gi];
  if (it.porLado && s.gl === 0) {
    s.gl = 1;
    guardar();
    cambioDeLado(() => renderGuiado(cual, { sinPreparar: true }), `${it.nombre}: segundo lado`);
    return;
  }
  s.gl = 0;
  s.gi++;
  if (s.gi >= g.ejercicios.length) return terminarGuiado(cual);
  guardar();
  renderGuiado(cual);
}

function terminarGuiado(cual) {
  const s = D().enCurso;
  if (cual === 'calentamiento') {
    if (s.tipo === 'desafio') {
      D().enCurso = null;
      guardar();
      mantenerPantalla(false);
      return renderDesafio();
    }
    s.etapa = 'ejercicio';
    s.ej = 0;
    s.serie = 1;
    guardar();
    renderEjercicio();
  } else {
    finalizarSesion();
  }
}

// Vuelve un paso atrás en el calentamiento o el estiramiento.
function anteriorGuiado(cual) {
  const g = guiadoDe(cual);
  const s = D().enCurso;
  if (s.gl === 1) {
    s.gl = 0;
  } else if (s.gi > 0) {
    s.gi--;
    s.gl = 0;
  } else if (cual === 'calentamiento') {
    if (s.tipo === 'desafio') { D().enCurso = null; guardar(); mantenerPantalla(false); return renderDesafio(); }
    s.etapa = 'previa';
    guardar();
    return renderPrevia();
  } else {
    // Del primer estiramiento se vuelve al cierre del último ejercicio.
    s.etapa = 'cierre';
    s.ej = planActual().ejercicios.length - 1;
    s.serie = planActual().ejercicios[s.ej].series;
    ex = null;
    guardar();
    return renderCierre();
  }
  guardar();
  renderGuiado(cual);
}

// Texto del botón «Anterior» en la pantalla del ejercicio.
function textoAnterior() {
  const s = D().enCurso;
  const p = planActual();
  const ej = p.ejercicios[s.ej];
  if (ej.porLado && ex && ex.lado === 1) return 'Volver al primer lado';
  if (s.serie > 1) return `Corregir la serie ${s.serie - 1}`;
  if (s.ej > 0) return 'Volver al ejercicio anterior';
  return 'Volver al calentamiento';
}

function anteriorEjercicio() {
  const s = D().enCurso;
  const p = planActual();
  const ej = p.ejercicios[s.ej];
  limpiar();
  if (ej.porLado && ex && ex.lado === 1) {
    ex.lado = 0;
    return renderEjercicio({ mantener: true });
  }
  if (s.serie > 1) return corregirSerie();
  if (s.ej > 0) {
    s.ej--;
    s.serie = p.ejercicios[s.ej].series;
    s.etapa = 'cierre';
    ex = null;
    guardar();
    return renderCierre();
  }
  s.etapa = 'calentamiento';
  s.gi = R.calentamiento.ejercicios.length - 1;
  s.gl = 0;
  ex = null;
  guardar();
  renderGuiado('calentamiento');
}

// Vuelve a la serie anotada antes de la actual, con sus números cargados para corregirla.
function corregirSerie() {
  const s = D().enCurso;
  limpiar();
  if (s.etapa === 'cierre') {
    s.etapa = 'ejercicio';
  } else {
    s.serie = Math.max(1, s.serie - 1);
  }
  guardar();
  const reg = registroEj(ejActual());
  renderRegistroSerie(reg.series[s.serie - 1] || null);
}

function cambioDeLado(despues, texto = '') {
  mostrar(`<section class="pantalla centro cambio">
    <div class="etiqueta grande">Cambio de lado</div>
    <div class="tiempo-grande" id="t">5</div>
    ${texto ? `<p class="sub">${esc(texto)}</p>` : ''}
    <button class="btn-sec" data-accion="saltarCambio">Ya estoy</button>
  </section>`);
  Sonido.cambio();
  alCambio = despues;
  timer = new Cuenta({
    segundos: 5,
    alTic: r => poner('#t', r),
    alAviso: () => Sonido.tic(),
    alFin: () => { const f = alCambio; alCambio = null; if (f) f(); }
  });
  timer.iniciar();
}

// ---------- Ejercicio ----------

function registroEj(ej) {
  const s = D().enCurso;
  let reg = s.registros.find(r => r.id === ej.id);
  if (!reg) {
    reg = { id: ej.id, nombre: ej.nombre, zona: ej.zona, fase: ej.fid, variante: D().variantes[ej.id] || null, series: [], molestia: null, nota: '' };
    s.registros.push(reg);
  }
  return reg;
}

function renderEjercicio({ mantener = false } = {}) {
  const s = D().enCurso;
  const p = planActual();
  const ej = p.ejercicios[s.ej];
  const reg = registroEj(ej);
  if (!mantener || !ex) ex = { lado: 0, conteo: [0, 0], completas: 0, rodillas: 0, segundos: [null, null], panel: null };
  const o = ej.obj;
  const alt = (ej.alternativas || []).find(a => a.id === reg.variante);
  const primera = s.serie === 1 && ex.lado === 0 && reg.series.length === 0;
  const propuesta = primera && D().proponer[ej.id] && ej.alternativas && ej.alternativas.length && !reg.variante;

  let avisoZona = '';
  if (primera && ej.zona) {
    const [t, txt] = ej.zona === 'brazo' ? ['Codo', R.avisos.codo] : ['Rodillas', R.avisos.rodillas];
    avisoZona = `<div class="tarjeta aviso-tarjeta chica"><b>${t}</b><p>${esc(txt)}</p></div>`;
  }
  let propuestaHtml = '';
  if (propuesta) {
    const a = ej.alternativas[0];
    const zona = D().proponer[ej.id].zona;
    propuestaHtml = `<div class="tarjeta alerta-tarjeta"><b>Después de la última vez subió la molestia ${zona === 'codo' ? 'del codo' : 'de las rodillas'}.</b>
      <p>Te propongo la alternativa: <b>${esc(a.nombre)}</b>. ${esc(a.como)}</p>
      <div class="fila"><button class="btn-principal" data-accion="usarPropuesta" data-alt="${a.id}">Usar alternativa</button>
      <button class="btn-sec" data-accion="rechazarPropuesta">Seguir igual</button></div></div>`;
  }

  const ladoHtml = ej.porLado ? `<div class="lado">${LADOS[ej.lado][ex.lado]}</div>` : '';
  let zonaTrabajo = '';
  if (o.tipo === 'tiempo') {
    const seg = o.segundos;
    zonaTrabajo = `${ladoHtml}
      <div class="reloj"><div class="tiempo-grande" id="t">${fmtSeg(seg)}</div><div class="etiqueta" id="et">segundos</div></div>
      <div id="controles-tiempo">
        <button class="btn-principal enorme" data-accion="arrancarTiempo">Arrancar</button>
      </div>`;
  } else if (o.tipo === 'mixta') {
    zonaTrabajo = `
      ${o.completas ? `<p class="nota-info">Primero ${o.completas} completas y después seguí en rodillas.</p>` : ''}
      <div class="doble">
        <div class="mitad"><div class="mitad-etiqueta">Completas</div>
          <button class="contador medio" data-accion="contar" data-campo="completas" data-delta="1"><span class="cifra" id="c-completas">${ex.completas}</span></button>
          <button class="btn-redondo" data-accion="contar" data-campo="completas" data-delta="-1" aria-label="Restar completa">${ICO.menos}</button></div>
        <div class="mitad"><div class="mitad-etiqueta">En rodillas</div>
          <button class="contador medio" data-accion="contar" data-campo="rodillas" data-delta="1"><span class="cifra" id="c-rodillas">${ex.rodillas}</span></button>
          <button class="btn-redondo" data-accion="contar" data-campo="rodillas" data-delta="-1" aria-label="Restar en rodillas">${ICO.menos}</button></div>
      </div>
      <div class="total">Total <b id="c-total">${ex.completas + ex.rodillas}</b> de ${o.total}</div>
      <button class="btn-principal enorme" data-accion="terminarSerie">Terminé la serie</button>`;
  } else {
    const ritmoHtml = o.ritmo ? `<div class="ritmo">
        <div class="ritmo-panel" id="ritmo-panel">Ritmo: ${o.ritmo.map(r => `${r.dice || PASO_TEXTO[r.paso]} ${r.s}"`).join(' · ')}</div>
        <button class="btn-sec" data-accion="alternarRitmo" id="b-ritmo">Marcar ritmo</button>
      </div>` : '';
    const ultimoLado = !ej.porLado || ex.lado === 1;
    zonaTrabajo = `${ladoHtml}
      <button class="contador" data-accion="contar" data-campo="conteo" data-delta="1" aria-label="Sumar"><span class="cifra" id="c-conteo">${ex.conteo[ex.lado]}</span></button>
      <div class="unidad">${ej.unidad} · meta ${metaTexto(ej)}</div>
      <div class="fila centro-fila">
        <button class="btn-redondo grande" data-accion="contar" data-campo="conteo" data-delta="-1" aria-label="Restar">${ICO.menos}</button>
        <button class="btn-redondo grande" data-accion="contar" data-campo="conteo" data-delta="1" aria-label="Sumar">${ICO.mas}</button>
      </div>
      ${ritmoHtml}
      <button class="btn-principal enorme" data-accion="terminarSerie">${ultimoLado ? 'Terminé la serie' : 'Listo, cambio de lado'}</button>`;
  }

  const como = [...(alt ? [`Variante: ${alt.como}`] : []), ...(Array.isArray(ej.como) ? ej.como : [ej.como])];
  const variantes = [{ id: '', nombre: 'La del programa' }, ...(ej.alternativas || [])];

  mostrar(`<section class="pantalla ejercicio">${barra(`${esc(p.nombre)} · ${s.ej + 1} de ${p.ejercicios.length}`, 'salirSesion')}
    ${propuestaHtml}
    <h1 class="nombre">${esc(ej.nombre)}</h1>
    <div class="meta">
      <span class="pastilla fuerte">Serie ${s.serie} de ${ej.series}</span>
      <span class="pastilla">${esc(o.texto)}</span>
      <span class="pastilla">Reserva ${ej.reserva}</span>
      ${alt ? `<span class="pastilla variante">${esc(alt.nombre)}</span>` : ''}
    </div>
    <p class="indicacion">${esc(ej.indicacion)}</p>
    ${avisoZona}
    ${zonaTrabajo}
    <div class="fila">
      <button class="btn-sec" data-accion="panel" data-panel="como">Cómo se hace</button>
      <button class="btn-sec" data-accion="panel" data-panel="variante">Cambiar variante</button>
    </div>
    <button class="btn-sec btn-atras" data-accion="anteriorEjercicio">${ICO.volver}<span>${esc(textoAnterior())}</span></button>
    <div class="panel" id="panel-como" ${ex.panel === 'como' ? '' : 'hidden'}>
      <ol class="pasos">${como.map(c => `<li>${esc(c)}</li>`).join('')}</ol>
      ${ej.videos && ej.videos.length ? videosHtml(ej.videos, 'Videos del PDF') : '<p class="tenue">Este ejercicio no tiene video en el PDF.</p>'}
    </div>
    <div class="panel" id="panel-variante" ${ex.panel === 'variante' ? '' : 'hidden'}>
      ${variantes.map(v => `<button class="opcion${(reg.variante || '') === v.id ? ' activo' : ''}" data-accion="elegirVariante" data-id="${v.id}">
        <b>${esc(v.nombre)}</b>${v.como ? `<span>${esc(v.como)}</span>` : ''}</button>`).join('')}
    </div>
  </section>`);
}

function pintarContador() {
  poner('#c-conteo', ex.conteo[ex.lado]);
  poner('#c-completas', ex.completas);
  poner('#c-rodillas', ex.rodillas);
  poner('#c-total', ex.completas + ex.rodillas);
}

function ejActual() {
  const s = D().enCurso;
  return planActual().ejercicios[s.ej];
}

function arrancarTiempo({ sinPreparar = false } = {}) {
  const ej = ejActual();
  const seg = ej.obj.segundos;
  const c = $('#controles-tiempo');
  if (c) c.innerHTML = `<div class="fila">
      <button class="btn-sec" data-accion="pausar" id="b-pausa">Pausar</button>
      <button class="btn-principal" data-accion="terminarAntes">Terminé antes</button></div>`;
  const correr = () => {
    poner('#et', 'segundos');
    poner('#t', fmtSeg(seg));
    timer = new Cuenta({
      segundos: seg,
      alTic: r => poner('#t', fmtSeg(r)),
      alAviso: () => Sonido.aviso(),
      alFin: () => { Sonido.fin(); finLadoTiempo(seg); }
    });
    timer.iniciar();
  };
  if (sinPreparar) correr();
  else { poner('#et', 'Preparate'); preparar(3, correr); }
}

function finLadoTiempo(seg) {
  const ej = ejActual();
  ex.segundos[ex.lado] = Math.round(seg);
  if (ej.porLado && ex.lado === 0) {
    ex.lado = 1;
    cambioDeLado(() => { renderEjercicio({ mantener: true }); arrancarTiempo({ sinPreparar: true }); }, LADOS[ej.lado][1]);
    return;
  }
  renderRegistroSerie();
}

// ---------- Registro de la serie ----------

function renderRegistroSerie(previo = null) {
  const s = D().enCurso;
  const ej = ejActual();
  const o = ej.obj;
  const nLados = ej.porLado ? 2 : 1;
  form = { reserva: previo ? previo.reserva : null, banda: (previo && previo.banda) || D().bandas[ej.id] || 'larga', _req: ['reserva'] };
  if (previo) {
    ex = { lado: nLados - 1, conteo: [0, 0], completas: 0, rodillas: 0, segundos: [null, null], panel: null };
    const vals = previo.lados || [previo.segundos != null ? previo.segundos : previo.reps];
    if (o.tipo === 'tiempo') ex.segundos = [vals[0], vals[1] ?? null];
    else if (o.tipo === 'mixta') { ex.completas = previo.completas || 0; ex.rodillas = previo.rodillas || 0; }
    else ex.conteo = [vals[0] || 0, vals[1] || 0];
  }
  let campos = '';
  if (o.tipo === 'tiempo') {
    form.v = [...Array(nLados).keys()].map(i => ex.segundos[i] ?? o.segundos);
    campos = form.v.map((v, i) => stepper(`v${i}`, v, `Segundos${ej.porLado ? ' · ' + LADOS[ej.lado][i] : ''}`, 5)).join('');
  } else if (o.tipo === 'mixta') {
    form.completas = ex.completas;
    form.rodillas = ex.rodillas;
    if (!form.completas && !form.rodillas) form.rodillas = o.total;
    campos = stepper('completas', form.completas, 'Completas') + stepper('rodillas', form.rodillas, 'En rodillas') +
      `<div class="total">Total <b id="f-total">${form.completas + form.rodillas}</b></div>`;
  } else {
    form.v = [...Array(nLados).keys()].map(i => ex.conteo[i] || o.max);
    const u = ej.unidad === 'pasos' ? 'Pasos' : 'Repeticiones';
    campos = form.v.map((v, i) => stepper(`v${i}`, v, `${u}${ej.porLado ? ' · ' + LADOS[ej.lado][i] : ''}`)).join('');
  }
  mostrar(`<section class="pantalla">${barra(`Serie ${s.serie} de ${ej.series}`, 'volverEjercicio')}
    <h1 class="nombre chico">${esc(ej.nombre)}</h1>
    <p class="tenue">Meta: ${esc(o.texto)}</p>
    ${campos}
    <div class="campo"><div class="campo-etiqueta">¿Cuántas más te salían? <span class="tenue">(la fase pide reserva ${ej.reserva})</span></div>
      ${chips('reserva', [0, 1, 2, 3, 4], form.reserva)}</div>
    ${ej.usaBanda ? `<div class="campo"><div class="campo-etiqueta">Banda</div>${chips('banda', BANDAS, form.banda)}</div>` : ''}
    <button class="btn-principal enorme" id="guardar" data-accion="guardarSerie" ${form.reserva == null ? 'disabled' : ''}>Guardar serie</button>
  </section>`);
}

function guardarSerie() {
  const d = D();
  const s = d.enCurso;
  const ej = ejActual();
  const reg = registroEj(ej);
  const o = ej.obj;
  const x = { reserva: form.reserva };
  if (o.tipo === 'tiempo') {
    if (ej.porLado) { x.lados = form.v.slice(); x.segundos = Math.min(...form.v); } else x.segundos = form.v[0];
  } else if (o.tipo === 'mixta') {
    x.completas = form.completas;
    x.rodillas = form.rodillas;
    x.reps = form.completas + form.rodillas;
  } else {
    if (ej.porLado) { x.lados = form.v.slice(); x.reps = Math.min(...form.v); } else x.reps = form.v[0];
  }
  if (ej.usaBanda) { x.banda = form.banda; d.bandas[ej.id] = form.banda; }
  reg.series[s.serie - 1] = x;
  if (s.serie < ej.series) {
    s.serie++;
    s.etapa = 'ejercicio';
    guardar();
    renderDescanso(ej.descanso, `Sigue: serie ${s.serie} de ${ej.series}`);
  } else {
    s.etapa = 'cierre';
    guardar();
    renderCierre();
  }
}

// ---------- Cierre del ejercicio ----------

function sugerencia(ej, reg) {
  const o = ej.obj;
  if (o.tipo === 'tiempo') return null;
  const tope = o.tipo === 'mixta' ? o.total : o.max;
  const ok = reg.series.length >= ej.series && reg.series.every(x => x.reps >= tope && x.reserva >= 2);
  if (!ok) return null;
  const prog = D().progresion[ej.id];
  const lento = prog && prog.fase === ej.fid && prog.lento;
  if (ej.usaBanda) {
    const ult = reg.series[reg.series.length - 1].banda;
    const i = BANDAS.indexOf(ult);
    if (i >= 0 && i < BANDAS.length - 1) return { tipo: 'banda', texto: `Acortá la banda: la próxima vez probá con «${BANDAS[i + 1]}».` };
  }
  if (!lento) return { tipo: 'lento', texto: 'Bajá más lento: tomate 3 segundos en cada bajada.' };
  const sig = siguienteVariante(ej);
  return { tipo: 'variante', texto: sig ? `Pasá a la variante siguiente: «${sig}».` : 'Pasá a la variante siguiente.' };
}

function renderCierre() {
  const ej = ejActual();
  const reg = registroEj(ej);
  const sug = sugerencia(ej, reg);
  form = { molestia: reg.molestia, sug, _req: ej.zona ? ['molestia'] : [] };
  const resumen = reg.series.map((x, i) => {
    const val = x.segundos != null ? `${x.lados ? x.lados.join(' y ') : x.segundos}"`
      : x.completas != null ? `${x.completas} completas + ${x.rodillas} en rodillas`
      : (x.lados ? x.lados.join(' y ') : x.reps);
    return `<li>Serie ${i + 1}: <b>${val}</b> · reserva ${x.reserva}${x.banda ? ` · banda ${x.banda}` : ''}</li>`;
  }).join('');
  const zonaTxt = ej.zona === 'brazo' ? 'el codo' : 'las rodillas';
  mostrar(`<section class="pantalla">${barra('Ejercicio terminado', 'salirSesion')}
    <h1 class="nombre chico">${esc(ej.nombre)}</h1>
    <ul class="lista-simple">${resumen}</ul>
    ${sug ? `<div class="tarjeta progreso-tarjeta"><b>Para progresar</b><p>${esc(sug.texto)}</p></div>` : ''}
    ${ej.zona ? `<div class="campo"><div class="campo-etiqueta">¿Cuánta molestia en ${zonaTxt}? (0 a 10)</div>
      ${chips('molestia', [...Array(11).keys()], reg.molestia)}
      <p class="alerta" id="alerta-molestia" ${reg.molestia > 3 ? '' : 'hidden'}>Pasó de 3 sobre 10: si sigue así, sacá este ejercicio.</p></div>` : ''}
    <label class="campo"><span class="campo-etiqueta">Nota (opcional)</span>
      <textarea id="nota" rows="2" placeholder="Algo para recordar de este ejercicio">${esc(reg.nota)}</textarea></label>
    <button class="btn-principal enorme" id="guardar" data-accion="guardarCierre" ${ej.zona && reg.molestia == null ? 'disabled' : ''}>Seguir</button>
    <button class="btn-sec btn-atras" data-accion="corregirSerie">${ICO.volver}<span>Corregir la serie ${reg.series.length}</span></button>
  </section>`);
}

function guardarCierre() {
  const d = D();
  const s = d.enCurso;
  const ej = ejActual();
  const reg = registroEj(ej);
  reg.molestia = ej.zona ? form.molestia : null;
  reg.nota = ($('#nota') ? $('#nota').value : '').trim();
  if (form.sug) {
    reg.sugerencia = form.sug.texto;
    if (form.sug.tipo === 'lento') d.progresion[ej.id] = { lento: true, fase: ej.fid };
  }
  const p = planActual();
  if (s.ej < p.ejercicios.length - 1) {
    s.ej++;
    s.serie = 1;
    s.etapa = 'ejercicio';
    guardar();
    renderDescanso(ej.descanso, `Sigue: ${p.ejercicios[s.ej].nombre}`);
  } else {
    s.etapa = 'estiramiento';
    s.gi = 0;
    s.gl = 0;
    guardar();
    renderGuiado('estiramiento');
  }
}

// ---------- Descanso ----------

function renderDescanso(seg, sigue) {
  ex = null;
  mostrar(`<section class="pantalla centro descanso">
    <div class="etiqueta grande">Descanso</div>
    <div class="tiempo-grande" id="t">${fmtSeg(seg)}</div>
    <div class="barra-progreso"><i id="bp" style="width:100%"></i></div>
    <p class="sub">${esc(sigue)}</p>
    <div class="fila">
      <button class="btn-sec grande" data-accion="sumar15">+15"</button>
      <button class="btn-principal grande" data-accion="saltarDescanso">Saltar</button>
    </div>
    <button class="btn-sec btn-atras" data-accion="anteriorEjercicio">${ICO.volver}<span>${esc(D().enCurso.serie > 1 ? `Corregir la serie ${D().enCurso.serie - 1}` : 'Corregir el ejercicio anterior')}</span></button>
  </section>`);
  timer = new Cuenta({
    segundos: seg,
    alTic: (r, c) => {
      poner('#t', fmtSeg(r));
      const bp = $('#bp');
      if (bp) bp.style.width = `${Math.max(0, Math.min(100, (r / c.total) * 100))}%`;
    },
    alAviso: () => Sonido.aviso(),
    alFin: () => { Sonido.finDescanso(); renderEjercicio(); }
  });
  timer.iniciar();
}

// ---------- Fin de la sesión ----------

function finalizarSesion() {
  const d = D();
  const s = d.enCurso;
  const fase = Registro.fase(s.semana);
  const ses = {
    id: Date.now().toString(36),
    fecha: Registro.hoy(),
    duracion: Math.max(1, Math.round((Date.now() - s.inicio) / 60000)),
    semana: s.semana,
    fase: fase.id,
    tipo: s.tipo,
    ejercicios: s.registros
  };
  d.sesiones.push(ses);
  if (ses.ejercicios.some(e => e.zona)) d.chequeoPendiente = { fecha: ses.fecha, sesionId: ses.id };
  if (s.semana === d.semana && s.indice === d.indice) Registro.avanzar();
  d.enCurso = null;
  guardar();
  mantenerPantalla(false);
  renderResumen(ses);
  if (Nube.activa()) Nube.subirSiHay().then(ok => aviso(ok ? 'Progreso guardado en GitHub' : 'Sin conexión: se sube a GitHub la próxima vez'));
}

function renderResumen(ses) {
  const nombre = R.sesiones[ses.tipo].nombre;
  const series = ses.ejercicios.reduce((a, e) => a + e.series.length, 0);
  const descanso = R.descansoDespuesDe.includes(ses.tipo);
  const sugerencias = ses.ejercicios.filter(e => e.sugerencia);
  mostrar(`<section class="pantalla">
    <div class="festejo">${ICO.listo}</div>
    <h1 class="titulo centro-texto">Sesión terminada</h1>
    <p class="sub centro-texto">${esc(nombre)} · Semana ${ses.semana} · ${ses.duracion} min · ${series} series</p>
    ${sugerencias.length ? `<div class="tarjeta progreso-tarjeta"><b>Para la próxima</b><ul class="lista-simple">${sugerencias.map(e => `<li>${esc(e.nombre)}: ${esc(e.sugerencia)}</li>`).join('')}</ul></div>` : ''}
    ${descanso ? '<p class="nota-info">Mañana toca descanso.</p>' : ''}
    ${D().chequeoPendiente ? '<p class="tenue centro-texto">Mañana te pregunto cómo amanecieron el codo y las rodillas.</p>' : ''}
    <button class="btn-principal enorme" data-accion="inicio">Volver al inicio</button>
  </section>`);
}

// ---------- Desafío semana 11 ----------

function renderDesafio() {
  const d = D();
  if (!d.desafioActual) d.desafioActual = { resultados: {} };
  const res = d.desafioActual.resultados;
  const pruebas = R.desafio.pruebas;
  const listo = pruebas.every(p => res[p.id]);
  mostrar(`<section class="pantalla">${barra(esc(R.desafio.titulo))}
    <div class="tarjeta aviso-tarjeta chica"><b>Codo</b><p>${esc(R.avisos.codo)}</p></div>
    <div class="tarjeta aviso-tarjeta chica"><b>Rodillas</b><p>${esc(R.avisos.rodillas)}</p></div>
    <button class="btn-sec" data-accion="calentarDesafio">Hacer el calentamiento</button>
    ${pruebas.map((p, i) => {
      const r = res[p.id];
      return `<button class="opcion${r ? (r.ok ? ' ok' : ' no') : ''}" data-accion="irPrueba" data-i="${i}">
        <b>${esc(p.nombre)}</b><span>Meta: ${esc(p.meta)}${r ? ` · Hiciste: ${r.texto} ${r.ok ? '✓' : '✕'}` : ''}</span></button>`;
    }).join('')}
    <button class="btn-principal enorme" data-accion="resultadoDesafio" ${listo ? '' : 'disabled'}>Ver resultado</button>
  </section>`);
}

function renderPrueba(i) {
  const p = R.desafio.pruebas[i];
  ex = { lado: 0, conteo: [0, 0], prueba: i };
  form = { sinDolor: null };
  let zona = '';
  if (p.tipo === 'tiempo') {
    zona = `<div class="reloj"><div class="tiempo-grande" id="t">${fmtSeg(p.objetivo)}</div><div class="etiqueta" id="et">segundos</div></div>
      <div id="controles-tiempo"><button class="btn-principal enorme" data-accion="arrancarPrueba">Arrancar</button></div>`;
  } else if (p.lado) {
    form._req = p.sinDolor ? ['sinDolor'] : [];
    zona = stepper('p0', 0, LADOS[p.lado][0]) + stepper('p1', 0, LADOS[p.lado][1]) +
      (p.sinDolor ? `<div class="campo"><div class="campo-etiqueta">¿Sin dolor?</div>${chips('sinDolor', ['si', 'no'], null, ['Sí', 'No'])}</div>` : '') +
      `<button class="btn-principal enorme" id="guardar" data-accion="guardarPrueba" ${p.sinDolor ? 'disabled' : ''}>Guardar resultado</button>`;
  } else {
    zona = `<button class="contador" data-accion="contar" data-campo="conteo" data-delta="1"><span class="cifra" id="c-conteo">0</span></button>
      <div class="unidad">repeticiones · meta ${esc(p.meta)}</div>
      <div class="fila centro-fila">
        <button class="btn-redondo grande" data-accion="contar" data-campo="conteo" data-delta="-1" aria-label="Restar">${ICO.menos}</button>
        <button class="btn-redondo grande" data-accion="contar" data-campo="conteo" data-delta="1" aria-label="Sumar">${ICO.mas}</button>
      </div>
      <button class="btn-principal enorme" data-accion="guardarPrueba">Guardar resultado</button>`;
  }
  mostrar(`<section class="pantalla">${barra('Desafío', 'irDesafio')}
    <h1 class="nombre">${esc(p.nombre)}</h1>
    <div class="meta"><span class="pastilla fuerte">Meta: ${esc(p.meta)}</span></div>
    ${zona}
    ${videosHtml(p.videos, 'Videos del PDF')}
  </section>`);
}

function guardarPrueba(valorTiempo = null) {
  const d = D();
  const p = R.desafio.pruebas[ex.prueba];
  let valor;
  let texto;
  let ok;
  if (p.tipo === 'tiempo') {
    valor = Math.round(valorTiempo);
    texto = `${valor}"`;
    ok = valor >= p.objetivo;
  } else if (p.lado) {
    const a = form.p0 || 0;
    const b = form.p1 || 0;
    valor = Math.min(a, b);
    texto = `${a} y ${b}${p.sinDolor ? (form.sinDolor === 'si' ? ', sin dolor' : ', con dolor') : ''}`;
    ok = valor >= p.objetivo && (!p.sinDolor || form.sinDolor === 'si');
  } else {
    valor = ex.conteo[0];
    texto = String(valor);
    ok = valor >= p.objetivo;
  }
  d.desafioActual.resultados[p.id] = { valor, texto, ok };
  guardar();
  renderDesafio();
}

function resultadoDesafio() {
  const d = D();
  const res = d.desafioActual.resultados;
  const todas = R.desafio.pruebas.every(p => res[p.id] && res[p.id].ok);
  d.desafios.push({ fecha: Registro.hoy(), resultados: res, completo: todas });
  d.desafioActual = null;
  if (todas) d.completado = true;
  guardar();
  mostrar(`<section class="pantalla">
    <div class="festejo${todas ? '' : ' tenue-festejo'}">${todas ? ICO.estrella : ICO.repetir}</div>
    <h1 class="titulo centro-texto">${esc(todas ? R.desafio.completado : R.desafio.noCompletado)}</h1>
    <ul class="lista-simple">${R.desafio.pruebas.map(p => `<li>${esc(p.nombre)}: <b>${res[p.id].texto}</b> ${res[p.id].ok ? '✓' : '✕'} (meta ${esc(p.meta)})</li>`).join('')}</ul>
    ${todas ? '' : '<button class="btn-principal enorme" data-accion="repetirChoque">Repetir la fase Choque</button>'}
    <button class="${todas ? 'btn-principal enorme' : 'btn-texto'}" data-accion="inicio">Volver al inicio</button>
  </section>`);
}

// ---------- Historial ----------

function todosLosEjercicios() {
  const lista = [];
  R.ordenSemanal.forEach(t => R.sesiones[t].ejercicios.forEach(e => lista.push({ id: e.id, nombre: e.nombre, sesion: R.sesiones[t].nombre })));
  return lista;
}

function renderHistorial() {
  const d = D();
  const tabs = [['sesiones', 'Sesiones'], ['progreso', 'Progreso'], ['molestias', 'Molestias'], ['medidas', 'Medidas']];
  let cuerpo = '';
  if (ui.tab === 'sesiones') cuerpo = historialSesiones();
  else if (ui.tab === 'progreso') cuerpo = historialProgreso();
  else if (ui.tab === 'molestias') cuerpo = historialMolestias();
  else cuerpo = historialMedidas();
  mostrar(`<section class="pantalla">${barra('Historial')}
    <div class="numeros">
      <div><b>${d.sesiones.length}</b><span>sesiones hechas</span></div>
      <div><b>${Registro.racha()}</b><span>días de racha</span></div>
      <div><b>${Math.min(d.semana, 11)}</b><span>semana actual</span></div>
    </div>
    <p class="tenue chico-texto">La racha cuenta los entrenamientos seguidos sin pasar 3 días de descanso.</p>
    <div class="tabs">${tabs.map(([id, t]) => `<button class="tab${ui.tab === id ? ' activo' : ''}" data-accion="tab" data-tab="${id}">${t}</button>`).join('')}</div>
    ${cuerpo}
  </section>`);
}

function textoSerie(x) {
  if (x.segundos != null) return `${x.lados ? x.lados.join('/') : x.segundos}"`;
  if (x.completas != null) return `${x.completas}+${x.rodillas}`;
  return x.lados ? x.lados.join('/') : String(x.reps);
}

function historialSesiones() {
  const d = D();
  if (!d.sesiones.length) return '<p class="vacio">Todavía no hiciste ninguna sesión.</p>';
  return [...d.sesiones].reverse().map(s => {
    const fase = R.fases.find(f => f.id === s.fase);
    return `<details class="tarjeta sesion-item"><summary>
      <span><b>${esc(R.sesiones[s.tipo].nombre)}</b> · ${fmtFecha(s.fecha)}</span>
      <span class="tenue">Semana ${s.semana} · ${esc(fase ? fase.nombre : '')} · ${s.duracion} min</span></summary>
      <ul class="lista-simple">${s.ejercicios.map(e => {
        const alt = e.variante ? ((R.sesiones[s.tipo].ejercicios.find(x => x.id === e.id) || {}).alternativas || []).find(a => a.id === e.variante) : null;
        return `<li><b>${esc(e.nombre)}</b>${alt ? ` <span class="tenue">(${esc(alt.nombre)})</span>` : ''}<br>
          ${e.series.map(textoSerie).join(' · ')}${e.series.some(x => x.banda) ? ` · banda ${esc(e.series[e.series.length - 1].banda)}` : ''}
          ${e.molestia != null ? ` · molestia ${e.molestia}` : ''}${e.nota ? `<br><i>${esc(e.nota)}</i>` : ''}</li>`;
      }).join('')}</ul></details>`;
  }).join('');
}

function historialProgreso() {
  const d = D();
  const lista = todosLosEjercicios();
  if (!ui.progresoId) {
    const ult = d.sesiones[d.sesiones.length - 1];
    ui.progresoId = ult && ult.ejercicios[0] ? ult.ejercicios[0].id : lista[0].id;
  }
  const sel = `<select id="sel-ejercicio" data-cambio="progreso">${R.ordenSemanal.map(t =>
    `<optgroup label="${esc(R.sesiones[t].nombre)}">${R.sesiones[t].ejercicios.map(e =>
      `<option value="${e.id}"${e.id === ui.progresoId ? ' selected' : ''}>${esc(e.nombre)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const puntos = [];
  d.sesiones.forEach(s => {
    const e = s.ejercicios.find(x => x.id === ui.progresoId);
    if (!e || !e.series.length) return;
    const vals = e.series.map(x => (x.segundos != null ? x.segundos : x.reps));
    const bandas = e.series.map(x => x.banda).filter(Boolean);
    puntos.push({ fecha: s.fecha, valor: Math.max(...vals), banda: bandas.length ? bandas[bandas.length - 1] : null, esTiempo: e.series[0].segundos != null });
  });
  if (!puntos.length) return sel + '<p class="vacio">Todavía no hay series de este ejercicio.</p>';
  const usaBanda = puntos.some(p => p.banda);
  const grafico = Graficos.lineas({
    etiquetas: puntos.map(p => fmtFecha(p.fecha, false)),
    series: [{ nombre: 'Mejor serie', color: 'var(--fase)', valores: puntos.map(p => p.valor), coloresPunto: puntos.map(p => (p.banda ? COLOR_BANDA[p.banda] : null)) }],
    leyendaExtra: usaBanda ? BANDAS.map(b => `<span><i style="background:${COLOR_BANDA[b]}"></i>banda ${b}</span>`).join('') : ''
  });
  return `${sel}<div class="tarjeta"><div class="campo-etiqueta">Mejor serie de cada sesión (${puntos[0].esTiempo ? 'segundos' : 'repeticiones'})</div>${grafico}</div>`;
}

function historialMolestias() {
  const d = D();
  const ch = d.chequeos;
  const g1 = Graficos.lineas({
    etiquetas: ch.map(c => fmtFecha(c.fecha, false)),
    series: [
      { nombre: 'Codo', color: '#ff8c42', valores: ch.map(c => c.codo) },
      { nombre: 'Rodillas', color: '#7fb3ff', valores: ch.map(c => c.rodillas) }
    ],
    yMin: 0, yMax: 10
  });
  const ses = d.sesiones.filter(s => s.ejercicios.some(e => e.molestia != null));
  const maxZona = (s, z) => {
    const v = s.ejercicios.filter(e => e.zona === z && e.molestia != null).map(e => e.molestia);
    return v.length ? Math.max(...v) : null;
  };
  const g2 = Graficos.lineas({
    etiquetas: ses.map(s => fmtFecha(s.fecha, false)),
    series: [
      { nombre: 'Codo', color: '#ff8c42', valores: ses.map(s => maxZona(s, 'brazo')) },
      { nombre: 'Rodillas', color: '#7fb3ff', valores: ses.map(s => maxZona(s, 'pierna')) }
    ],
    yMin: 0, yMax: 10
  });
  return `<div class="tarjeta"><div class="campo-etiqueta">Al día siguiente (0 a 10)</div>${g1}</div>
    <div class="tarjeta"><div class="campo-etiqueta">Durante la sesión, la mayor de cada día (0 a 10)</div>${g2}</div>`;
}

function historialMedidas() {
  const d = D();
  const m1 = d.medidas.find(m => m.semana === 1);
  const m10 = d.medidas.find(m => m.semana === 10);
  const fila = (t, k, u) => {
    const a = m1 && m1[k] != null ? m1[k] : null;
    const b = m10 && m10[k] != null ? m10[k] : null;
    const dif = a != null && b != null ? (b - a) : null;
    return `<tr><td>${t}</td><td>${a != null ? a + ' ' + u : '—'}</td><td>${b != null ? b + ' ' + u : '—'}</td>
      <td class="${dif > 0 ? 'positivo' : ''}">${dif != null ? (dif > 0 ? '+' : '') + Math.round(dif * 10) / 10 : '—'}</td></tr>`;
  };
  return `<div class="tarjeta"><table class="tabla">
      <thead><tr><th></th><th>Semana 1</th><th>Semana 10</th><th>Cambio</th></tr></thead>
      <tbody>${fila('Brazo', 'brazo', 'cm')}${fila('Pecho', 'pecho', 'cm')}${fila('Peso', 'peso', 'kg')}</tbody></table></div>
    <div class="fila">
      <button class="btn-sec" data-accion="irMedidas" data-semana="1">Cargar semana 1</button>
      <button class="btn-sec" data-accion="irMedidas" data-semana="10">Cargar semana 10</button>
    </div>`;
}

// ---------- Ajustes ----------

function renderAjustes() {
  const d = D();
  const fase = Registro.fase(d.semana);
  const a = d.ajustes;
  mostrar(`<section class="pantalla">${barra('Ajustes')}
    <div class="tarjeta">
      <button class="interruptor${a.sonido ? ' activo' : ''}" data-accion="interruptor" data-clave="sonido"><span>Sonido</span><i></i></button>
      <button class="interruptor${a.vibracion ? ' activo' : ''}" data-accion="interruptor" data-clave="vibracion"><span>Vibración</span><i></i></button>
      <button class="btn-sec" data-accion="probarSonidos">Probar sonidos</button>
    </div>
    <div class="tarjeta">
      <div class="campo-etiqueta">Dónde estás en el programa</div>
      <div class="stepper-fila">
        <button class="btn-redondo" data-accion="moverSemana" data-delta="-1" aria-label="Semana anterior">${ICO.menos}</button>
        <div class="stepper-valor chico">Semana ${d.semana}<small>${esc(fase.nombre)}</small></div>
        <button class="btn-redondo" data-accion="moverSemana" data-delta="1" aria-label="Semana siguiente">${ICO.mas}</button>
      </div>
      ${d.semana < 11 ? `<div class="campo-etiqueta">Próxima sesión</div>
        ${chips('indice', [0, 1, 2, 3], d.indice, R.ordenSemanal.map(t => R.sesiones[t].nombre))}` : ''}
    </div>
    <div class="tarjeta">
      <div class="campo-etiqueta">Copia de seguridad</div>
      <p class="tenue">Los datos viven solo en este teléfono. Guardá una copia de vez en cuando.</p>
      <button class="btn-sec" data-accion="exportar">Guardar copia</button>
      <label class="btn-sec como-boton">Cargar copia<input type="file" id="archivo-copia" accept=".json,application/json" hidden></label>
    </div>
    ${tarjetaNube()}
    <div class="tarjeta">
      <button class="btn-peligro" data-accion="borrarTodo">Borrar todo y empezar de nuevo</button>
    </div>
    <p class="tenue centro-texto chico-texto">GYM LAB · by 360 Lab Studio</p>
  </section>`);
}

function tarjetaNube() {
  if (!Nube.activa()) {
    return `<div class="tarjeta nube">
      <div class="campo-etiqueta">Guardar en GitHub</div>
      <p class="tenue">Tu progreso se sube solo al terminar cada sesión a un repositorio privado (gym-lab-datos). Si cambiás de teléfono lo bajás desde acá.</p>
      <p class="tenue">Para activarlo hace falta una llave de GitHub. Se crea una sola vez:</p>
      <ol class="pasos">
        <li>Abrí <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">esta página de GitHub</a>.</li>
        <li>Nombre: GYM LAB. Vencimiento: el más largo que deje.</li>
        <li>En «Repository access» elegí «Only select repositories» y marcá <b>gym-lab-datos</b>.</li>
        <li>En «Permissions», «Contents»: <b>Read and write</b>.</li>
        <li>Tocá «Generate token», copiá la llave y pegala acá.</li>
      </ol>
      <input id="llave-gh" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…">
      <button class="btn-principal" data-accion="guardarLlave">Activar</button>
    </div>`;
  }
  const e = Nube.estado();
  const ultima = e.ultima ? new Date(e.ultima).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'todavía nunca';
  return `<div class="tarjeta nube">
    <div class="campo-etiqueta">Guardar en GitHub</div>
    <p class="tenue">Se sube solo al terminar cada sesión. Última subida: <b>${esc(ultima)}</b>${e.pendiente ? ' <b>Hay cambios sin subir.</b>' : ''}</p>
    <button class="btn-sec" data-accion="subirNube">Subir progreso</button>
    <button class="btn-sec" data-accion="bajarNube">Bajar progreso</button>
    <button class="btn-texto" data-accion="quitarLlave">Quitar la llave de este teléfono</button>
  </div>`;
}

// ---------- Acciones ----------

function validarForm() {
  const b = $('#guardar');
  if (b && form && form._req) b.disabled = form._req.some(k => form[k] == null);
}

const acciones = {
  inicio: () => irInicio(),

  empezar() {
    const d = D();
    d.enCurso = {
      tipo: R.ordenSemanal[d.indice], semana: d.semana, indice: d.indice,
      inicio: Date.now(), etapa: 'previa', gi: 0, gl: 0, ej: 0, serie: 1, registros: []
    };
    guardar();
    mantenerPantalla(true);
    renderPrevia();
  },

  seguirSesion() {
    const s = D().enCurso;
    mantenerPantalla(true);
    if (s.etapa === 'previa') return renderPrevia();
    if (s.etapa === 'calentamiento') return renderGuiado('calentamiento');
    if (s.etapa === 'estiramiento') return renderGuiado('estiramiento');
    if (s.etapa === 'cierre') return renderCierre();
    return renderEjercicio();
  },

  descartarSesion() {
    preguntar('Se pierde lo que hiciste de esta sesión. ¿Empezar de cero?', 'Sí, empezar de cero', () => {
      D().enCurso = null;
      guardar();
      renderInicio();
    });
  },

  salirSesion() {
    preguntar('¿Salir de la sesión? Lo que hiciste queda guardado y la seguís desde el inicio.', 'Salir', () => {
      limpiar();
      mantenerPantalla(false);
      guardar();
      irInicio();
    }, 'Seguir entrenando');
  },

  empezarCalentamiento() {
    const s = D().enCurso;
    s.etapa = 'calentamiento';
    s.gi = 0;
    s.gl = 0;
    guardar();
    renderGuiado('calentamiento');
  },

  saltarCalentamiento() { terminarGuiado('calentamiento'); },

  pausar(el) {
    if (!timer) return;
    if (timer.corriendo) { timer.pausar(); el.textContent = 'Seguir'; }
    else { timer.reanudar(); el.textContent = 'Pausar'; }
  },

  saltarGuiado(el) { limpiar(); siguienteGuiado(el.dataset.cual); },

  anteriorGuiado(el) { limpiar(); anteriorGuiado(el.dataset.cual); },

  anteriorEjercicio() { anteriorEjercicio(); },

  corregirSerie() { corregirSerie(); },

  saltarTodoGuiado(el) { limpiar(); terminarGuiado(el.dataset.cual); },

  saltarCambio() {
    limpiar();
    const f = alCambio;
    alCambio = null;
    if (f) f();
  },

  contar(el) {
    const c = el.dataset.campo;
    const dl = Number(el.dataset.delta);
    if (c === 'conteo') ex.conteo[ex.lado] = Math.max(0, ex.conteo[ex.lado] + dl);
    else ex[c] = Math.max(0, ex[c] + dl);
    Sonido.toque();
    pintarContador();
  },

  alternarRitmo(el) {
    const ej = ejActual();
    const panel = $('#ritmo-panel');
    if (ritmo || (timer && !ritmo)) {
      limpiar();
      el.textContent = 'Marcar ritmo';
      panel.classList.remove('activo');
      panel.textContent = `Ritmo: ${ej.obj.ritmo.map(r => `${r.dice || PASO_TEXTO[r.paso]} ${r.s}"`).join(' · ')}`;
      return;
    }
    el.textContent = 'Parar ritmo';
    panel.classList.add('activo');
    timer = new Cuenta({
      segundos: 3,
      avisoEn: 3,
      alTic: r => { panel.textContent = `Preparate… ${r}`; },
      alAviso: () => Sonido.tic(),
      alFin: () => {
        timer = null;
        ritmo = new Ritmo(ej.obj.ritmo, {
          alPaso: p => { Sonido[p.paso](); panel.dataset.paso = p.paso; },
          alSegundo: (p, r) => { panel.textContent = `${p.dice || PASO_TEXTO[p.paso]} · ${r}`; },
          alCiclo: () => { ex.conteo[ex.lado]++; pintarContador(); }
        });
        ritmo.iniciar();
      }
    });
    timer.iniciar();
  },

  terminarSerie() {
    const ej = ejActual();
    limpiar();
    if (ej.porLado && ex.lado === 0) {
      ex.lado = 1;
      cambioDeLado(() => renderEjercicio({ mantener: true }), LADOS[ej.lado][1]);
      return;
    }
    renderRegistroSerie();
  },

  arrancarTiempo() { arrancarTiempo(); },

  terminarAntes() {
    if (!timer) return;
    const t = timer.transcurrido();
    limpiar();
    if (ex.prueba != null) return guardarPrueba(t);
    finLadoTiempo(t);
  },

  panel(el) {
    const id = el.dataset.panel;
    ex.panel = ex.panel === id ? null : id;
    ['como', 'variante'].forEach(p => { const x = $(`#panel-${p}`); if (x) x.hidden = ex.panel !== p; });
    if (ex.panel) $(`#panel-${ex.panel}`).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  elegirVariante(el) {
    const ej = ejActual();
    const reg = registroEj(ej);
    const id = el.dataset.id || null;
    reg.variante = id;
    if (id) D().variantes[ej.id] = id; else delete D().variantes[ej.id];
    guardar();
    ex.panel = null;
    limpiar();
    renderEjercicio({ mantener: true });
    aviso(id ? 'Variante guardada' : 'Volviste a la del programa');
  },

  usarPropuesta(el) {
    const ej = ejActual();
    const reg = registroEj(ej);
    reg.variante = el.dataset.alt;
    D().variantes[ej.id] = el.dataset.alt;
    delete D().proponer[ej.id];
    guardar();
    renderEjercicio({ mantener: true });
  },

  rechazarPropuesta() {
    const ej = ejActual();
    delete D().proponer[ej.id];
    guardar();
    renderEjercicio({ mantener: true });
  },

  volverEjercicio() { renderEjercicio({ mantener: true }); },

  ajustar(el) {
    const c = el.dataset.campo;
    const dl = Number(el.dataset.delta);
    if (c[0] === 'v') {
      const i = Number(c.slice(1));
      form.v[i] = Math.max(0, form.v[i] + dl);
      poner(`#f-${c}`, form.v[i]);
    } else {
      form[c] = Math.max(0, (form[c] || 0) + dl);
      poner(`#f-${c}`, form[c]);
    }
    if (form.completas != null) poner('#f-total', (form.completas || 0) + (form.rodillas || 0));
  },

  elegir(el) {
    const g = el.dataset.grupo;
    let v = el.dataset.valor;
    if (/^\d+$/.test(v)) v = Number(v);
    el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('activo', c === el));
    if (g === 'indice') {
      D().indice = v;
      guardar();
      return;
    }
    form[g] = v;
    if (g === 'molestia') { const a = $('#alerta-molestia'); if (a) a.hidden = v <= 3; }
    validarForm();
  },

  guardarSerie: () => guardarSerie(),
  guardarCierre: () => guardarCierre(),

  sumar15() { if (timer) timer.sumar(15); },

  saltarDescanso() { limpiar(); renderEjercicio(); },

  guardarChequeo() { renderChequeo(Registro.evaluarChequeo(form.codo, form.rodillas)); },

  saltarChequeo() {
    D().chequeoPendiente = null;
    guardar();
    renderInicio();
  },

  irMedidas(el) { renderMedidas(Number(el.dataset.semana)); },

  guardarMedidas(el) {
    const semana = Number(el.dataset.semana);
    const num = id => { const v = parseFloat(String($(id).value).replace(',', '.')); return Number.isFinite(v) ? v : null; };
    const m = { semana, fecha: Registro.hoy(), brazo: num('#m-brazo'), pecho: num('#m-pecho'), peso: num('#m-peso') };
    const d = D();
    d.medidas = d.medidas.filter(x => x.semana !== semana);
    d.medidas.push(m);
    guardar();
    aviso('Medidas guardadas');
    ui.tab = 'medidas';
    renderHistorial();
  },

  irHistorial() { renderHistorial(); },
  irHistorialMedidas() { ui.tab = 'medidas'; renderHistorial(); },
  tab(el) { ui.tab = el.dataset.tab; renderHistorial(); },

  irAjustes() { renderAjustes(); },

  interruptor(el) {
    const k = el.dataset.clave;
    const a = D().ajustes;
    a[k] = !a[k];
    guardar();
    Sonido.configurar(a);
    el.classList.toggle('activo', a[k]);
  },

  probarSonidos() {
    Sonido.desbloquear();
    const seq = ['tic', 'aviso', 'bajar', 'pausa', 'subir', 'cambio', 'fin', 'finDescanso'];
    seq.forEach((n, i) => setTimeout(() => Sonido[n](), i * 1100));
  },

  moverSemana(el) {
    const d = D();
    d.semana = Math.max(1, Math.min(11, d.semana + Number(el.dataset.delta)));
    if (d.semana >= 11) d.indice = 0;
    guardar();
    renderAjustes();
  },

  exportar() {
    const blob = new Blob([Registro.exportar()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-lab-copia-${Registro.hoy()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },

  borrarTodo() {
    preguntar('Se borran todas las sesiones, molestias y medidas de este teléfono. No se puede deshacer.', 'Sí, borrar todo', () => {
      Registro.borrar();
      ui = { tab: 'sesiones', progresoId: null };
      aviso('Datos borrados');
      renderInicio();
    });
  },

  irDesafio() { renderDesafio(); },

  mes(el) {
    const [a, m] = ui.mes.split('-').map(Number);
    const f = new Date(a, m - 1 + Number(el.dataset.delta), 1);
    ui.mes = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
    renderInicio();
  },

  async guardarLlave(el) {
    const token = ($('#llave-gh').value || '').trim();
    if (!token) return aviso('Pegá la llave primero');
    el.disabled = true;
    try {
      await Nube.probar(token);
      Nube.guardarLlave(token);
      aviso('Llave guardada');
      renderAjustes();
      if (D().sesiones.length) Nube.subirSiHay().then(() => renderAjustes());
    } catch (err) {
      el.disabled = false;
      aviso(err.message.startsWith('La llave') ? err.message : 'No se pudo conectar con GitHub');
    }
  },

  async subirNube(el) {
    el.disabled = true;
    try { await Nube.subir(); aviso('Progreso guardado en GitHub'); }
    catch (err) { aviso(err.message.startsWith('GitHub') || err.message.startsWith('La llave') ? err.message : 'Sin conexión'); }
    renderAjustes();
  },

  async bajarNube(el) {
    el.disabled = true;
    let texto;
    try { texto = await Nube.bajar(); }
    catch (err) { el.disabled = false; return aviso(err.message.startsWith('Todavía') || err.message.startsWith('La llave') || err.message.startsWith('GitHub') ? err.message : 'Sin conexión'); }
    el.disabled = false;
    preguntar('Lo que está en GitHub reemplaza los datos de este teléfono. ¿Seguir?', 'Sí, bajar', () => {
      try {
        Registro.importar(texto);
        Sonido.configurar(D().ajustes);
        aviso('Progreso bajado de GitHub');
        renderInicio();
      } catch (e) { aviso('Lo que está en GitHub no se pudo leer'); }
    });
  },

  quitarLlave() {
    preguntar('Se borra la llave de este teléfono. Tus datos no se tocan.', 'Quitar', () => { Nube.quitarLlave(); renderAjustes(); });
  },

  calentarDesafio() {
    D().enCurso = { tipo: 'desafio', semana: D().semana, inicio: Date.now(), etapa: 'calentamiento', gi: 0, gl: 0, registros: [] };
    guardar();
    mantenerPantalla(true);
    renderGuiado('calentamiento');
  },

  irPrueba(el) { renderPrueba(Number(el.dataset.i)); },

  arrancarPrueba() {
    const p = R.desafio.pruebas[ex.prueba];
    const c = $('#controles-tiempo');
    c.innerHTML = `<button class="btn-principal enorme" data-accion="terminarAntes">Aflojé</button>`;
    mantenerPantalla(true);
    poner('#et', 'Preparate');
    preparar(3, () => {
      poner('#et', 'segundos');
      timer = new Cuenta({
        segundos: p.objetivo,
        alTic: r => poner('#t', fmtSeg(r)),
        alAviso: () => Sonido.aviso(),
        alFin: () => { Sonido.fin(); guardarPrueba(p.objetivo); }
      });
      timer.iniciar();
    });
  },

  guardarPrueba() {
    const p = R.desafio.pruebas[ex.prueba];
    if (p.lado) { form.p0 = form.p0 || 0; form.p1 = form.p1 || 0; }
    guardarPrueba();
  },

  resultadoDesafio: () => resultadoDesafio(),

  repetirChoque() {
    const d = D();
    d.semana = 7;
    d.indice = 0;
    guardar();
    renderInicio();
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-accion]');
  if (!el || el.disabled) return;
  Sonido.desbloquear();
  const fn = acciones[el.dataset.accion];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('change', e => {
  if (e.target.id === 'sel-ejercicio') {
    ui.progresoId = e.target.value;
    renderHistorial();
  }
  if (e.target.id === 'archivo-copia' && e.target.files[0]) {
    const archivo = e.target.files[0];
    const lector = new FileReader();
    lector.onload = () => {
      preguntar('La copia reemplaza todos los datos de este teléfono. ¿Seguir?', 'Sí, cargar copia', () => {
        try {
          Registro.importar(lector.result);
          Sonido.configurar(D().ajustes);
          aviso('Copia cargada');
          renderInicio();
        } catch (err) {
          aviso('No se pudo leer el archivo');
        }
      });
    };
    lector.readAsText(archivo);
    e.target.value = '';
  }
});

// ---------- Arranque ----------

async function arrancar() {
  try {
    const r = await fetch('rutina.json');
    R = await r.json();
  } catch (e) {
    $app.innerHTML = `<section class="pantalla"><h1 class="titulo">No se pudo cargar la rutina</h1>
      <p class="tenue">Abrí GYM LAB desde la dirección del servidor (no con doble clic en el archivo).</p></section>`;
    return;
  }
  Registro.iniciar(R);
  Sonido.configurar(D().ajustes);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  irInicio();
  if (Nube.activa() && Nube.estado().pendiente) Nube.subirSiHay().then(ok => ok && aviso('Progreso guardado en GitHub'));
}

arrancar();
