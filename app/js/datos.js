// =====================================================================
// Capa de datos
// - Siempre guarda una copia local (abre al instante y anda sin señal)
// - Si hay Supabase configurado y sesión iniciada, sincroniza en la nube
//   y escucha cambios en tiempo real desde los otros dispositivos
// =====================================================================

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const CLAVE_CACHE = 'aldia.items';
const CLAVE_COLA = 'aldia.cola';

export const hayNube = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

let sb = null;
export async function clienteSupabase() {
  if (!hayNube()) return null;
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return sb;
}

const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ } };

const CAMPOS = ['id', 'tipo', 'titulo', 'nota', 'urgente', 'fecha', 'fin', 'aviso', 'repeticion',
  'anticipo_dias', 'completada_en', 'borrada_en', 'creado_en', 'actualizado_en'];
const limpiar = (it) => Object.fromEntries(CAMPOS.filter((c) => c in it).map((c) => [c, it[c]]));

class Almacen {
  constructor() {
    this.items = new Map(leer(CLAVE_CACHE, []).map((i) => [i.id, i]));
    this.oyentes = new Set();
    this.usuario = null;
    this.canal = null;
  }

  todos() { return [...this.items.values()]; }
  obtener(id) { return this.items.get(id); }
  alCambiar(fn) { this.oyentes.add(fn); return () => this.oyentes.delete(fn); }

  emitir() {
    escribir(CLAVE_CACHE, this.todos());
    this.oyentes.forEach((fn) => fn());
  }

  // ------------------------------------------------------------------
  async conectar(usuario) {
    this.usuario = usuario;
    await this.vaciarCola();
    await this.recargar();
    const cli = await clienteSupabase();
    this.canal?.unsubscribe();
    this.canal = cli.channel('items-' + usuario.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${usuario.id}` },
        (p) => {
          if (p.eventType === 'DELETE') this.items.delete(p.old.id);
          else this.items.set(p.new.id, p.new);
          this.emitir();
        })
      .subscribe();
    // iOS corta las conexiones en segundo plano: al volver, recargamos
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.vaciarCola().then(() => this.recargar());
    });
    window.addEventListener('online', () => this.vaciarCola().then(() => this.recargar()));
  }

  desconectar() {
    this.canal?.unsubscribe();
    this.usuario = null;
    this.items.clear();
    escribir(CLAVE_COLA, []);
    this.emitir();
  }

  async recargar() {
    if (!this.usuario) return;
    const cli = await clienteSupabase();
    const { data, error } = await cli.from('items').select('*');
    if (error) { console.warn('No se pudo recargar', error); return; }
    // No pisar cambios locales que todavía no subieron
    const pendientes = new Set(leer(CLAVE_COLA, []).map((o) => o.item.id));
    const nuevo = new Map(data.map((i) => [i.id, i]));
    for (const id of pendientes) if (this.items.has(id)) nuevo.set(id, this.items.get(id));
    this.items = nuevo;
    this.emitir();
  }

  // ------------------------------------------------------------------
  /** Crea o actualiza (optimista: se ve al instante y sube después) */
  async guardar(item) {
    const ahora = new Date().toISOString();
    const previo = this.items.get(item.id);
    const final = { ...previo, ...item, actualizado_en: ahora };
    if (!final.id) final.id = crypto.randomUUID();
    if (!final.creado_en) final.creado_en = ahora;
    this.items.set(final.id, final);
    this.emitir();
    if (this.usuario) await this.subir(final);
    return final;
  }

  actualizar(id, cambios) {
    const it = this.items.get(id);
    if (!it) return null;
    return this.guardar({ ...it, ...cambios });
  }

  /** Borrado definitivo (desde la papelera) */
  async eliminar(id) {
    this.items.delete(id);
    this.emitir();
    if (!this.usuario) return;
    const cli = await clienteSupabase();
    const { error } = await cli.from('items').delete().eq('id', id);
    if (error) this.encolar({ op: 'eliminar', item: { id } });
  }

  async subir(item) {
    const cli = await clienteSupabase();
    const { error } = await cli.from('items').upsert(limpiar(item));
    if (error) { console.warn('Sin conexión, queda en cola', error.message); this.encolar({ op: 'guardar', item }); }
  }

  encolar(op) {
    const cola = leer(CLAVE_COLA, []).filter((o) => o.item.id !== op.item.id);
    cola.push(op);
    escribir(CLAVE_COLA, cola);
  }

  async vaciarCola() {
    if (!this.usuario) return;
    const cola = leer(CLAVE_COLA, []);
    if (!cola.length) return;
    escribir(CLAVE_COLA, []);
    const cli = await clienteSupabase();
    for (const o of cola) {
      const { error } = o.op === 'eliminar'
        ? await cli.from('items').delete().eq('id', o.item.id)
        : await cli.from('items').upsert(limpiar(this.items.get(o.item.id) ?? o.item));
      if (error) this.encolar(o);
    }
  }
}

export const almacen = new Almacen();

// ---------------------------------------------------------------------
// Sesión (código de 6 dígitos por email: funciona perfecto en el iPhone)
// ---------------------------------------------------------------------
export async function usuarioActual() {
  const cli = await clienteSupabase();
  if (!cli) return null;
  const { data } = await cli.auth.getSession();
  return data.session?.user ?? null;
}

export async function enviarCodigo(email) {
  const cli = await clienteSupabase();
  const { error } = await cli.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verificarCodigo(email, token) {
  const cli = await clienteSupabase();
  const { data, error } = await cli.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.user;
}

export async function cerrarSesion() {
  const cli = await clienteSupabase();
  await cli?.auth.signOut();
  almacen.desconectar();
  escribir(CLAVE_NOMBRE, '');
}

// ---------------------------------------------------------------------
// Nombre del usuario (para saludarlo). Se guarda en la cuenta, así lo
// ven todos los dispositivos y también las notificaciones.
// ---------------------------------------------------------------------
const CLAVE_NOMBRE = 'aldia.nombre';

export const nombreUsuario = () => leer(CLAVE_NOMBRE, '');

/** Al iniciar: trae el nombre guardado en la cuenta (si hay) */
export function sincronizarNombre(usuario) {
  const n = usuario?.user_metadata?.nombre;
  if (n) escribir(CLAVE_NOMBRE, n);
  return nombreUsuario();
}

export async function guardarNombre(nombre) {
  const n = nombre.trim().slice(0, 40);
  escribir(CLAVE_NOMBRE, n);
  almacen.emitir();
  const cli = await clienteSupabase();
  if (cli && almacen.usuario) {
    const { error } = await cli.auth.updateUser({ data: { nombre: n } });
    if (error) console.warn('No se pudo guardar el nombre en la cuenta', error.message);
  }
  return n;
}
