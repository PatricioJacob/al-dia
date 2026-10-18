// =====================================================================
// Vista "Calendario": mes y semana, con panel del día elegido
// =====================================================================

import { el } from './ui.js';
import { delDia, vencida } from './acciones.js';
import {
  MESES, DIAS_CORTOS, inicioDia, sumarDias, mismoDia, fechaLarga, hora, tieneHora, nombreDia,
} from './fechas.js';
import { editarEvento, editarTarea, nuevoEnDia } from './formularios.js';
import { animarYCompletar } from './vista-pendientes.js';

const estado = {
  modo: (() => { try { return localStorage.getItem('aldia.modoCal') || 'mes'; } catch { return 'mes'; } })(),
  ref: inicioDia(new Date()),       // mes/semana visible
  elegido: inicioDia(new Date()),   // día seleccionado
};

let contenedor = null;
const repintar = () => contenedor && renderCalendario(contenedor);

export function irAHoy() {
  estado.ref = inicioDia(new Date());
  estado.elegido = inicioDia(new Date());
  repintar();
}

const lunesDe = (d) => { const x = inicioDia(d); return sumarDias(x, -((x.getDay() + 6) % 7)); };

export function renderCalendario(cont) {
  contenedor = cont;
  const hoy = inicioDia(new Date());

  const titulo = estado.modo === 'mes'
    ? `${MESES[estado.ref.getMonth()]} ${estado.ref.getFullYear()}`
    : tituloSemana(lunesDe(estado.ref));

  const mover = (dir) => {
    const r = new Date(estado.ref);
    if (estado.modo === 'mes') { r.setDate(1); r.setMonth(r.getMonth() + dir); } else r.setDate(r.getDate() + 7 * dir);
    estado.ref = r;
    repintar();
  };

  const cambiarModo = (m) => {
    estado.modo = m;
    estado.ref = new Date(estado.elegido);
    try { localStorage.setItem('aldia.modoCal', m); } catch { /* nada */ }
    repintar();
  };

  const barra = el('div.cal-barra', {},
    el('div.cal-nav', {},
      el('button.boton-icono', { type: 'button', 'aria-label': 'Anterior', onclick: () => mover(-1) }, '‹'),
      el('h2.cal-titulo', {}, titulo),
      el('button.boton-icono', { type: 'button', 'aria-label': 'Siguiente', onclick: () => mover(1) }, '›'),
    ),
    el('div.cal-acciones', {},
      el('button.boton-suave', { type: 'button', onclick: irAHoy }, 'Hoy'),
      el('div.segmentado', { role: 'tablist' },
        el(`button${estado.modo === 'mes' ? '.activo' : ''}`, { type: 'button', role: 'tab', onclick: () => cambiarModo('mes') }, 'Mes'),
        el(`button${estado.modo === 'semana' ? '.activo' : ''}`, { type: 'button', role: 'tab', onclick: () => cambiarModo('semana') }, 'Semana'),
      ),
    ),
  );

  const cuerpo = estado.modo === 'mes' ? grillaMes(hoy) : grillaSemana(hoy);
  cont.replaceChildren(el(`div.cal.modo-${estado.modo}`, {},
    el('div.cal-principal', {}, barra, cuerpo),
    panelDia(estado.elegido),
  ));
}

function tituloSemana(lunes) {
  const dom = sumarDias(lunes, 6);
  const mesL = MESES[lunes.getMonth()].slice(0, 3);
  const mesD = MESES[dom.getMonth()].slice(0, 3);
  return lunes.getMonth() === dom.getMonth()
    ? `${lunes.getDate()} – ${dom.getDate()} ${mesD}`
    : `${lunes.getDate()} ${mesL} – ${dom.getDate()} ${mesD}`;
}

