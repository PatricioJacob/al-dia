// =====================================================================
// Al día · Función "recordatorios" (Supabase Edge Function, Deno)
//
// La llama pg_cron:
//   - cada minuto  -> {"accion":"avisos"}   manda los avisos vencidos
//   - a las 8:00   -> {"accion":"resumen"}  manda el resumen del día
//
// Secretos que hay que cargar en Supabase > Edge Functions > Secrets:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen cargados solos)
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const ZONA_DEFECTO = "America/Argentina/Buenos_Aires";
const INSISTIR_CADA_MIN = 30; // si no marcás la tarea, vuelve a avisar
const MAX_ENVIOS_TAREA = 3;   // 1 aviso + 2 insistencias

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

type Suscripcion = {
  id: string; user_id: string; endpoint: string; p256dh: string; auth: string; zona: string;
};

type Item = {
  id: string; user_id: string; tipo: "tarea" | "evento"; titulo: string; urgente: boolean;
  fecha: string | null; fin: string | null; aviso: string | null; envios: number;
  anticipo_dias: number | null;
  completada_en: string | null; borrada_en: string | null;
};

// Nombre que el usuario eligió en la app (se guarda en su cuenta)
const nombres = new Map<string, string>();
async function nombreDe(userId: string) {
  if (!nombres.has(userId)) {
    const { data } = await db.auth.admin.getUserById(userId);
    nombres.set(userId, String(data?.user?.user_metadata?.nombre ?? "").trim());
  }
  return nombres.get(userId)!;
}

// ---------------------------------------------------------------------
// Envío de un push a todos los dispositivos de un usuario
// ---------------------------------------------------------------------
async function enviarAUsuario(subs: Suscripcion[], datos: Record<string, unknown>) {
  const cuerpo = JSON.stringify(datos);
  let enviados = 0;
  for (const s of subs) {
    try {
      // web-push arma el mensaje cifrado; lo mandamos con fetch (nativo de Deno)
      const req = webpush.generateRequestDetails(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        cuerpo,
        { TTL: 60 * 60 * 6, urgency: "high" },
      );
      const r = await fetch(req.endpoint, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.body,
      });
      if (r.status === 404 || r.status === 410) {
        // El dispositivo ya no existe (app desinstalada, permiso revocado)
        await db.from("suscripciones").delete().eq("id", s.id);
      } else if (r.ok) {
        enviados++;
      } else {
        console.error("Push rechazado", r.status, await r.text());
      }
    } catch (e) {
      console.error("Error enviando push", e);
    }
  }
  return enviados;
}

function hora(iso: string, zona: string) {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: zona })
    .format(new Date(iso));
}

/** "viernes 24 de octubre" (+ " a las 15:00" si tiene hora) */
function diaYHora(iso: string, zona: string) {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: zona }).format(d);
  const h = hora(iso, zona);
  return h === "00:00" ? dia : `${dia} a las ${h}`;
}

async function suscripcionesPorUsuario(userIds: string[]) {
  const mapa = new Map<string, Suscripcion[]>();
  if (userIds.length === 0) return mapa;
  const { data, error } = await db.from("suscripciones").select("*").in("user_id", userIds);
  if (error) throw error;
  for (const s of data as Suscripcion[]) {
    if (!mapa.has(s.user_id)) mapa.set(s.user_id, []);
    mapa.get(s.user_id)!.push(s);
  }
  return mapa;
}

// ---------------------------------------------------------------------
// Avisos vencidos (corre cada minuto)
// ---------------------------------------------------------------------
async function procesarAvisos() {
  const ahora = new Date();
  const { data, error } = await db.from("items")
    .select("*")
    .lte("proximo_envio", ahora.toISOString())
    .is("completada_en", null)
    .is("borrada_en", null)
    .limit(200);
  if (error) throw error;
  const items = data as Item[];
  if (items.length === 0) return { avisos: 0 };

  const subs = await suscripcionesPorUsuario([...new Set(items.map((i) => i.user_id))]);
  let total = 0;

  for (const it of items) {
    const misSubs = subs.get(it.user_id) ?? [];
    const zona = misSubs[0]?.zona ?? ZONA_DEFECTO;
    const insistencia = it.envios > 0;

    let titulo: string;
    let cuerpo: string;
    if (it.tipo === "evento") {
      titulo = `📅 ${it.titulo}`;
      cuerpo = it.fecha ? `Empieza a las ${hora(it.fecha, zona)}` : "Evento";
    } else {
      const nombre = await nombreDe(it.user_id);
      titulo = `${it.urgente ? "🔥" : "🔔"} ${it.titulo}`;
      cuerpo = insistencia
        ? `${nombre ? nombre + ", sigue" : "Sigue"} pendiente · tocá para marcarla o posponerla`
        : "Tocá para marcarla o posponerla";
    }

    if (misSubs.length) {
      total += await enviarAUsuario(misSubs, { titulo, cuerpo, item: it.id, tag: it.id });
    }

    // Programar la próxima insistencia (solo tareas) o terminar
    const envios = it.envios + 1;
    const siguiente = it.tipo === "tarea" && envios < MAX_ENVIOS_TAREA
      ? new Date(ahora.getTime() + INSISTIR_CADA_MIN * 60_000).toISOString()
      : null;
    await db.from("items").update({ envios, proximo_envio: siguiente }).eq("id", it.id);
  }
  return { avisos: total };
}

