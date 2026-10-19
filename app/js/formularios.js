// =====================================================================
// Formularios: captura rápida, editar tarea/evento, posponer,
// papelera y ajustes
// =====================================================================

import { el, abrirHoja, cerrarHoja, grupoChips, toast, aplicarTema, temaGuardado } from './ui.js';
import {
  almacen, hayNube, usuarioActual, cerrarSesion, nombreUsuario, guardarNombre,
} from './datos.js';
import { parsear } from './parser.js';
import {
  crearDesdeTexto, avisoPara, completar, borrar, posponer, restaurar, enPapelera,
} from './acciones.js';
import {
  fechaCorta, fechaLarga, aInputFecha, aInputHora, tieneHora, sumarDias, sumarMinutos, inicioDia,
  NOMBRE_REPETICION,
} from './fechas.js';
import {
  activarNotificaciones, permiso, esIOS, esInstalada, sonar,
} from './notificaciones.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

// Aviso anticipado: además del aviso a la hora, uno de 1 a 7 días antes
function selectorAnticipo(valor) {
  const s = el('select.campo', { 'aria-label': 'Avisarme antes' },
    el('option', { value: '' }, 'Sin aviso anticipado'),
    [1, 2, 3, 4, 5, 6, 7].map((n) => el('option', { value: String(n) }, n === 1 ? '1 día antes' : `${n} días antes`)));
  s.value = valor ? String(valor) : '';
  s.dias = () => (s.value ? Number(s.value) : null);
  return s;
}

// =====================================================================
// Captura rápida (barra de arriba en PC, hoja en el celular)
// =====================================================================
export function crearCaptura({ enHoja = false } = {}) {
  let tipo = 'tarea';
  const input = el('input.captura-input', {
    type: 'text', placeholder: enHoja ? '¿Qué no querés olvidarte?' : '¿Qué no querés olvidarte?  (tecla N)',
    'aria-label': 'Anotar algo nuevo', autocomplete: 'off', enterkeyhint: 'done', maxlength: '300',
    autofocus: enHoja || null,
  });
  const vista = el('div.captura-vista', { 'aria-live': 'polite' });
  const seg = el('div.segmentado.chico', { role: 'tablist' },
    el('button.activo', { type: 'button', dataset: { t: 'tarea' }, onclick: () => cambiarTipo('tarea') }, 'Tarea'),
    el('button', { type: 'button', dataset: { t: 'evento' }, onclick: () => cambiarTipo('evento') }, 'Evento'),
  );
  const boton = el('button.boton-primario.captura-boton', { type: 'submit', 'aria-label': 'Guardar' }, enHoja ? 'Guardar' : '↵');

  function cambiarTipo(t) {
    tipo = t;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.t === t));
    actualizarVista();
    input.focus();
  }

  function actualizarVista() {
    const txt = input.value.trim();
    vista.replaceChildren();
    if (!txt) {
      if (enHoja) vista.append(el('span.pista', {}, 'Ej: "pagar la luz mañana 20hs", "turno el viernes a las 10", "regar plantas cada semana"'));
      form.classList.remove('con-texto');
      return;
    }
    form.classList.add('con-texto');
    const r = parsear(txt);
    if (r.fecha) vista.append(el('span.chip-info', {}, `${tipo === 'evento' ? '📅' : '🔔'} ${fechaCorta(r.fecha, r.conHora)}`));
    if (r.repeticion && tipo === 'tarea') vista.append(el('span.chip-info', {}, `↻ ${NOMBRE_REPETICION[r.repeticion]}`));
    if (r.urgente) vista.append(el('span.chip-info.urgente', {}, 'Urgente'));
    if (!r.fecha && !r.urgente && !r.repeticion) vista.append(el('span.pista', {}, tipo === 'evento' ? 'Sin hora: lo pongo en la próxima hora' : 'Sin fecha · podés escribir "mañana 9hs"'));
  }

  const form = el(`form.captura${enHoja ? '.en-hoja' : ''}`, {
    onsubmit: async (e) => {
      e.preventDefault();
      const txt = input.value.trim();
      if (!txt) { input.focus(); return; }
      const nuevo = await crearDesdeTexto(txt, tipo);
      input.value = '';
      actualizarVista();
      const cuando = nuevo.aviso || nuevo.fecha;
      toast(cuando ? `Anotado · ${fechaCorta(cuando, nuevo.aviso ? true : tieneHora(new Date(cuando))).toLowerCase()}` : 'Anotado', {
        accion: 'Editar', alAccion: () => (nuevo.tipo === 'evento' ? editarEvento(nuevo.id) : editarTarea(nuevo.id)), duracion: 3500,
      });
      if (enHoja) cerrarHoja(); else input.focus();
    },
  },
  el('div.captura-fila', {}, el('span.captura-mas', { 'aria-hidden': 'true' }, '+'), input, boton),
  el('div.captura-extra', {}, seg, vista));

  input.addEventListener('input', actualizarVista);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; actualizarVista(); input.blur(); } });
  actualizarVista();
  form.enfocar = () => input.focus();
  return form;
}

