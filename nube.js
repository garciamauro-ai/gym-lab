'use strict';
// Guardado del progreso en GitHub (repo privado). La llave queda solo en este teléfono, aparte de los datos.

const Nube = (() => {
  const CLAVE = 'gymlab.github.v1';
  const REPO = 'garciamauro-ai/gym-lab-datos';
  const RUTA = 'progreso.json';
  const URL_API = `https://api.github.com/repos/${REPO}/contents/${RUTA}`;

  function estado() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; }
  }
  function poner(cambios) {
    localStorage.setItem(CLAVE, JSON.stringify(Object.assign(estado(), cambios)));
  }

  function cabeceras(extra = {}) {
    return Object.assign({
      Authorization: `Bearer ${estado().token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, extra);
  }

  function aBase64(texto) {
    const bytes = new TextEncoder().encode(texto);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function error(res) {
    if (res.status === 401) return new Error('La llave no sirve o venció.');
    if (res.status === 403 || res.status === 404) return new Error('La llave no tiene permiso sobre gym-lab-datos.');
    return new Error(`GitHub respondió ${res.status}.`);
  }

  async function probar(token) {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    });
    if (!res.ok) throw error(res);
  }

  async function shaActual() {
    const res = await fetch(URL_API, { headers: cabeceras(), cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw error(res);
    return (await res.json()).sha;
  }

  async function subir() {
    const sha = await shaActual();
    const cuerpo = { message: `Progreso ${Registro.hoy()}`, content: aBase64(Registro.exportar()) };
    if (sha) cuerpo.sha = sha;
    const res = await fetch(URL_API, { method: 'PUT', headers: cabeceras({ 'Content-Type': 'application/json' }), body: JSON.stringify(cuerpo) });
    if (!res.ok) { poner({ pendiente: true }); throw error(res); }
    poner({ pendiente: false, ultima: new Date().toISOString() });
  }

  async function bajar() {
    const res = await fetch(URL_API, { headers: cabeceras({ Accept: 'application/vnd.github.raw+json' }), cache: 'no-store' });
    if (res.status === 404) throw new Error('Todavía no hay progreso guardado en GitHub.');
    if (!res.ok) throw error(res);
    return res.text();
  }

  // Al terminar una sesión: intenta subir y si no hay señal queda pendiente para la próxima vez que abras la app.
  async function subirSiHay() {
    if (!activa()) return false;
    try { await subir(); return true; } catch (e) { poner({ pendiente: true }); return false; }
  }

  function activa() { return !!estado().token; }

  return {
    activa, estado, probar, subir, bajar, subirSiHay,
    guardarLlave: token => poner({ token }),
    quitarLlave: () => localStorage.removeItem(CLAVE)
  };
})();
