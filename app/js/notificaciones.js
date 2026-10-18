// =====================================================================
// Notificaciones: permiso, suscripción push y alertas dentro de la app
// =====================================================================

import { VAPID_PUBLIC_KEY } from './config.js';
import { clienteSupabase, hayNube } from './datos.js';

export const soportaNotificaciones = () => 'Notification' in window && 'serviceWorker' in navigator;
export const soportaPush = () => soportaNotificaciones() && 'PushManager' in window;
export const permiso = () => (soportaNotificaciones() ? Notification.permission : 'unsupported');

/** iPhone/iPad (incluye iPad con "modo escritorio") */
export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** ¿Está abierta como app instalada (desde la pantalla de inicio)? */
export const esInstalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function base64AUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Tiene que llamarse desde un toque/clic del usuario (requisito de iOS) */
export async function activarNotificaciones() {
  if (!soportaNotificaciones()) throw new Error('Este navegador no soporta notificaciones.');
  if (esIOS() && !esInstalada()) {
    throw new Error('En el iPhone primero instalá la app: botón Compartir → "Agregar a inicio". Después abrila desde el ícono y activá los avisos.');
  }
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('No diste permiso para notificaciones. Podés activarlo en los ajustes del sistema.');
  if (hayNube() && soportaPush()) await suscribirPush();
  return true;
}

export async function suscribirPush() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64AUint8(VAPID_PUBLIC_KEY),
    });
  }
  const j = sub.toJSON();
  const cli = await clienteSupabase();
  const { error } = await cli.from('suscripciones').upsert({
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    dispositivo: esIOS() ? 'iPhone' : (/android/i.test(navigator.userAgent) ? 'Android' : 'Computadora'),
    zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

/** Al iniciar: si ya había permiso, renovar la suscripción en silencio */
export async function renovarSiCorresponde() {
  if (hayNube() && soportaPush() && permiso() === 'granted') {
    try { await suscribirPush(); } catch (e) { console.warn('No se pudo renovar push', e); }
  }
}

// ---------------------------------------------------------------------
// Sonido corto y suave (sin archivos de audio)
// ---------------------------------------------------------------------
let ctx = null;
export function sonar() {
  try {
    ctx = ctx ?? new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.14);
      g.gain.linearRampToValueAtTime(0.18, t + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.14);
      o.stop(t + i * 0.14 + 0.4);
    });
  } catch { /* sin audio */ }
}

/** Notificación del sistema desde la propia app (modo local o PC con la app abierta) */
export async function notificarLocal(titulo, cuerpo, itemId) {
  if (permiso() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(titulo, {
      body: cuerpo, tag: itemId, icon: 'iconos/icono-192.png', badge: 'iconos/icono-192.png', data: { item: itemId },
    });
  } catch { /* nada */ }
}