export function abrirCapturaMovil() {
  abrirHoja(crearCaptura({ enHoja: true }), { titulo: 'Anotar', clase: 'hoja-captura' });
}

// =====================================================================
// Tarea
// =====================================================================
function formTarea(id, diaInicial) {
  const it = id ? almacen.obtener(id) : null;
  const ref = it ? (it.fecha ?? it.aviso) : null;
  const st = {
    fecha: ref ? new Date(ref) : diaInicial ? new Date(diaInicial) : null,
    conHora: it ? Boolean(it.aviso) || (ref && tieneHora(new Date(ref))) : false,
    avisar: it ? Boolean(it.aviso) : true,
    tocado: false,
  };
  if (diaInicial && !it) { st.fecha.setHours(9, 0, 0, 0); st.conHora = true; }

  const titulo = el('input.campo', { type: 'text', value: it?.titulo ?? '', placeholder: 'Qué hay que hacer', 'aria-label': 'Título', maxlength: '300', autofocus: !it || null });
  const nota = el('textarea.campo', { rows: 2, placeholder: 'Nota (opcional)', 'aria-label': 'Nota' });
  nota.value = it?.nota ?? '';
  const urgente = interruptor('Urgente', it?.urgente ?? false);
  const avisar = interruptor('Avisarme', st.avisar, (v) => { st.avisar = v; st.tocado = true; });
  const repetir = el('select.campo', { 'aria-label': 'Repetir' },
    el('option', { value: '' }, 'No se repite'),
    Object.entries(NOMBRE_REPETICION).map(([v, t]) => el('option', { value: v }, t)));
  repetir.value = it?.repeticion ?? '';
  const anticipo = selectorAnticipo(it?.anticipo_dias);

  // --- Cuándo -------------------------------------------------------
  const resumen = el('div.cuando-resumen');
  const inFecha = el('input.campo', { type: 'date', 'aria-label': 'Fecha' });
  const inHora = el('input.campo', { type: 'time', 'aria-label': 'Hora (opcional)' });
  const elegir = el('div.cuando-elegir', { hidden: true }, inFecha, inHora);

  const pintarResumen = () => {
    resumen.textContent = st.fecha ? `📅 ${fechaCorta(st.fecha, st.conHora)}` : 'Sin fecha';
    avisar.hidden = !st.fecha;
    anticipo.hidden = !st.fecha;
    inFecha.value = st.fecha ? aInputFecha(st.fecha) : '';
    inHora.value = st.fecha && st.conHora ? aInputHora(st.fecha) : '';
  };
  const fijar = (d, conH) => { st.fecha = d; st.conHora = conH; st.tocado = true; pintarResumen(); };

  const presetHora = (diaOff, h) => { const d = sumarDias(inicioDia(new Date()), diaOff); d.setHours(h, 0, 0, 0); return d; };
  const chips = grupoChips([
    { valor: 'nada', texto: 'Sin fecha' },
    { valor: '1h', texto: 'En 1 hora' },
    { valor: 'hoy20', texto: 'Hoy 20:00' },
    { valor: 'man9', texto: 'Mañana 9:00' },
    { valor: 'otro', texto: 'Elegir…' },
  ], null, (v) => {
    elegir.hidden = v !== 'otro';
    if (v === 'nada') fijar(null, false);
    if (v === '1h') { const d = sumarMinutos(new Date(), 60); d.setSeconds(0, 0); fijar(d, true); }
    if (v === 'hoy20') fijar(presetHora(0, 20), true);
    if (v === 'man9') fijar(presetHora(1, 9), true);
    if (v === 'otro') { if (!st.fecha) fijar(presetHora(1, 9), true); inFecha.focus(); }
  });
  const desdeInputs = () => {
    if (!inFecha.value) return;
    const [a, m, d] = inFecha.value.split('-').map(Number);
    const f = new Date(a, m - 1, d);
    if (inHora.value) { const [hh, mm] = inHora.value.split(':').map(Number); f.setHours(hh, mm, 0, 0); }
    fijar(f, Boolean(inHora.value));
  };
  inFecha.addEventListener('change', desdeInputs);
  inHora.addEventListener('change', desdeInputs);
  pintarResumen();

  const guardar = async () => {
    const t = titulo.value.trim();
    if (!t) { titulo.focus(); titulo.classList.add('error'); return; }
    const datos = {
      tipo: 'tarea', titulo: t, nota: nota.value.trim() || null, urgente: urgente.valor(),
      fecha: st.fecha ? iso(st.conHora ? st.fecha : inicioDia(st.fecha)) : null,
      repeticion: repetir.value || null,
      anticipo_dias: st.fecha ? anticipo.dias() : null,
    };
    if (!it || st.tocado) datos.aviso = st.avisar ? avisoPara(st.fecha, st.conHora) : null;
    if (it) await almacen.actualizar(it.id, datos); else await almacen.guardar(datos);
    cerrarHoja();
    toast(it ? 'Cambios guardados' : 'Tarea anotada', { duracion: 2500 });
  };

  titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } });

  return el('div.form', {},
    titulo,
    el('div.grupo', {}, el('label.etiqueta', {}, 'Cuándo'), resumen, chips, elegir, avisar, anticipo),
    el('div.fila-doble', {}, urgente, el('div.grupo.sin-margen', {}, repetir)),
    nota,
    it?.aviso && el('p.texto-suave', {}, `Aviso programado: ${fechaCorta(it.aviso)}`),
    el('div.botonera', {},
      it && el('button.boton-peligro', { type: 'button', onclick: () => { cerrarHoja(); borrar(it.id); } }, 'Borrar'),
      it && el('button.boton-suave', { type: 'button', onclick: () => { cerrarHoja(); completar(it.id); } }, '✓ Hecha'),
      el('button.boton-primario', { type: 'button', onclick: guardar }, 'Guardar'),
    ),
  );
}

