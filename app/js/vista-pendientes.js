// =====================================================================
// Vista "Pendientes": atención inmediata, próximas y sin fecha
// =====================================================================

import { el } from './ui.js';
import { secciones, completar, vencida, momento, enPapelera } from './acciones.js';
import { fechaCorta, hora, tieneHora, NOMBRE_REPETICION } from './fechas.js';
import { editarTarea, editarEvento, abrirPapelera } from './formularios.js';

export function renderPendientes(cont) {
  const ahora = new Date();
  const { atencion, proximas, sinFecha, eventosHoy } = secciones(ahora);
  cont.replaceChildren();

  const vacio = !atencion.length && !proximas.length && !sinFecha.length;

  // --- Atención inmediata -------------------------------------------
  if (atencion.length || eventosHoy.length) {
    const nVencidas = atencion.filter((t) => vencida(t, ahora)).length;
    cont.append(el('section.seccion.atencion', {},
      el('header.seccion-cabecera', {},
        el('h2', {}, 'Atención inmediata'),
        el('span.contador', {}, nVencidas ? `${nVencidas} vencida${nVencidas > 1 ? 's' : ''}` : `${atencion.length} para hoy`),
      ),
      eventosHoy.length > 0 && el('div.eventos-hoy', {}, eventosHoy.map(filaEventoHoy)),
      el('ul.lista', {}, atencion.map((t) => filaTarea(t, ahora))),
    ));
  }

  if (vacio) {
    cont.append(el('div.vacio', {},
      el('div.vacio-icono', { 'aria-hidden': 'true' }, '✓'),
      el('p.vacio-titulo', {}, 'Todo al día'),
      el('p.vacio-texto', {}, 'Cuando te acuerdes de algo, anotalo. Probá: "pagar la luz mañana 20hs".'),
    ));
  }

  if (proximas.length) {
    cont.append(el('section.seccion', {},
      el('header.seccion-cabecera', {}, el('h2', {}, 'Próximas'), el('span.contador', {}, proximas.length)),
      el('ul.lista', {}, proximas.map((t) => filaTarea(t, ahora))),
    ));
  }

  if (sinFecha.length) {
    cont.append(el('section.seccion', {},
      el('header.seccion-cabecera', {}, el('h2', {}, 'Sin fecha'), el('span.contador', {}, sinFecha.length)),
      el('ul.lista', {}, sinFecha.map((t) => filaTarea(t, ahora))),
    ));
  }

  const nPapelera = enPapelera().length;
  if (nPapelera) {
    cont.append(el('button.enlace-papelera', { type: 'button', onclick: abrirPapelera },
      `Completadas y borradas · ${nPapelera}`));
  }
}

// ---------------------------------------------------------------------
export function filaTarea(t, ahora = new Date()) {
  const m = momento(t);
  const venc = vencida(t, ahora);
  const meta = [];
  if (m) {
    const conH = t.aviso ? true : tieneHora(m);
    meta.push(el(`span.dato${venc ? '.vencido' : ''}`, {},
      el('span.icono', { 'aria-hidden': 'true' }, t.aviso ? '🔔' : '📅'),
      `${venc ? 'Vencida · ' : ''}${fechaCorta(m, conH, ahora)}`));
  }
  if (t.repeticion) meta.push(el('span.dato', {}, el('span.icono', { 'aria-hidden': 'true' }, '↻'), NOMBRE_REPETICION[t.repeticion]));
  if (t.nota) meta.push(el('span.dato.nota-indicador', { title: t.nota }, '✎ Nota'));

  const li = el(`li.tarea${t.urgente ? '.urgente' : ''}${venc ? '.es-vencida' : ''}`, { dataset: { id: t.id } },
    el('button.check', {
      type: 'button',
      'aria-label': `Completar: ${t.titulo}`,
      onclick: (e) => { e.stopPropagation(); animarYCompletar(li, t.id); },
    }, el('span.check-marca', { 'aria-hidden': 'true' })),
    el('button.tarea-cuerpo', { type: 'button', onclick: () => editarTarea(t.id) },
      el('span.tarea-titulo', {}, t.titulo),
      (meta.length || t.urgente) && el('span.tarea-meta', {}, meta, t.urgente && el('span.etiqueta-urgente', {}, 'Urgente')),
    ),
  );
  return li;
}

function filaEventoHoy(e) {
  const conH = tieneHora(new Date(e.fecha));
  return el('button.evento-hoy', { type: 'button', onclick: () => editarEvento(e.id) },
    el('span.evento-hora', {}, conH ? `${hora(e.fecha)}${e.fin ? ' – ' + hora(e.fin) : ''}` : 'Todo el día'),
    el('span.evento-titulo', {}, e.titulo),
  );
}

/** Verde medio segundo → tachado → se desvanece → se borra */
export function animarYCompletar(li, id) {
  if (li.classList.contains('completando')) return;
  li.classList.add('completando');
  setTimeout(() => {
    li.style.height = `${li.offsetHeight}px`;
    requestAnimationFrame(() => li.classList.add('saliendo'));
  }, 480);
  setTimeout(() => completar(id), 820);
}