// ---------------------------------------------------------------------
// Avisos anticipados: 1 a 7 días antes (corre junto con los avisos)
// ---------------------------------------------------------------------
async function procesarAnticipos() {
  const { data, error } = await db.from("items")
    .select("*")
    .lte("proximo_anticipo", new Date().toISOString())
    .is("completada_en", null)
    .is("borrada_en", null)
    .limit(200);
  if (error) throw error;
  const items = data as Item[];
  if (items.length === 0) return { anticipos: 0 };

  const subs = await suscripcionesPorUsuario([...new Set(items.map((i) => i.user_id))]);
  let total = 0;

  for (const it of items) {
    const misSubs = subs.get(it.user_id) ?? [];
    const zona = misSubs[0]?.zona ?? ZONA_DEFECTO;
    const nombre = await nombreDe(it.user_id);
    const n = it.anticipo_dias ?? 1;
    const cuando = n === 1 ? "Mañana" : `En ${n} días`;
    const ref = it.tipo === "evento" ? it.fecha : (it.fecha ?? it.aviso);

    if (misSubs.length && ref) {
      total += await enviarAUsuario(misSubs, {
        titulo: `⏳ ${cuando}: ${it.titulo}`,
        cuerpo: `${nombre ? nombre + ", te" : "Te"} aviso con tiempo · ${diaYHora(ref, zona)}`,
        item: it.id,
        tag: `anticipo-${it.id}`,
      });
    }
    // Se manda una sola vez (el trigger lo reprograma si cambia la fecha)
    await db.from("items").update({ proximo_anticipo: null }).eq("id", it.id);
  }
  return { anticipos: total };
}

// ---------------------------------------------------------------------
// Resumen de la mañana (corre una vez por día)
// ---------------------------------------------------------------------
function finDelDia(zona: string): Date {
  // Fecha de hoy en la zona del usuario -> 23:59:59 de ese día en UTC
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()); // "2026-10-17"
  const mediodiaUtc = new Date(`${partes}T12:00:00Z`);
  const enZona = new Date(mediodiaUtc.toLocaleString("en-US", { timeZone: zona }));
  const offsetMs = mediodiaUtc.getTime() - enZona.getTime();
  return new Date(new Date(`${partes}T23:59:59Z`).getTime() + offsetMs);
}

async function procesarResumen() {
  const { data: todas, error } = await db.from("suscripciones").select("*");
  if (error) throw error;
  const porUsuario = new Map<string, Suscripcion[]>();
  for (const s of todas as Suscripcion[]) {
    if (!porUsuario.has(s.user_id)) porUsuario.set(s.user_id, []);
    porUsuario.get(s.user_id)!.push(s);
  }

  let enviados = 0;
  for (const [userId, subs] of porUsuario) {
    const zona = subs[0].zona ?? ZONA_DEFECTO;
    const fin = finDelDia(zona).toISOString();
    const inicio = new Date(new Date(fin).getTime() - 86_399_000).toISOString();

    const { data: tareas } = await db.from("items").select("id,titulo,fecha,aviso,urgente")
      .eq("user_id", userId).eq("tipo", "tarea").is("completada_en", null).is("borrada_en", null)
      .or(`fecha.lte.${fin},aviso.lte.${fin}`);
    const { data: eventos } = await db.from("items").select("id,titulo,fecha")
      .eq("user_id", userId).eq("tipo", "evento").is("borrada_en", null)
      .gte("fecha", inicio).lte("fecha", fin).order("fecha");

    const nT = tareas?.length ?? 0;
    const nE = eventos?.length ?? 0;
    if (nT + nE === 0) continue; // sin nada, no molestamos

    const partes: string[] = [];
    if (nT) partes.push(`${nT} ${nT === 1 ? "pendiente" : "pendientes"}`);
    if (nE) partes.push(`${nE} ${nE === 1 ? "evento" : "eventos"}`);
    const primero = eventos?.[0]
      ? `Primero: ${eventos[0].titulo} a las ${hora(eventos[0].fecha!, zona)}`
      : `Empezá por: ${tareas![0].titulo}`;

    const nombre = await nombreDe(userId);
    enviados += await enviarAUsuario(subs, {
      titulo: `☀️ ${nombre ? `Buen día, ${nombre}` : "Buen día"} · hoy: ${partes.join(" y ")}`,
      cuerpo: primero,
      tag: "resumen-diario",
    });
  }
  return { resumen: enviados };
}

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("No autorizado", { status: 401 });
  }
  try {
    nombres.clear(); // por si alguien cambió su nombre desde la última vez
    const { accion } = await req.json().catch(() => ({ accion: "avisos" }));
    const resultado = accion === "resumen"
      ? await procesarResumen()
      : { ...(await procesarAvisos()), ...(await procesarAnticipos()) };
    return Response.json({ ok: true, ...resultado });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
