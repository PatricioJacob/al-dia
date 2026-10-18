-- =====================================================================
-- Al día · Aviso anticipado (1 a 7 días antes)
-- Correr DESPUÉS de 01_esquema.sql. Se puede correr más de una vez.
-- Pegar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

alter table public.items
  add column if not exists anticipo_dias    smallint check (anticipo_dias between 1 and 7),
  add column if not exists proximo_anticipo timestamptz;  -- uso interno: cuándo mandar el aviso anticipado

create index if not exists items_anticipo_idx on public.items (proximo_anticipo) where proximo_anticipo is not null;

-- ---------------------------------------------------------------------
-- El trigger ahora también programa el aviso anticipado:
--   N días antes de la fecha, a la misma hora (o a las 9:00 si no tiene hora)
-- Si se completa, se borra o ya pasó, no se programa.
-- ---------------------------------------------------------------------
create or replace function public.items_antes_de_guardar()
returns trigger language plpgsql as $$
declare
  base timestamptz;
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

  if tg_op = 'INSERT'
     or new.anticipo_dias is distinct from old.anticipo_dias
     or new.fecha is distinct from old.fecha
     or new.aviso is distinct from old.aviso
     or new.completada_en is distinct from old.completada_en
     or new.borrada_en is distinct from old.borrada_en then
    new.proximo_anticipo := null;
    base := case when new.tipo = 'evento' then new.fecha else coalesce(new.fecha, new.aviso) end;
    if new.anticipo_dias is not null and base is not null
       and new.completada_en is null and new.borrada_en is null then
      -- Solo día (00:00 en Argentina): avisar a las 9:00
      if (base at time zone 'America/Argentina/Buenos_Aires')::time = '00:00' then
        base := base + interval '9 hours';
      end if;
      base := base - make_interval(days => new.anticipo_dias);
      if base > now() then
        new.proximo_anticipo := base;
      end if;
    end if;
  end if;

  return new;
end $$;
