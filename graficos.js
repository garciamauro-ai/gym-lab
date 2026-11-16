'use strict';
// Gráficos de líneas simples en SVG, sin bibliotecas.

const Graficos = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const redondo = v => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

  // etiquetas: textos del eje horizontal
  // series: [{ nombre, color, valores: [número|null], coloresPunto?: [color], discontinua? }]
  function lineas({ etiquetas, series, yMin = 0, yMax = null, alto = 210, leyendaExtra = '' }) {
    const todos = series.flatMap(s => s.valores.filter(v => v != null));
    if (!todos.length) return '<p class="vacio">Todavía no hay datos.</p>';
    const W = 340, H = alto;
    const m = { l: 34, r: 14, t: 14, b: 30 };
    let max = yMax != null ? yMax : Math.max(...todos);
    if (yMax == null) max = Math.ceil(max * 1.1);
    if (max <= yMin) max = yMin + 1;
    const n = etiquetas.length;
    const x = i => m.l + (n === 1 ? (W - m.l - m.r) / 2 : i * (W - m.l - m.r) / (n - 1));
    const y = v => H - m.b - (v - yMin) / (max - yMin) * (H - m.t - m.b);

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Gráfico">`;
    for (let k = 0; k <= 4; k++) {
      const v = yMin + (max - yMin) * k / 4;
      const yy = y(v).toFixed(1);
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" class="g-grilla"/>`;
      svg += `<text x="${m.l - 6}" y="${(+yy + 4).toFixed(1)}" class="g-eje" text-anchor="end">${redondo(v)}</text>`;
    }
    const paso = Math.max(1, Math.ceil(n / 6));
    etiquetas.forEach((e, i) => {
      if (i % paso === 0 || i === n - 1) {
        svg += `<text x="${x(i).toFixed(1)}" y="${H - 9}" class="g-eje" text-anchor="middle">${esc(e)}</text>`;
      }
    });
    series.forEach(s => {
      const pts = s.valores.map((v, i) => (v == null ? null : [x(i), y(v)]));
      let ruta = '';
      let lapiz = false;
      pts.forEach(p => {
        if (!p) { lapiz = false; return; }
        ruta += `${lapiz ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)} `;
        lapiz = true;
      });
      svg += `<path d="${ruta}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"${s.discontinua ? ' stroke-dasharray="5 4"' : ''}/>`;
      pts.forEach((p, i) => {
        if (!p) return;
        const c = (s.coloresPunto && s.coloresPunto[i]) || s.color;
        svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" fill="${c}" stroke="#0d0f12" stroke-width="1.5"/>`;
      });
    });
    svg += '</svg>';

    const leyenda = series.length > 1 || leyendaExtra
      ? `<div class="leyenda">${series.length > 1 ? series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.nombre)}</span>`).join('') : ''}${leyendaExtra}</div>`
      : '';
    return svg + leyenda;
  }

  return { lineas };
})();
