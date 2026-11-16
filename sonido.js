'use strict';
// Sonidos generados con WebAudio (sin archivos) y vibración.

const Sonido = (() => {
  let ctx = null;
  let activo = true;
  let vibracion = true;

  function contexto() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tono(freq, dur, { tipo = 'sine', vol = 0.35, hasta = null, demora = 0 } = {}) {
    if (!activo) return;
    const c = contexto();
    if (!c) return;
    const t0 = c.currentTime + demora;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t0);
    if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  function vibrar(patron) {
    if (vibracion && navigator.vibrate) {
      try { navigator.vibrate(patron); } catch (e) { /* sin vibración */ }
    }
  }

  return {
    desbloquear() { if (activo) contexto(); },
    configurar({ sonido = true, vibracion: vib = true } = {}) { activo = sonido; vibracion = vib; },
    vibrar,

    // Toque de contador
    toque() { tono(620, 0.05, { vol: 0.15 }); },
    // Cuenta de preparación
    tic() { tono(740, 0.07, { tipo: 'square', vol: 0.18 }); },
    // Últimos 3 segundos
    aviso() { tono(988, 0.14, { tipo: 'square', vol: 0.28 }); vibrar(60); },
    // Fin de un tiempo de trabajo
    fin() {
      tono(660, 0.16);
      tono(880, 0.16, { demora: 0.18 });
      tono(1320, 0.45, { demora: 0.36 });
      vibrar([200, 100, 200]);
    },
    // Ritmo: bajar (tono que cae), subir (tono que sube), pausa (doble golpe)
    bajar() { tono(720, 0.4, { tipo: 'triangle', hasta: 280, vol: 0.4 }); },
    subir() { tono(300, 0.28, { tipo: 'triangle', hasta: 820, vol: 0.4 }); },
    pausa() {
      tono(520, 0.1, { tipo: 'square', vol: 0.22 });
      tono(520, 0.1, { tipo: 'square', vol: 0.22, demora: 0.16 });
    },
    // Cambio de lado
    cambio() {
      tono(440, 0.12, { tipo: 'square', vol: 0.25 });
      tono(660, 0.12, { tipo: 'square', vol: 0.25, demora: 0.15 });
      tono(440, 0.12, { tipo: 'square', vol: 0.25, demora: 0.3 });
      vibrar([100, 80, 100, 80, 100]);
    },
    // Fin del descanso
    finDescanso() {
      tono(880, 0.28);
      tono(880, 0.28, { demora: 0.38 });
      tono(1175, 0.6, { demora: 0.76 });
      vibrar([400, 150, 400]);
    }
  };
})();