function elegirDia(d) {
  if (mismoDia(d, estado.elegido)) { nuevoEnDia(d); return; } // segundo toque = añadir
  estado.elegido = inicioDia(d);
  repintar();
  // En el celular, bajar suave hasta el panel del día
  if (matchMedia('(max-width: 899px)').matches) {
    document.querySelector('.cal-dia')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ---------------------------------------------------------------------
function grillaMes(hoy) {
  const primero = new Date(estado.ref.getFullYear(), estado.ref.getMonth(), 1);
  const inicio = lunesDe(primero);
  const cabecera = el('div.cal-semana-nombres', {},
    [1, 2, 3, 4, 5, 6, 0].map((i) => el('span', {}, DIAS_CORTOS[i])));
  const grilla = el('div.cal-grilla', { role: 'grid' });

  for (let i = 0; i < 42; i++) {
    const d = sumarDias(inicio, i);
    if (i === 35 && d.getMonth() !== primero.getMonth()) break; // 5 semanas alcanzan
    const items = delDia(d);
    const fuera = d.getMonth() !== primero.getMonth();
    const clases = [
      'cal-celda', fuera && 'fuera', mismoDia(d, hoy) && 'hoy', mismoDia(d, estado.elegido) && 'elegido',
    ].filter(Boolean).join('.');

    grilla.append(el(`button.${clases}`, {
      type: 'button', role: 'gridcell',
      'aria-label': `${fechaLarga(d)}${items.length ? `, ${items.length} cosas` : ''}`,
      onclick: () => elegirDia(d),
    },
    el('span.cal-num', {}, d.getDate()),
    // Celular: puntitos de color
    items.length > 0 && el('span.puntos', { 'aria-hidden': 'true' },
      items.slice(0, 3).map((it) => el(`span.punto.${claseItem(it)}`))),
    // PC: etiquetas cortas
    items.length > 0 && el('span.cal-etiquetas', { 'aria-hidden': 'true' },
      items.slice(0, 3).map((it) => el(`span.cal-etiqueta.${claseItem(it)}`, {},
        it.tipo === 'evento' && tieneHora(new Date(it.fecha)) ? `${hora(it.fecha)} ${it.titulo}` : it.titulo)),
      items.length > 3 && el('span.cal-mas', {}, `+${items.length - 3} más`)),
    ));
  }
  return el('div.cal-mes', {}, cabecera, grilla);
}

function grillaSemana(hoy) {
  const lunes = lunesDe(estado.ref);
  const cols = el('div.cal-semana');
  for (let i = 0; i < 7; i++) {
    const d = sumarDias(lunes, i);
    const items = delDia(d);
    cols.append(el(`div.cal-col${mismoDia(d, hoy) ? '.hoy' : ''}${mismoDia(d, estado.elegido) ? '.elegido' : ''}`, {},
      el('button.cal-col-cabecera', { type: 'button', onclick: () => elegirDia(d) },
        el('span.cal-col-dia', {}, DIAS_CORTOS[d.getDay()]),
        el('span.cal-col-num', {}, d.getDate()),
      ),
      el('div.cal-col-items', {},
        items.length ? items.map((it) => miniItem(it)) : el('span.cal-col-vacio', {}, '—'),
        el('button.cal-col-sumar', { type: 'button', 'aria-label': `Añadir el ${fechaLarga(d)}`, onclick: () => nuevoEnDia(d) }, '+'),
      ),
    ));
  }
  return cols;
}

function miniItem(it) {
  const conH = tieneHora(new Date(it.fecha ?? it.aviso));
  return el(`button.mini.${claseItem(it)}`, {
    type: 'button', onclick: () => (it.tipo === 'evento' ? editarEvento(it.id) : editarTarea(it.id)),
  },
  conH && el('span.mini-hora', {}, hora(it.fecha ?? it.aviso)),
  el('span.mini-titulo', {}, it.titulo));
}

const claseItem = (it) => (it.tipo === 'evento' ? 'evento' : it.urgente ? 'urgente' : 'tarea');

// ---------------------------------------------------------------------
function panelDia(d) {
  const items = delDia(d);
  const ahora = new Date();
  const titulo = `${['Hoy', 'Mañana', 'Ayer'].includes(nombreDia(d)) ? nombreDia(d) + ' · ' : ''}${fechaLarga(d)}`;

  const lista = el('ul.dia-lista', {}, items.map((it) => {
    if (it.tipo === 'evento') {
      const conH = tieneHora(new Date(it.fecha));
      return el('li.dia-item.evento', {},
        el('span.dia-marca.evento', { 'aria-hidden': 'true' }),
        el('button.dia-cuerpo', { type: 'button', onclick: () => editarEvento(it.id) },
          el('span.dia-hora', {}, conH ? `${hora(it.fecha)}${it.fin ? ' – ' + hora(it.fin) : ''}` : 'Todo el día'),
          el('span.dia-titulo', {}, it.titulo),
          it.nota && el('span.dia-nota', {}, it.nota),
        ));
    }
    const m = new Date(it.aviso ?? it.fecha);
    const li = el(`li.dia-item.tarea${it.urgente ? '.urgente' : ''}${vencida(it, ahora) ? '.es-vencida' : ''}`, { dataset: { id: it.id } },
      el('button.check', {
        type: 'button', 'aria-label': `Completar: ${it.titulo}`,
        onclick: () => animarYCompletar(li, it.id),
      }, el('span.check-marca', { 'aria-hidden': 'true' })),
      el('button.dia-cuerpo', { type: 'button', onclick: () => editarTarea(it.id) },
        el('span.dia-hora', {}, tieneHora(m) || it.aviso ? `${hora(m)} · Tarea` : 'Tarea'),
        el('span.dia-titulo', {}, it.titulo),
      ));
    return li;
  }));

  return el('aside.cal-dia', { 'aria-label': 'Detalle del día' },
    el('h3.dia-titulo-fecha', {}, titulo),
    items.length ? lista : el('p.dia-vacio', {}, 'Nada anotado este día.'),
    el('button.boton-agregar-dia', { type: 'button', onclick: () => nuevoEnDia(d) }, '+ Añadir evento o tarea en este día'),
  );
}