export function editarTarea(id) {
  abrirHoja(formTarea(id), { titulo: 'Tarea' });
}

// =====================================================================
// Evento
// =====================================================================
const AVISOS_EVENTO = [
  { valor: '', texto: 'Sin aviso' },
  { valor: '0', texto: 'Al empezar' },
  { valor: '10', texto: '10 min antes' },
  { valor: '30', texto: '30 min antes' },
  { valor: '60', texto: '1 hora antes' },
  { valor: '1440', texto: '1 día antes' },
];

function formEvento(id, diaInicial) {
  const it = id ? almacen.obtener(id) : null;
  const inicio = it?.fecha ? new Date(it.fecha) : (() => {
    const d = diaInicial ? new Date(diaInicial) : new Date();
    const ahora = new Date();
    d.setHours(diaInicial && !mismoDiaQueHoy(d) ? 10 : Math.min(ahora.getHours() + 1, 23), 0, 0, 0);
    return d;
  })();
  const todoElDiaInicial = it ? !tieneHora(inicio) && !it.fin : false;

  const titulo = el('input.campo', { type: 'text', value: it?.titulo ?? '', placeholder: 'Nombre del evento', 'aria-label': 'Título', maxlength: '300', autofocus: !it || null });
  const inFecha = el('input.campo', { type: 'date', value: aInputFecha(inicio), 'aria-label': 'Fecha' });
  const inIni = el('input.campo', { type: 'time', value: aInputHora(inicio), 'aria-label': 'Hora de inicio' });
  const inFin = el('input.campo', { type: 'time', value: it?.fin ? aInputHora(it.fin) : aInputHora(sumarMinutos(inicio, 60)), 'aria-label': 'Hora de fin' });
  const horas = el('div.fila-doble', {},
    el('label.mini-campo', {}, el('span', {}, 'Empieza'), inIni),
    el('label.mini-campo', {}, el('span', {}, 'Termina'), inFin));
  const todoElDia = interruptor('Todo el día', todoElDiaInicial, (v) => { horas.hidden = v; });
  horas.hidden = todoElDiaInicial;
  const nota = el('textarea.campo', { rows: 2, placeholder: 'Nota breve (opcional)', 'aria-label': 'Nota' });
  nota.value = it?.nota ?? '';

  // Aviso: deducir el que tenía
  let avisoSel = it ? '' : '30';
  if (it?.aviso && it.fecha) {
    const dif = Math.round((new Date(it.fecha) - new Date(it.aviso)) / 60000);
    avisoSel = AVISOS_EVENTO.reduce((mej, o) => (o.valor !== '' && Math.abs(+o.valor - dif) < Math.abs(+mej - dif) ? o.valor : mej), '0');
  }
  const aviso = el('select.campo', { 'aria-label': 'Aviso' }, AVISOS_EVENTO.map((o) => el('option', { value: o.valor }, o.texto)));
  aviso.value = avisoSel;
  const anticipo = selectorAnticipo(it?.anticipo_dias);

  // Si el inicio se mueve, el fin lo acompaña
  inIni.addEventListener('change', () => {
    if (!inIni.value) return;
    const [h, m] = inIni.value.split(':').map(Number);
    const fin = new Date(2000, 0, 1, h, m + 60);
    inFin.value = `${String(fin.getHours()).padStart(2, '0')}:${String(fin.getMinutes()).padStart(2, '0')}`;
  });

  const guardar = async () => {
    const t = titulo.value.trim();
    if (!t) { titulo.focus(); titulo.classList.add('error'); return; }
    if (!inFecha.value) { inFecha.focus(); return; }
    const [a, mo, d] = inFecha.value.split('-').map(Number);
    const ini = new Date(a, mo - 1, d);
    let fin = null;
    if (!todoElDia.valor() && inIni.value) {
      const [h, m] = inIni.value.split(':').map(Number);
      ini.setHours(h, m, 0, 0);
      if (inFin.value) {
        const [h2, m2] = inFin.value.split(':').map(Number);
        fin = new Date(a, mo - 1, d, h2, m2);
        if (fin <= ini) fin = sumarDias(fin, 1); // termina pasada la medianoche
      }
    }
    let av = null;
    if (aviso.value !== '') {
      const base = todoElDia.valor() ? new Date(new Date(ini).setHours(9, 0, 0, 0)) : ini;
      av = sumarMinutos(base, -Number(aviso.value));
    }
    const datos = { tipo: 'evento', titulo: t, nota: nota.value.trim() || null, fecha: iso(ini), fin: iso(fin), aviso: iso(av), repeticion: null, anticipo_dias: anticipo.dias() };
    if (it) await almacen.actualizar(it.id, datos); else await almacen.guardar(datos);
    cerrarHoja();
    toast(it ? 'Evento actualizado' : `Evento anotado · ${fechaLarga(ini).toLowerCase()}`, { duracion: 2500 });
  };
  titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } });

  return el('div.form', {},
    titulo,
    el('div.grupo', {}, el('label.etiqueta', {}, 'Cuándo'), inFecha, todoElDia, horas),
    el('div.grupo', {}, el('label.etiqueta', {}, 'Recordatorio'), aviso, anticipo),
    nota,
    el('div.botonera', {},
      it && el('button.boton-peligro', { type: 'button', onclick: () => { cerrarHoja(); borrar(it.id); } }, 'Borrar'),
      el('button.boton-primario', { type: 'button', onclick: guardar }, 'Guardar'),
    ),
  );
}

