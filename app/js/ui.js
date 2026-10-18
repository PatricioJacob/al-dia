// =====================================================================
// Piezas de interfaz reutilizables: elementos, avisos (toasts), hojas
// =====================================================================

/** Crea un elemento: el('div.clase#id', {atributos}, hijos...) */
export function el(selector, attrs = {}, ...hijos) {
  const [, tag = 'div', resto = ''] = selector.match(/^([a-z0-9-]*)(.*)$/i);
  const nodo = document.createElement(tag || 'div');
  resto.replace(/([.#])([\w-]+)/g, (_, t, n) => { if (t === '.') nodo.classList.add(n); else nodo.id = n; });
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) nodo.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') nodo.innerHTML = v;
    else if (k === 'dataset') Object.assign(nodo.dataset, v);
    else if (k in nodo && typeof v !== 'string') nodo[k] = v;
    else nodo.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) nodo.append(h);
  return nodo;
}

// ---------------------------------------------------------------------
// Toasts ("Completada · Deshacer")
// ---------------------------------------------------------------------
export function toast(mensaje, { accion, alAccion, duracion = 5000, tipo = '' } = {}) {
  const zona = document.getElementById('toasts');
  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    t.classList.add('saliendo');
    setTimeout(() => t.remove(), 250);
  };
  const t = el(`div.toast${tipo ? '.' + tipo : ''}`, { role: 'status' },
    el('span', {}, mensaje),
    accion && el('button.toast-accion', { type: 'button', onclick: () => { alAccion?.(); cerrar(); } }, accion),
    el('div.toast-barra', { style: `animation-duration:${duracion}ms` }),
  );
  zona.append(t);
  // Máximo 3 a la vez: el más viejo se va
  const todos = zona.querySelectorAll('.toast:not(.saliendo)');
  if (todos.length > 3) todos[0].querySelector('.toast-accion')?.blur(), todos[0].classList.add('saliendo'), setTimeout(() => todos[0].remove(), 250);
  setTimeout(cerrar, duracion);
  return cerrar;
}

// ---------------------------------------------------------------------
// Hoja inferior en el celular / diálogo centrado en la PC
// ---------------------------------------------------------------------
let hojaActual = null;

export function abrirHoja(contenido, { titulo, alCerrar, clase = '' } = {}) {
  cerrarHoja();
  const fondo = el('div.hoja-fondo', { onclick: (e) => { if (e.target === fondo) cerrarHoja(); } });
  const hoja = el(`div.hoja${clase ? '.' + clase : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo || 'Diálogo' },
    el('div.hoja-asa'),
    titulo && el('div.hoja-cabecera', {},
      el('h2', {}, titulo),
      el('button.boton-icono', { type: 'button', 'aria-label': 'Cerrar', onclick: () => cerrarHoja() }, '✕'),
    ),
    el('div.hoja-cuerpo', {}, contenido),
  );
  fondo.append(hoja);
  document.body.append(fondo);
  document.body.classList.add('con-hoja');
  requestAnimationFrame(() => fondo.classList.add('visible'));
  hojaActual = { fondo, alCerrar };
  // Foco en el primer campo (en PC); en iPhone solo si viene de un toque
  const primero = hoja.querySelector('[autofocus]');
  if (primero) setTimeout(() => primero.focus(), 60);
  return hoja;
}

export function cerrarHoja() {
  if (!hojaActual) return;
  const { fondo, alCerrar } = hojaActual;
  hojaActual = null;
  fondo.classList.remove('visible');
  document.body.classList.remove('con-hoja');
  setTimeout(() => fondo.remove(), 220);
  alCerrar?.();
}

export const hayHojaAbierta = () => Boolean(hojaActual);

/** Chips seleccionables (una sola opción) */
export function grupoChips(opciones, valor, alElegir) {
  const cont = el('div.chips', { role: 'radiogroup' });
  const pintar = (v) => cont.querySelectorAll('.chip').forEach((c) => c.classList.toggle('activo', c.dataset.v === String(v)));
  for (const o of opciones) {
    cont.append(el('button.chip', {
      type: 'button', role: 'radio', dataset: { v: String(o.valor) },
      onclick: () => { pintar(o.valor); alElegir(o.valor); },
    }, o.texto));
  }
  pintar(valor);
  return cont;
}

export const vibrar = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* iOS no vibra */ } };
