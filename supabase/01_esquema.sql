-- =====================================================================
-- Al día · Esquema de base de datos (Supabase / Postgres)
-- Pegar completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabla principal: tareas y eventos en una sola tabla
-- ---------------------------------------------------------------------
create table if not exists public.items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo            text not null check (tipo in ('tarea', 'evento')),
  titulo          text not null check (char_length(titulo) between 1 and 300),
  nota            text,
  urgente         boolean not null default false,
  fecha           timestamptz,          -- tarea: vencimiento / evento: inicio
  fin             timestamptz,          -- solo eventos
  aviso           timestamptz,          -- cuándo avisar (lo que ve el usuario)
  repeticion      text check (repeticion in ('diaria', 'semanal', 'mensual', 'habiles')),
  completada_en   timestamptz,          -- tarea completada (va a la papelera 7 días)
  borrada_en      timestamptz,          -- borrada a mano (papelera 7 días)
  -- uso interno del sistema de avisos
  proximo_envio   timestamptz,          -- próximo push a mandar
  envios          int not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index if not exists items_user_idx  on public.items (user_id);
create index if not exists items_envio_idx on public.items (proximo_envio) where proximo_envio is not null;

-- ---------------------------------------------------------------------
-- Suscripciones push (una por dispositivo: PC, iPhone, etc.)
-- ---------------------------------------------------------------------
create table if not exists public.suscripciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  dispositivo text,
  zona       text not null default 'America/Argentina/Buenos_Aires',
  creado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Seguridad: cada usuario solo ve y toca lo suyo (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.items         enable row level security;
alter table public.suscripciones enable row level security;

drop policy if exists "items propios" on public.items;
create policy "items propios" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "suscripciones propias" on public.suscripciones;
create policy "suscripciones propias" on public.suscripciones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Trigger: mantiene actualizado_en y reprograma el push cuando cambia
-- el aviso o se completa/restaura la tarea
-- ---------------------------------------------------------------------
create or replace function public.items_antes_de_guardar()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();

  if tg_op = 'INSERT'
     or new.aviso is distinct from old.aviso
     or new.completada_en is distinct from old.completada_en
     or new.borrada_en is distinct from old.borrada_en then
    if new.aviso is not null and new.completada_en is null and new.borrada_en is null then
      new.proximo_envio := new.aviso;
      new.envios := 0;
    else
      new.proximo_envio := null;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists items_antes_de_guardar on public.items;
create trigger items_antes_de_guardar
  before insert or update on public.items
  for each row execute function public.items_antes_de_guardar();

-- ---------------------------------------------------------------------
-- Tiempo real: para que la PC y el celular se actualicen al instante
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;
