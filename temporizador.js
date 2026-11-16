'use strict';
// Cuenta regresiva basada en el reloj (no se atrasa si el teléfono se pone lento)
// y marcador de ritmo (bajar, pausa, subir).

class Cuenta {
  constructor({ segundos, alTic = () => {}, alAviso = () => {}, alFin = () => {}, avisoEn = 3 }) {
    this.total = segundos;
    this.restante = segundos;
    this.alTic = alTic;
    this.alAviso = alAviso;
    this.alFin = alFin;
    this.avisoEn = avisoEn;
    this.corriendo = false;
    this.ultimo = null;
    this.intervalo = null;
    this.fin = 0;
  }

  iniciar() {
    if (this.corriendo) return;
    this.corriendo = true;
    this.fin = performance.now() + this.restante * 1000;
    this._paso();
    this.intervalo = setInterval(() => this._paso(), 100);
  }

  _paso() {
    if (!this.corriendo) return;
    this.restante = Math.max(0, (this.fin - performance.now()) / 1000);
    const entero = Math.ceil(this.restante);
    if (entero !== this.ultimo) {
      this.ultimo = entero;
      this.alTic(entero, this);
      if (entero > 0 && entero <= this.avisoEn) this.alAviso(entero, this);
    }
    if (this.restante <= 0) {
      this.detener();
      this.alFin(this);
    }
  }

  pausar() {
    if (!this.corriendo) return;
    this.restante = Math.max(0, (this.fin - performance.now()) / 1000);
    this.corriendo = false;
    clearInterval(this.intervalo);
  }

  reanudar() { this.iniciar(); }

  sumar(seg) {
    this.total += seg;
    if (this.corriendo) this.fin += seg * 1000;
    else this.restante += seg;
    this.ultimo = null;
    if (this.corriendo) this._paso();
  }

  detener() {
    this.corriendo = false;
    clearInterval(this.intervalo);
  }

  transcurrido() {
    const rest = this.corriendo ? Math.max(0, (this.fin - performance.now()) / 1000) : this.restante;
    return Math.max(0, this.total - rest);
  }
}

class Ritmo {
  // pasos: [{ paso: 'bajar'|'pausa'|'subir', s: segundos, dice?: texto }]
  constructor(pasos, { alPaso = () => {}, alSegundo = () => {}, alCiclo = () => {} } = {}) {
    this.pasos = pasos;
    this.alPaso = alPaso;
    this.alSegundo = alSegundo;
    this.alCiclo = alCiclo;
    this.i = 0;
    this.activo = false;
    this.cuenta = null;
  }

  iniciar() {
    this.activo = true;
    this.i = 0;
    this._empezar();
  }

  _empezar() {
    if (!this.activo) return;
    const p = this.pasos[this.i];
    this.alPaso(p, this.i);
    this.cuenta = new Cuenta({
      segundos: p.s,
      avisoEn: 0,
      alTic: r => { if (r > 0) this.alSegundo(p, r); },
      alFin: () => {
        this.i++;
        if (this.i >= this.pasos.length) {
          this.i = 0;
          this.alCiclo();
        }
        this._empezar();
      }
    });
    this.cuenta.iniciar();
  }

  detener() {
    this.activo = false;
    if (this.cuenta) this.cuenta.detener();
  }
}