const mismoDiaQueHoy = (d) => inicioDia(d).getTime() === inicioDia(new Date()).getTime();

export function editarEvento(id) {
  abrirHoja(formEvento(id), { titulo: 'Evento' });
}

/** Desde el calendario: añadir evento o tarea en un día */
export function nuevoEnDia(dia) {
  const zona = el('div');
  const seg = el('div.segmentado.ancho', { role: 'tablist' });
  const mostrar = (t) => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.t === t));
    zona.replaceChildren(t === 'evento' ? formEvento(null, dia) : formTarea(null, dia));
    zona.querySelector('[autofocus]')?.focus();
  };
  seg.append(
    el('button', { type: 'button', dataset: { t: 'evento' }, onclick: () => mostrar('evento') }, 'Evento'),
    el('button', { type: 'button', dataset: { t: 'tarea' }, onclick: () => mostrar('tarea') }, 'Tarea'),
  );
  abrirHoja(el('div', {}, seg, zona), { titulo: fechaLarga(dia) });
  mostrar('evento');
}

// =====================================================================
// Posponer (cuando tocás una notificación)
// =====================================================================
export function abrirPosponer(id) {
  const it = almacen.obtener(id);
  if (!it || it.completada_en || it.borrada_en) return;
  if (it.tipo === 'evento') { editarEvento(id); return; }
  const accion = (fn) => () => { cerrarHoja(); fn(); };
  abrirHoja(el('div.form', {},
    el('p.posponer-titulo', {}, it.titulo),
    it.aviso && el('p.texto-suave', {}, `Aviso: ${fechaCorta(it.aviso)}`),
    el('button.boton-primario.grande', { type: 'button', onclick: accion(() => completar(id)) }, '✓ Ya está hecha'),
    el('div.posponer-grilla', {},
      el('button.boton-suave', { type: 'button', onclick: accion(() => posponer(id, 10)) }, '+10 min'),
      el('button.boton-suave', { type: 'button', onclick: accion(() => posponer(id, 60)) }, '+1 hora'),
      el('button.boton-suave', { type: 'button', onclick: accion(() => posponer(id, 180)) }, '+3 horas'),
      el('button.boton-suave', { type: 'button', onclick: accion(() => posponer(id, 'manana')) }, 'Mañana 9:00'),
    ),
    el('button.boton-texto', { type: 'button', onclick: () => { cerrarHoja(); setTimeout(() => editarTarea(id), 240); } }, 'Editar tarea'),
  ), { titulo: 'Recordatorio' });
}

