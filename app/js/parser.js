// =====================================================================
// Parser de lenguaje natural en español rioplatense
// "pagar luz mañana 20hs"  ->  { titulo: "Pagar luz", fecha: mañana 20:00, conHora: true }
// =====================================================================

import { sumarDias, sumarMinutos } from './fechas.js';

const DIA_IDX = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MES_IDX = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};
const PALABRA_NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, diez: 10, quince: 15, veinte: 20 };

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Patrones con tildes opcionales
const DIA_RE = '(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)';
const MES_RE = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|sept?iembre|octubre|noviembre|diciembre)';
const B = '(?<![\\p{L}\\d])';   // borde de palabra al inicio (soporta tildes y ñ)
const E = '(?![\\p{L}\\d])';    // borde de palabra al final

const FRANJAS = { manana: 9, mediodia: 12, tarde: 16, noche: 21 };

/**
 * @param {string} texto
 * @param {Date} ahora
 * @returns {{titulo:string, fecha:Date|null, conHora:boolean, urgente:boolean, repeticion:string|null, detectado:string[]}}
 */
export function parsear(texto, ahora = new Date()) {
  let t = ` ${texto} `;
  const detectado = [];
  let dia = null;        // Date (00:00) del día detectado
  let h = null, m = 0;   // hora detectada
  let exacta = null;     // fecha exacta ("en 2 horas")
  let urgente = false;
  let repeticion = null;
  let franja = null;

  const quitar = (re, fn) => {
    t = t.replace(re, (...args) => {
      const r = fn(...args);
      if (r === false) return args[0];
      detectado.push(args[0].trim());
      return ' ';
    });
  };

  // --- Urgente ---------------------------------------------------------
  quitar(new RegExp(`${B}(urgente|!+)(?=\\s|$)`, 'giu'), () => { urgente = true; });
  quitar(/\s!+(?=\s)/g, () => { urgente = true; });

  // --- Repeticiones ----------------------------------------------------
  quitar(new RegExp(`${B}(todos los d[ií]as|cada d[ií]a|diariamente)${E}`, 'giu'), () => { repeticion = 'diaria'; });
  quitar(new RegExp(`${B}(d[ií]as h[aá]biles|de lunes a viernes)${E}`, 'giu'), () => { repeticion = 'habiles'; });
  quitar(new RegExp(`${B}(todas las semanas|cada semana|semanalmente)${E}`, 'giu'), () => { repeticion = 'semanal'; });
  quitar(new RegExp(`${B}(todos los meses|cada mes|mensualmente)${E}`, 'giu'), () => { repeticion = 'mensual'; });
  quitar(new RegExp(`${B}(?:todos los|cada)\\s+${DIA_RE}${E}`, 'giu'), (_, d) => {
    repeticion = 'semanal';
    dia = proximoDiaSemana(DIA_IDX[sinTildes(d.toLowerCase())], ahora);
  });
  quitar(new RegExp(`${B}(?:todos los|cada)\\s+(\\d{1,2})${E}(?:\\s+de cada mes)?`, 'giu'), (_, d) => {
    repeticion = 'mensual';
    dia = proximoDiaDelMes(+d, ahora);
  });

  // --- Relativo exacto: "en 2 horas", "en media hora", "en 3 días" -----
  quitar(new RegExp(`${B}en\\s+media\\s+hora${E}`, 'giu'), () => { exacta = sumarMinutos(ahora, 30); });
  quitar(new RegExp(`${B}en\\s+(\\d+|un|una|dos|tres|cuatro|cinco|diez|quince|veinte)\\s+(minutos?|mins?|horas?|hs|h|d[ií]as?|semanas?)${E}`, 'giu'),
    (_, n, u) => {
      const num = /\d/.test(n) ? +n : PALABRA_NUM[n.toLowerCase()];
      const unidad = sinTildes(u.toLowerCase());
      if (unidad.startsWith('min')) exacta = sumarMinutos(ahora, num);
      else if (unidad.startsWith('h')) exacta = sumarMinutos(ahora, num * 60);
      else if (unidad.startsWith('d')) { dia = sumarDias(inicio(ahora), num); }
      else if (unidad.startsWith('s')) { dia = sumarDias(inicio(ahora), num * 7); }
    });

  // --- Franjas: "a la mañana", "a la tarde", "esta noche", "al mediodía"
  quitar(new RegExp(`${B}(?:a la|por la|de la|esta)\\s+(ma[ñn]ana|tarde|noche)${E}`, 'giu'), (txt, f) => {
    const f2 = sinTildes(f.toLowerCase());
    franja = f2.startsWith('ma') ? 'manana' : f2;
    if (/^\s*esta/i.test(txt)) dia = dia ?? inicio(ahora);
  });
  quitar(new RegExp(`${B}(?:al\\s+)?mediod[ií]a${E}`, 'giu'), () => { franja = 'mediodia'; });

  // --- Días relativos --------------------------------------------------
  quitar(new RegExp(`${B}pasado\\s+ma[ñn]ana${E}`, 'giu'), () => { dia = sumarDias(inicio(ahora), 2); });
  quitar(new RegExp(`${B}ma[ñn]ana${E}`, 'giu'), () => { dia = sumarDias(inicio(ahora), 1); });
  quitar(new RegExp(`${B}hoy${E}`, 'giu'), () => { dia = inicio(ahora); });

  // --- Fechas: "17/10", "17/10/2026", "17 de octubre" -----------------
  quitar(new RegExp(`${B}(?:el\\s+)?(\\d{1,2})\\s+de\\s+${MES_RE}(?:\\s+(?:de\\s+)?(\\d{4}))?${E}`, 'giu'), (_, d, mes, a) => {
    const mi = MES_IDX[sinTildes(mes.toLowerCase())];
    dia = fechaFutura(+d, mi, a ? +a : null, ahora);
  });
  quitar(new RegExp(`${B}(?:el\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?${E}`, 'gu'), (_, d, mes, a) => {
    if (+mes < 1 || +mes > 12 || +d < 1 || +d > 31) return false;
    const anio = a ? (a.length === 2 ? 2000 + +a : +a) : null;
    dia = fechaFutura(+d, +mes - 1, anio, ahora);
  });

  // --- Días de la semana: "el viernes", "el próximo lunes" ------------
  quitar(new RegExp(`${B}(?:el\\s+|este\\s+)?(pr[oó]ximo\\s+)?${DIA_RE}(\\s+que\\s+viene)?${E}`, 'giu'), (_, prox, d, qv) => {
    const idx = DIA_IDX[sinTildes(d.toLowerCase())];
    dia = proximoDiaSemana(idx, ahora);
  });
  quitar(new RegExp(`${B}la\\s+semana\\s+que\\s+viene${E}|${B}la\\s+pr[oó]xima\\s+semana${E}`, 'giu'), () => {
    dia = proximoDiaSemana(1, ahora);
  });

  // --- Horas: "a las 20", "20:30", "20hs", "8pm", "a las 5 de la tarde"
  quitar(new RegExp(`${B}(?:a\\s+las?\\s+|tipo\\s+|para\\s+las\\s+)?(\\d{1,2})[:.](\\d{2})\\s*(?:hs?|horas)?(?:\\s*(am|pm))?${E}`, 'giu'), (_, hh, mm, ap) => {
    if (+hh > 23 || +mm > 59) return false;
    h = ajustarAmPm(+hh, ap); m = +mm;
  });
  quitar(new RegExp(`${B}(\\d{1,2})\\s*(am|pm|hs|h|horas)${E}`, 'giu'), (_, hh, suf) => {
    if (+hh > 23) return false;
    h = ajustarAmPm(+hh, /am|pm/i.test(suf) ? suf : null); m = 0;
  });
  quitar(new RegExp(`${B}(?:a\\s+las|tipo|para\\s+las)\\s+(\\d{1,2})${E}`, 'giu'), (_, hh) => {
    if (+hh > 23) return false;
    h = +hh; m = 0;
  });
  quitar(new RegExp(`${B}a\\s+la\\s+una${E}`, 'giu'), () => { h = 13; m = 0; });

  // --- Combinar --------------------------------------------------------
  let fecha = null;
  let conHora = false;

  if (exacta) {
    fecha = exacta; conHora = true;
  } else {
    if (h !== null) {
      // "a las 5 de la tarde" / "a las 8 de la noche"
      if (franja && ['tarde', 'noche'].includes(franja) && h < 12) h += 12;
      // "a las 5" sin aclarar: entre 1 y 7 casi siempre es de tarde
      else if (!franja && h >= 1 && h <= 7) h += 12;
    } else if (franja) {
      h = FRANJAS[franja]; m = 0;
    }

    if (h !== null) {
      conHora = true;
      const base = dia ?? inicio(ahora);
      fecha = new Date(base); fecha.setHours(h, m, 0, 0);
      // Solo hora y ya pasó -> mañana
      if (!dia && fecha <= ahora) fecha = sumarDias(fecha, 1);
    } else if (dia) {
      fecha = dia;
    }
  }

  // --- Título limpio ---------------------------------------------------
  let titulo = t
    .replace(/\s+/g, ' ')
    .replace(/\s+(el|la|los|las|para|a|de|en|tipo|al|que)\s*$/i, '')
    .replace(/^\s*(el|la|para)\s+/i, '')
    .trim();
  titulo = titulo.replace(/[\s,.;:-]+$/, '').trim();
  if (!titulo) titulo = texto.trim();
  titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);

  return { titulo, fecha, conHora, urgente, repeticion, detectado };
}

// ---------------------------------------------------------------------
function inicio(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// "el viernes" y "el próximo viernes" = el viernes más cercano que viene.
// Dicho el mismo día (un sábado, "el sábado") = el de la semana que viene.
function proximoDiaSemana(idx, ahora) {
  const hoy = inicio(ahora);
  let dif = (idx - hoy.getDay() + 7) % 7;
  if (dif === 0) dif = 7;
  return sumarDias(hoy, dif);
}

function proximoDiaDelMes(d, ahora) {
  const x = inicio(ahora);
  x.setDate(d);
  if (x < inicio(ahora)) x.setMonth(x.getMonth() + 1);
  return x;
}

function fechaFutura(d, mes, anio, ahora) {
  const x = new Date(anio ?? ahora.getFullYear(), mes, d);
  if (!anio && x < inicio(ahora)) x.setFullYear(x.getFullYear() + 1);
  return x;
}

function ajustarAmPm(h, ap) {
  if (!ap) return h;
  ap = ap.toLowerCase();
  if (ap === 'pm' && h < 12) return h + 12;
  if (ap === 'am' && h === 12) return 0;
  return h;
}
