// =====================================================================
// Al día · arranque y orquestación
// =====================================================================

import { almacen, hayNube, usuarioActual, enviarCodigo, verificarCodigo } from './datos.js';
import { renderPendientes } from './vista-pendientes.js';
import { renderCalendario } from './vista-calendario.js';
import {
  crearCaptura, abrirCapturaMovil, abrirAjustes, abrirPosponer, leerPref,
} from './formularios.js';
import { cerrarHoja, hayHojaAbierta, toast, el } from './ui.js';
import { activas } from './acciones.js';
import { renovarSiCorresponde, sonar, notificarLocal, permiso } from './notificaciones.js';
import { fechaLarga, hora } from './fechas.js';

const $ = (s) => document.querySelector(s);
let vista = (() => { try { return localStorage.getItem('aldia.vista') || 'pendientes'; } catch { return 'pendientes'; } })();
let captura = null;

// ---------------------------------------------------------------------
// Navegación entre "Pendientes" y "Calendario"
// ---------------------------------------------------------------------
function irA(v) {
  vista = v;
  try { localStorage.setItem('aldia.vista', v); } catch { /* nada */ }
  document.querySelectorAll('[data-vista]').forEach((b) => {
    const activo = b.dataset.vista === v;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-current', activo ? 'page' : 'false');
  });
  $('#vista-pendientes').hidden = v !== 'pendientes';
  $('#vista-calendario').hidden = v !== 'calendario';
  $('#titulo-vista').textContent = v === 'pendientes' ? 'Pendientes' : 'Calendario';
  pintar();
  $('#contenido').scrollTo?.({ top: 0 });
}

function pintar() {
  $('#fecha-hoy').textContent = fechaLarga(new Date());
  if (vista === 'pendientes') renderPendientes($('#vista-pendientes'));
  else renderCalendario($('#vista-calendario'));
  // Contador en la navegación
  const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);
  const n = activas().filter((i) => i.tipo === 'tarea' && ((i.aviso && new Date(i.aviso) <= finHoy) || (i.fecha && new Date(i.fecha) <= finHoy) || i.urgente)).length;
  document.querySelectorAll('.insignia').forEach((s) => { s.textContent = n || ''; s.hidden = !n; });
  document.title = n ? `(${n}) Al día` : 'Al día';
}

// ---------------------------------------------------------------------
// Alertas dentro de la app cuando vence algo (con la app abierta)
// ---------------------------------------------------------------------
let ultimoChequeo = Date.now();
function chequearAvisos() {
  const ahora = Date.now();
  const vencen = activas().filter((i) => i.aviso && new Date(i.aviso).getTime() > ultimoChequeo && new Date(i.aviso).getTime() <= ahora);
  ultimoChequeo = ahora;
  if (!vencen.length) return;
  if (leerPref('sonido', true)) sonar();
  for (const it of vencen) {
    const texto = it.tipo === 'evento'
      ? `📅 ${it.titulo} · ${hora(it.fecha)}`
      : `${it.urgente ? '🔥' : '🔔'} ${it.titulo}`;
    toast(texto, { accion: it.tipo === 'evento' ? 'Ver' : 'Opciones', alAccion: () => abrirPosponer(it.id), duracion: 12000, tipo: 'alerta' });
    // Sin nube no hay push desde el servidor: avisamos desde acá
    if (!hayNube() && document.visibilityState !== 'visible' && permiso() === 'granted') {
      notificarLocal(texto, it.tipo === 'evento' ? 'Empieza pronto' : 'Tocá para marcarla o posponerla', it.id);
    }
  }
  pintar();
}