// =====================================================================
// Papelera
// =====================================================================
export function abrirPapelera() {
  const lista = el('ul.lista-papelera');
  const pintar = () => {
    const items = enPapelera();
    lista.replaceChildren(...(items.length ? items.map((it) => {
      const cuando = it.borrada_en ?? it.completada_en;
      return el('li.papelera-item', {},
        el('div.papelera-texto', {},
          el('span.papelera-titulo', {}, it.titulo),
          el('span.texto-suave', {}, `${it.completada_en && !it.borrada_en ? 'Completada' : 'Borrada'} · ${fechaCorta(cuando)}`)),
        el('button.boton-suave.chico', { type: 'button', onclick: async () => { await restaurar(it.id); pintar(); toast('Restaurada'); } }, 'Restaurar'),
        el('button.boton-icono.peligro', { type: 'button', 'aria-label': 'Eliminar para siempre', onclick: async () => { await almacen.eliminar(it.id); pintar(); } }, '✕'),
      );
    }) : [el('li.texto-suave', {}, 'Vacía.')]));
  };
  pintar();
  abrirHoja(el('div', {},
    el('p.texto-suave', {}, 'Lo que completás o borrás queda acá 7 días, por si te equivocaste.'),
    lista), { titulo: 'Completadas y borradas' });
}

// =====================================================================
// Nombre (la primera vez, y desde Ajustes)
// =====================================================================
function campoNombre() {
  return el('input.campo', {
    type: 'text', value: nombreUsuario(), placeholder: 'Tu nombre', 'aria-label': 'Tu nombre',
    autocomplete: 'given-name', autocapitalize: 'words', maxlength: '40', enterkeyhint: 'done',
  });
}

export function pedirNombre() {
  const input = campoNombre();
  const guardar = async () => {
    const n = input.value.trim();
    if (!n) { input.focus(); input.classList.add('error'); return; }
    await guardarNombre(n);
    cerrarHoja();
    toast(`¡Hola, ${n}! Ya estamos al día`, { duracion: 3500 });
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } });
  abrirHoja(el('div.form', {},
    el('p.texto-suave', {}, 'Así te saludo y te nombro en los avisos.'),
    input,
    el('div.botonera', {},
      el('button.boton-suave', { type: 'button', onclick: cerrarHoja }, 'Ahora no'),
      el('button.boton-primario', { type: 'button', onclick: guardar }, 'Guardar')),
  ), { titulo: '¿Cómo te llamo?' });
  setTimeout(() => input.focus(), 250);
}

