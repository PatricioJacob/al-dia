// =====================================================================
// Acciones sobre tareas y eventos (lo que pasa al tocar cosas)
// =====================================================================

import { almacen } from './datos.js';
import { parsear } from './parser.js';
import { toast, vibrar } from './ui.js';
import {
  finDia, inicioDia, sumarDias, sumarMinutos, siguienteRepeticion, fechaCorta, tieneHora,
} from './fechas.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Aviso por defecto para una tarea según su fecha */
export function avisoPara(fecha, conHora) {
  if (!fecha) return null;
  if (conHora) return iso(fecha);
  // Solo día, sin hora: avisar a las 9:00 de ese día (si no pasó)
  const nueve = new Date(fecha); nueve.setHours(9, 0, 0, 0);
  return nueve > new Date() ? iso(nueve) : null;
}

/** Captura rápida: texto libre -> tarea (o evento) guardada */
export async function crearDesdeTexto(texto, tipo = 'tarea') {
  const r = parsear(texto);
  if (tipo === 'evento') {
    const inicio = r.fecha ?? (() => { const d = new Date(); d.setMinutes(0, 0, 0); return sumarMinutos(d, 60); })();
    const conHora = r.conHora || !r.fecha;
    return almacen.guardar({
      tipo: 'evento', titulo: r.titulo, urgente: r.urgente,
      fecha: iso(inicio), fin: conHora ? iso(sumarMinutos(inicio, 60)) : null,
      aviso: conHora ? iso(sumarMinutos(inicio, -30)) : null, repeticion: null,
    });
  }
  return almacen.guardar({
    tipo: 'tarea', titulo: r.titulo, urgente: r.urgente,
    fecha: iso(r.fecha), aviso: avisoPara(r.fecha, r.conHora), repeticion: r.repeticion,
  });
}

/** Marcar como hecha. Si se repite, salta a la próxima vez en lugar de borrarse. */
export async function completar(id) {
  const it = almacen.obtener(id);
  if (!it) return;
  vibrar(12);
  const antes = { ...it };

  if (it.repeticion && (it.fecha || it.aviso)) {
    const base = new Date(it.fecha ?? it.aviso);
    const prox = siguienteRepeticion(base, it.repeticion);
    const delta = prox - base;
    await almacen.actualizar(id, {
      fecha: it.fecha ? iso(prox) : null,
      aviso: it.aviso ? iso(new Date(new Date(it.aviso).getTime() + delta)) : null,
    });
    toast(`Lista · vuelve ${fechaCorta(prox, tieneHora(prox)).toLowerCase()}`, {
      accion: 'Deshacer', alAccion: () => almacen.guardar(antes),
    });
    return;
  }

  await almacen.actualizar(id, { completada_en: new Date().toISOString() });
  toast('Completada', { accion: 'Deshacer', alAccion: () => almacen.actualizar(id, { completada_en: null }) });
}

/** Mandar a la papelera (7 días) */
export async function borrar(id) {
  const it = almacen.obtener(id);
  if (!it) return;
  await almacen.actualizar(id, { borrada_en: new Date().toISOString() });
  toast(it.tipo === 'evento' ? 'Evento borrado' : 'Tarea borrada', {
    accion: 'Deshacer', alAccion: () => almacen.actualizar(id, { borrada_en: null }),
  });
}

export const restaurar = (id) => almacen.actualizar(id, { borrada_en: null, completada_en: null });

/** Posponer un aviso: minutos o 'manana' (mañana 9:00) */
export async function posponer(id, minutos) {
  const it = almacen.obtener(id);
  if (!it) return;
  let nuevo;
  if (minutos === 'manana') { nuevo = sumarDias(inicioDia(new Date()), 1); nuevo.setHours(9, 0, 0, 0); }
  else nuevo = sumarMinutos(new Date(), minutos);
  const cambios = { aviso: iso(nuevo) };
  // Si la tarea vencía antes del nuevo aviso, movemos también la fecha
  if (it.tipo === 'tarea' && it.fecha && new Date(it.fecha) < nuevo) cambios.fecha = iso(nuevo);
  await almacen.actualizar(id, cambios);
  toast(`Te aviso ${fechaCorta(nuevo).toLowerCase()}`);
}

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------
export const activas = () => almacen.todos().filter((i) => !i.borrada_en && !i.completada_en);
export const tareasActivas = () => activas().filter((i) => i.tipo === 'tarea');
export const eventosActivos = () => activas().filter((i) => i.tipo === 'evento');
export const enPapelera = () => almacen.todos()
  .filter((i) => i.borrada_en || i.completada_en)
  .sort((a, b) => new Date(b.borrada_en ?? b.completada_en) - new Date(a.borrada_en ?? a.completada_en));

/** Momento de referencia de una tarea (aviso o fecha) */
export const momento = (t) => (t.aviso || t.fecha ? new Date(t.aviso ?? t.fecha) : null);

/** Está vencida: su hora pasó (o su día terminó si no tenía hora) */
export function vencida(t, ahora = new Date()) {
  if (t.aviso && new Date(t.aviso) <= ahora) return true;
  if (t.fecha) {
    const f = new Date(t.fecha);
    return tieneHora(f) ? f <= ahora : finDia(f) < ahora;
  }
  return false;
}

/** Arma las secciones de la bandeja */
export function secciones(ahora = new Date()) {
  const finHoy = finDia(ahora);
  const atencion = [];
  const proximas = [];
  const sinFecha = [];
  for (const t of tareasActivas()) {
    const m = momento(t);
    if (!m) (t.urgente ? atencion : sinFecha).push(t);
    else if (m <= finHoy || t.urgente) atencion.push(t);
    else proximas.push(t);
  }
  const porMomento = (a, b) => {
    const ma = momento(a); const mb = momento(b);
    if (vencida(a, ahora) !== vencida(b, ahora)) return vencida(a, ahora) ? -1 : 1;
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
    if (ma && mb) return ma - mb;
    return ma ? -1 : mb ? 1 : new Date(b.creado_en) - new Date(a.creado_en);
  };
  atencion.sort(porMomento);
  proximas.sort(porMomento);
  sinFecha.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));

  const eventosHoy = eventosActivos()
    .filter((e) => e.fecha && inicioDia(e.fecha).getTime() === inicioDia(ahora).getTime())
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  return { atencion, proximas, sinFecha, eventosHoy };
}

/** Todo lo que cae en un día (para el calendario) */
export function delDia(dia) {
  const ini = inicioDia(dia).getTime();
  const enDia = (d) => d && inicioDia(d).getTime() === ini;
  const eventos = eventosActivos().filter((e) => enDia(e.fecha));
  const tareas = tareasActivas().filter((t) => enDia(t.fecha ?? t.aviso));
  const orden = (x) => new Date(x.fecha ?? x.aviso).getTime();
  return [...eventos, ...tareas].sort((a, b) => orden(a) - orden(b));
}
