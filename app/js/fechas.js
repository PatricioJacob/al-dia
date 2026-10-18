// =====================================================================
// Utilidades de fechas (todo en hora local del dispositivo)
// =====================================================================

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const inicioDia = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const finDia = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
export const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sumarMinutos = (d, n) => new Date(new Date(d).getTime() + n * 60000);
export const mismoDia = (a, b) => a && b && inicioDia(a).getTime() === inicioDia(b).getTime();
export const claveDia = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const desdeClave = (k) => { const [a, m, d] = k.split('-').map(Number); return new Date(a, m - 1, d); };

export const hora = (d) => {
  const x = new Date(d);
  return `${x.getHours()}:${String(x.getMinutes()).padStart(2, '0')}`;
};

const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Hoy", "Mañana", "Ayer", "Lun 20 oct" */
export function nombreDia(d, ahora = new Date()) {
  const dif = Math.round((inicioDia(d) - inicioDia(ahora)) / 86400000);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Mañana';
  if (dif === -1) return 'Ayer';
  const x = new Date(d);
  const base = `${capitalizar(DIAS_CORTOS[x.getDay()])} ${x.getDate()} ${MESES_CORTOS[x.getMonth()]}`;
  return x.getFullYear() !== ahora.getFullYear() ? `${base} ${x.getFullYear()}` : base;
}

/** "Hoy, 17:30" · "Mañana" · "Lun 20 oct, 9:00" */
export function fechaCorta(d, conHora = true, ahora = new Date()) {
  if (!d) return '';
  return conHora ? `${nombreDia(d, ahora)}, ${hora(d)}` : nombreDia(d, ahora);
}

/** "Sábado 17 de octubre" */
export function fechaLarga(d) {
  const x = new Date(d);
  return `${capitalizar(DIAS[x.getDay()])} ${x.getDate()} de ${MESES[x.getMonth()]}`;
}

/** Valor para <input type="datetime-local"> */
export function aInputLocal(d) {
  if (!d) return '';
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}
export const aInputFecha = (d) => aInputLocal(d).slice(0, 10);
export const aInputHora = (d) => aInputLocal(d).slice(11, 16);

/** ¿La fecha tiene una hora puesta o es "todo el día" (00:00)? */
export const tieneHora = (d) => { const x = new Date(d); return x.getHours() !== 0 || x.getMinutes() !== 0; };

/** Próxima fecha de una tarea que se repite */
export function siguienteRepeticion(d, rep, ahora = new Date()) {
  let x = new Date(d);
  const avanzar = () => {
    if (rep === 'diaria') x = sumarDias(x, 1);
    else if (rep === 'semanal') x = sumarDias(x, 7);
    else if (rep === 'mensual') {
      const dia = new Date(d).getDate();
      const y = new Date(x); y.setDate(1); y.setMonth(y.getMonth() + 1);
      const ultimo = new Date(y.getFullYear(), y.getMonth() + 1, 0).getDate();
      y.setDate(Math.min(dia, ultimo));
      x = y;
    } else if (rep === 'habiles') {
      do { x = sumarDias(x, 1); } while (x.getDay() === 0 || x.getDay() === 6);
    }
  };
  avanzar();
  // Si quedó en el pasado (la completaste muy tarde), seguir hasta el futuro
  let guardia = 0;
  while (x < ahora && guardia++ < 400) avanzar();
  return x;
}

export const NOMBRE_REPETICION = {
  diaria: 'Todos los días',
  semanal: 'Todas las semanas',
  mensual: 'Todos los meses',
  habiles: 'Días hábiles',
};
