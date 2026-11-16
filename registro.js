'use strict';
// Datos guardados en el teléfono (localStorage), copia de seguridad y cálculos del historial.

const Registro = (() => {
  const CLAVE = 'gymlab.datos.v1';
  let R = null;
  let d = null;

  function hoy(f = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
  }

  function diasEntre(a, b) {
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  }

  function base() {
    return {
      version: 1,
      creado: hoy(),
      semana: 1,
      indice: 0,
      sesiones: [],
      chequeos: [],
      medidas: [],
      bandas: {},
      variantes: {},
      progresion: {},
      proponer: {},
      enCurso: null,
      chequeoPendiente: null,
      desafioActual: null,
      desafios: [],
      completado: false,
      ajustes: { sonido: true, vibracion: true }
    };
  }

  function iniciar(rutina) {
    R = rutina;
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { guardado = null; }
    d = Object.assign(base(), guardado || {});
    d.ajustes = Object.assign(base().ajustes, d.ajustes || {});
  }

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(d)); return true; } catch (e) { return false; }
  }

  function fase(semana = d.semana) {
    return R.fases.find(f => f.semanas.includes(semana)) || R.fases[R.fases.length - 1];
  }

  function avanzar() {
    d.indice++;
    if (d.indice >= R.ordenSemanal.length) {
      d.indice = 0;
      d.semana = Math.min(d.semana + 1, 11);
    }
  }

  // Días de entrenamiento seguidos sin pasar 3 días de descanso.
  function racha() {
    const fechas = [...new Set(d.sesiones.map(s => s.fecha))].sort();
    if (!fechas.length) return 0;
    if (diasEntre(fechas[fechas.length - 1], hoy()) > 3) return 0;
    let n = 1;
    for (let i = fechas.length - 1; i > 0; i--) {
      if (diasEntre(fechas[i - 1], fechas[i]) <= 3) n++;
      else break;
    }
    return n;
  }

  // Chequeo del día siguiente. Devuelve las zonas donde subió la molestia.
  function evaluarChequeo(codo, rodillas) {
    const p = d.chequeoPendiente;
    const ses = p ? d.sesiones.find(s => s.id === p.sesionId) : null;
    const resultado = [];
    const zonas = [['brazo', codo, 'codo'], ['pierna', rodillas, 'rodillas']];
    for (const [zona, valor, nombre] of zonas) {
      const ejs = ses ? ses.ejercicios.filter(e => e.zona === zona) : [];
      const molestias = ejs.map(e => e.molestia).filter(v => v != null);
      let referencia;
      if (molestias.length) {
        referencia = Math.max(...molestias);
      } else {
        const previo = [...d.chequeos].reverse().find(c => c[nombre] != null);
        referencia = previo ? previo[nombre] : 0;
      }
      if (valor > 3 || valor - referencia >= 2) {
        const maximo = molestias.length ? Math.max(...molestias) : 0;
        const culpables = maximo > 0 ? ejs.filter(e => e.molestia === maximo) : ejs;
        culpables.forEach(e => { d.proponer[e.id] = { zona: nombre, fecha: hoy() }; });
        resultado.push({ zona: nombre, valor, referencia, ejercicios: culpables.map(e => e.nombre) });
      }
    }
    d.chequeos.push({ fecha: hoy(), codo, rodillas, sesionId: p ? p.sesionId : null });
    d.chequeoPendiente = null;
    guardar();
    return resultado;
  }

  function exportar() {
    return JSON.stringify({ app: 'GYM LAB', exportado: new Date().toISOString(), datos: d }, null, 2);
  }

  function importar(texto) {
    const o = JSON.parse(texto);
    const datos = o && o.datos ? o.datos : o;
    if (!datos || !Array.isArray(datos.sesiones)) throw new Error('El archivo no es una copia de GYM LAB.');
    d = Object.assign(base(), datos);
    d.ajustes = Object.assign(base().ajustes, d.ajustes || {});
    guardar();
  }

  function borrar() {
    d = base();
    guardar();
  }

  return { iniciar, guardar, datos: () => d, fase, avanzar, racha, evaluarChequeo, exportar, importar, borrar, hoy, diasEntre };
})();
