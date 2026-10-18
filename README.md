# Al día

Tu segundo cerebro para el día a día: pendientes que se borran al cumplirlos, recordatorios que llegan aunque la app esté cerrada y un calendario de eventos, todo en una sola app para la PC y el iPhone.

- **Captura en 3 segundos**: escribís "pagar la luz mañana 20hs" y la app entiende la fecha, la hora, si es urgente y si se repite.
- **Atención inmediata**: lo vencido y lo de hoy siempre arriba.
- **Avisos que insisten**: si no marcás la tarea, te vuelve a avisar a los 30 y a los 60 minutos. Todos los días a las 8:00 llega un resumen.
- **Calendario** con vista de mes y de semana, y el detalle del día elegido.
- **Papelera de 7 días** y "Deshacer" por si tachás algo por error.
- Sincroniza en tiempo real entre dispositivos y anda sin conexión.

Hecho con HTML, CSS y JavaScript sin frameworks (PWA), Supabase (Postgres, autenticación y Edge Functions) y GitHub Pages. Costo: $0.

---

## Estructura

```
al-dia/
├── app/                      ← la app (esto es lo que se publica)
│   ├── index.html
│   ├── manifest.webmanifest  ← la hace instalable
│   ├── sw.js                 ← funciona sin conexión y recibe los avisos push
│   ├── css/estilos.css
│   ├── iconos/
│   └── js/
│       ├── config.js         ← ACÁ van tus datos de Supabase
│       ├── app.js            ← arranque, navegación, atajos, alertas
│       ├── datos.js          ← guardado local + sincronización con Supabase
│       ├── parser.js         ← entiende "mañana 20hs", "el viernes", etc.
│       ├── acciones.js       ← completar, posponer, borrar, secciones
│       ├── vista-pendientes.js
│       ├── vista-calendario.js
│       ├── formularios.js    ← captura, editar, posponer, papelera, ajustes
│       ├── notificaciones.js
│       ├── fechas.js
│       └── ui.js
├── supabase/
│   ├── 01_esquema.sql              ← tablas y seguridad
│   ├── 02_tareas_programadas.sql   ← avisos cada minuto, resumen, papelera
│   └── functions/recordatorios/index.ts  ← manda los push
├── para-github/              ← mover a .github/workflows/ (ver paso 6)
│   ├── publicar.yml          ← publica app/ en GitHub Pages
│   └── mantener-activo.yml   ← evita que Supabase se pause
├── pruebas/parser.test.mjs   ← node pruebas/parser.test.mjs
├── generar_iconos.py
└── secretos/LEEME-claves.txt ← claves privadas (NO se suben, ver .gitignore)
```

---

## 0 · Probarla ya, sin configurar nada (modo local)

```bash
cd app
python -m http.server 8000
```

Abrí http://localhost:8000. Funciona completa, pero guarda los datos solo en ese navegador. Cuando completes los pasos de abajo, pasa a sincronizar sola.

---

## 1 · Crear el proyecto en Supabase (5 min)

1. Entrá a https://supabase.com, creá una cuenta y un proyecto nuevo (región: São Paulo, la más cercana).
2. En **Project Settings → API** copiá la **Project URL** y la **anon / publishable key**.
3. Pegalas en `app/js/config.js`:
   ```js
   export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   export const SUPABASE_KEY = 'eyJ... o sb_publishable_...';
   ```
   Esas dos son públicas, así que pueden ir en el código.

## 2 · Crear las tablas

**SQL Editor → New query**: pegá todo `supabase/01_esquema.sql` y apretá **Run**.

## 3 · Inicio de sesión con código (para que funcione bien en el iPhone)

1. **Authentication → Sign In / Providers → Email**: dejalo activado.
2. **Authentication → Emails → Magic Link**: reemplazá el contenido del mensaje por:
   ```html
   <h2>Tu código para entrar a Al día</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>Vence en una hora.</p>
   ```
   Así el mail trae un **código de 6 dígitos** en vez de un link. En el iPhone, un link abre Safari y no la app instalada, por eso usamos código.
3. Opcional: cuando ya tengas tu cuenta creada, en **Authentication → Sign In / Providers** desactivá "Allow new users to sign up" para que nadie más pueda registrarse.

## 4 · La función que manda los avisos