// ---------------------------------------------------------------------
// Inicio de sesión con código por email
// ---------------------------------------------------------------------
function mostrarLogin() {
  return new Promise((resolver) => {
    const pantalla = $('#login');
    pantalla.hidden = false;
    const form = $('#login-form');
    const email = $('#login-email');
    const codigo = $('#login-codigo');
    const paso2 = $('#login-paso2');
    const boton = $('#login-boton');
    const msg = $('#login-msg');
    let enviado = false;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      boton.disabled = true;
      try {
        if (!enviado) {
          await enviarCodigo(email.value.trim());
          enviado = true;
          paso2.hidden = false;
          email.readOnly = true;
          boton.textContent = 'Entrar';
          msg.textContent = 'Te mandamos un código de 6 dígitos. Revisá tu correo (y el spam).';
          codigo.focus();
        } else {
          const u = await verificarCodigo(email.value.trim(), codigo.value.replace(/\D/g, ''));
          pantalla.hidden = true;
          resolver(u);
        }
      } catch (err) {
        msg.textContent = /rate|limit/i.test(err.message)
          ? 'Muchos intentos seguidos. Esperá un minuto y probá de nuevo.'
          : enviado ? 'El código no es correcto o venció. Probá de nuevo.' : `No se pudo enviar: ${err.message}`;
      } finally { boton.disabled = false; }
    });
    $('#login-cambiar').addEventListener('click', () => {
      enviado = false; paso2.hidden = true; email.readOnly = false; boton.textContent = 'Enviarme un código'; email.focus();
    });
    email.focus();
  });
}

// ---------------------------------------------------------------------
// Atajos de teclado (PC)
// ---------------------------------------------------------------------
function atajos(e) {
  const escribiendo = /input|textarea|select/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (e.key === 'Escape' && hayHojaAbierta()) { cerrarHoja(); return; }
  if (escribiendo || e.metaKey || e.ctrlKey || e.altKey) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); enfocarCaptura(); }
    return;
  }
  if (hayHojaAbierta()) return;
  if (e.key === 'n' || e.key === 'N' || e.key === '/') { e.preventDefault(); enfocarCaptura(); }
  if (e.key === '1') irA('pendientes');
  if (e.key === '2') irA('calendario');
}

function enfocarCaptura() {
  if (matchMedia('(min-width: 900px)').matches) captura.enfocar();
  else abrirCapturaMovil();
}

// ---------------------------------------------------------------------
// Papelera en modo local: vaciar lo que tiene más de 7 días
// ---------------------------------------------------------------------
function purgarLocal() {
  const limite = Date.now() - 7 * 86400000;
  for (const it of almacen.todos()) {
    const f = it.borrada_en ?? it.completada_en;
    if (f && new Date(f).getTime() < limite) almacen.eliminar(it.id);
  }
}

// ---------------------------------------------------------------------
async function iniciar() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.tipo === 'abrir-item' && e.data.item) abrirPosponer(e.data.item);
    });
  }

  // Captura en la barra superior (PC)
  captura = crearCaptura();
  $('#zona-captura').append(captura);

  document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => irA(b.dataset.vista)));
  $('#boton-flotante').addEventListener('click', abrirCapturaMovil);
  document.querySelectorAll('.boton-ajustes').forEach((b) => b.addEventListener('click', abrirAjustes));
  document.addEventListener('keydown', atajos);

  almacen.alCambiar(pintar);
  irA(vista);

  if (hayNube()) {
    let usuario = await usuarioActual();
    if (!usuario) usuario = await mostrarLogin();
    await almacen.conectar(usuario);
    renovarSiCorresponde();
    if (permiso() === 'default') {
      toast('Activá los avisos para que no se te pase nada', { accion: 'Activar', alAccion: abrirAjustes, duracion: 8000 });
    }
  } else {
    $('#aviso-local').hidden = false;
    purgarLocal();
  }

  // Si se abrió tocando una notificación
  const item = new URLSearchParams(location.search).get('item');
  if (item) {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => abrirPosponer(item), 300);
  }

  setInterval(chequearAvisos, 15000);
  setInterval(pintar, 60000); // refrescar "vencida", "hoy", etc.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { chequearAvisos(); pintar(); } });
}

iniciar().catch((e) => {
  console.error(e);
  document.body.append(el('div.error-fatal', {}, 'Algo falló al abrir la app. Recargá la página.'));
});