// =====================================================================
// Ajustes
// =====================================================================
export async function abrirAjustes() {
  const estadoNotif = el('p.estado-notif');
  const botonNotif = el('button.boton-primario', { type: 'button' }, 'Activar avisos en este dispositivo');
  const pintarNotif = () => {
    const p = permiso();
    if (p === 'granted') { estadoNotif.textContent = '✓ Avisos activados en este dispositivo'; estadoNotif.className = 'estado-notif ok'; botonNotif.textContent = 'Probar sonido y aviso'; }
    else if (p === 'denied') { estadoNotif.textContent = 'Los avisos están bloqueados. Activálos desde los ajustes del sistema para esta app.'; estadoNotif.className = 'estado-notif mal'; }
    else if (p === 'unsupported') { estadoNotif.textContent = 'Este navegador no soporta avisos.'; estadoNotif.className = 'estado-notif mal'; botonNotif.hidden = true; }
    else { estadoNotif.textContent = 'Los avisos todavía no están activados acá.'; estadoNotif.className = 'estado-notif'; }
  };
  botonNotif.addEventListener('click', async () => {
    try {
      if (permiso() === 'granted') {
        sonar();
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('🔔 Así te van a llegar los avisos', { body: 'Todo listo en este dispositivo.', icon: 'iconos/icono-192.png' });
        return;
      }
      await activarNotificaciones();
      toast('Avisos activados ✓');
    } catch (e) { toast(e.message, { duracion: 7000, tipo: 'error' }); }
    pintarNotif();
  });
  pintarNotif();

  const usuario = await usuarioActual();
  const sonido = interruptor('Sonido al vencer algo (con la app abierta)', leerPref('sonido', true), (v) => guardarPref('sonido', v));
  const nombre = campoNombre();
  nombre.addEventListener('change', async () => {
    const n = nombre.value.trim();
    if (!n || n === nombreUsuario()) { nombre.value = nombreUsuario(); return; }
    await guardarNombre(n);
    toast(`Listo, ${n}`, { duracion: 2000 });
  });

  abrirHoja(el('div.form', {},
    el('div.grupo', {}, el('label.etiqueta', {}, '¿Cómo te llamo?'), nombre),
    el('div.grupo', {}, el('label.etiqueta', {}, 'Apariencia'),
      grupoChips([
        { valor: 'oscuro', texto: '🌙 Oscuro' },
        { valor: 'claro', texto: '☀️ Claro' },
        { valor: 'auto', texto: 'Automático' },
      ], temaGuardado(), aplicarTema),
      el('p.texto-suave', {}, 'Automático sigue el modo del celular o la PC.')),
    el('div.grupo', {}, el('label.etiqueta', {}, 'Avisos'), estadoNotif, botonNotif, sonido),
    esIOS() && !esInstalada() && el('div.caja-ios', {},
      el('strong', {}, 'Instalala en tu iPhone'),
      el('ol', {},
        el('li', {}, 'Abrí esta página en Safari.'),
        el('li', {}, 'Tocá el botón Compartir (el cuadrado con la flecha).'),
        el('li', {}, 'Elegí "Agregar a inicio".'),
        el('li', {}, 'Abrí Al día desde el ícono y activá los avisos.'))),
    el('div.grupo', {}, el('label.etiqueta', {}, 'Cuenta'),
      hayNube()
        ? (usuario
          ? el('div.cuenta', {}, el('span', {}, usuario.email), el('button.boton-suave.chico', { type: 'button', onclick: async () => { cerrarHoja(); await cerrarSesion(); location.reload(); } }, 'Cerrar sesión'))
          : el('p.texto-suave', {}, 'Sin sesión.'))
        : el('p.texto-suave', {}, 'Modo local: lo que anotás se guarda solo en este dispositivo. Configurá Supabase (ver README) para sincronizar PC y celular.')),
    el('div.grupo', {}, el('label.etiqueta', {}, 'Atajos en la PC'),
      el('p.texto-suave', {}, 'N o / anotar · 1 Pendientes · 2 Calendario · Esc cerrar')),
    el('p.texto-suave.version', {}, 'Al día · v4'),
  ), { titulo: 'Ajustes' });
}

// ---------------------------------------------------------------------
export function leerPref(k, def) { try { const v = localStorage.getItem('aldia.pref.' + k); return v === null ? def : JSON.parse(v); } catch { return def; } }
function guardarPref(k, v) { try { localStorage.setItem('aldia.pref.' + k, JSON.stringify(v)); } catch { /* nada */ } }

function interruptor(texto, valorInicial, alCambiar) {
  const input = el('input', { type: 'checkbox', role: 'switch' });
  input.checked = Boolean(valorInicial);
  input.addEventListener('change', () => alCambiar?.(input.checked));
  const nodo = el('label.interruptor', {}, el('span', {}, texto), input, el('span.interruptor-pista', { 'aria-hidden': 'true' }));
  nodo.valor = () => input.checked;
  return nodo;
}