1. **Edge Functions → Deploy a new function → Via Editor**. Nombre: `recordatorios`.
2. Pegá todo `supabase/functions/recordatorios/index.ts` y apretá **Deploy**.
3. En la configuración de la función, **desactivá "Verify JWT"**. La protege el `CRON_SECRET`.
4. **Edge Functions → Secrets**: cargá los 4 valores de `secretos/LEEME-claves.txt` (en `VAPID_SUBJECT` poné `mailto:` + tu email).

## 5 · Programar los avisos

Abrí `supabase/02_tareas_programadas.sql` y reemplazá:
- `TU_PROYECTO` por el id de tu proyecto (lo que va antes de `.supabase.co`)
- `TU_SECRETO` por el `CRON_SECRET`

Pegalo en el **SQL Editor** y apretá **Run**. Para verificar que anda: `select * from cron.job_run_details order by start_time desc limit 5;`

> Si da error con `pg_cron` o `pg_net`, activalas a mano en **Database → Extensions** y volvé a correrlo.

## 6 · Publicarla en internet (GitHub Pages)

1. Mové los dos archivos de `para-github/` a una carpeta nueva `.github/workflows/` (con el punto adelante). Desde la terminal, parado en `al-dia`:
   ```bash
   mkdir .github\workflows
   move para-github\*.yml .github\workflows\
   ```
2. Creá un repositorio nuevo en GitHub (por ejemplo `al-dia`) y subí esta carpeta. `secretos/` no se sube porque está en `.gitignore`.
3. En el repo: **Settings → Pages → Source: GitHub Actions**.
4. Cada vez que subís cambios, se publica sola en `https://patriciojacob.github.io/al-dia/`.
5. En Supabase, **Authentication → URL Configuration → Site URL**: poné esa misma dirección.

## 7 · Que Supabase no se pause nunca

El plan gratis pausa el proyecto después de 7 días sin uso. Hay dos protecciones:
- Si usás la app todos los días, ya cuenta como uso.
- El workflow `mantener-activo.yml` consulta la base todos los días desde GitHub, aunque no la abras. Para activarlo: **Settings → Secrets and variables → Actions → New repository secret**, cargá `SUPABASE_URL` y `SUPABASE_KEY` (los mismos de `config.js`), y probalo desde **Actions → Mantener Supabase activo → Run workflow**.

Como GitHub apaga los workflows programados de repos sin actividad durante 60 días, este workflow deja un commit mínimo el día 1 de cada mes.

## 8 · Instalarla

**iPhone** (iOS 16.4 o más nuevo):
1. Abrí la dirección en **Safari** → botón **Compartir** → **Agregar a inicio**.
2. Abrí *Al día* **desde el ícono** (no desde Safari) e iniciá sesión con tu email.
3. **Ajustes (⚙) → Activar avisos en este dispositivo** → Permitir.

**PC** (Chrome o Edge): abrí la dirección → ícono de instalar en la barra de direcciones → iniciá sesión → **Ajustes → Activar avisos**.

---

## Cómo se usa

| Escribís | Queda |
|---|---|
| `pagar la luz mañana 20hs` | Pagar la luz · mañana 20:00 🔔 |
| `llamar al cliente a las 5 urgente` | Llamar al cliente · hoy 17:00 · Urgente |
| `turno dentista el 28/10 a las 15` | Turno dentista · 28 oct 15:00 |
| `entregar TP el viernes` | Entregar TP · viernes (aviso 9:00) |
| `sacar la ropa en 30 minutos` | Sacar la ropa · dentro de 30 min |
| `sacar la basura todos los martes 21hs` | ↻ semanal, martes 21:00 |
| `pagar alquiler todos los 10` | ↻ mensual, día 10 |
| `estudiar esta noche` / `a la mañana` / `a la tarde` | 21:00 / 9:00 / 16:00 |

**Atajos en la PC:** `N` o `/` para anotar · `1` Pendientes · `2` Calendario · `Esc` para cerrar.

**Tareas que se repiten:** al marcarlas no se borran, saltan a la próxima fecha.

**Tocar una notificación** abre la tarea con las opciones: Hecha / +10 min / +1 hora / +3 horas / Mañana 9:00. En el iPhone las notificaciones web no admiten botones, por eso las opciones aparecen al abrir la app.

## Publicar cambios

Si modificás la app, subí el número en `VERSION` dentro de `app/sw.js` (por ejemplo `al-dia-v2`) para que los dispositivos descarguen la versión nueva.
