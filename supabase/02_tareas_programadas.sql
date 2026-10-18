-- =====================================================================
-- Al día · Tareas programadas (avisos, resumen diario, papelera)
-- ANTES de correrlo, reemplazá:
--   qxzhufpzjnujgqcrdhmp  -> el id de tu proyecto (lo que va antes de .supabase.co)
--   TU_SECRETO   -> el contenido de secretos/cron_secret.txt
-- Pegar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Si ya existían, las borramos para poder correr este archivo de nuevo
select cron.unschedule(jobname) from cron.job
where jobname in ('al-dia-avisos', 'al-dia-resumen', 'al-dia-papelera');

-- 1) Cada minuto: manda los avisos que vencieron
select cron.schedule(
  'al-dia-avisos',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://qxzhufpzjnujgqcrdhmp.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'TU_SECRETO'),
    body    := '{"accion":"avisos"}'::jsonb
  );
  $$
);

-- 2) Todos los días a las 8:00 de Argentina (11:00 UTC): resumen del día
select cron.schedule(
  'al-dia-resumen',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := 'https://qxzhufpzjnujgqcrdhmp.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'TU_SECRETO'),
    body    := '{"accion":"resumen"}'::jsonb
  );
  $$
);

-- 3) Todos los días: vacía la papelera (lo completado o borrado hace más de 7 días)
select cron.schedule(
  'al-dia-papelera',
  '30 6 * * *',
  $$
  delete from public.items
  where (completada_en is not null and completada_en < now() - interval '7 days')
     or (borrada_en    is not null and borrada_en    < now() - interval '7 days');
  $$
);

-- Para revisar que estén andando:
-- select * from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 20;
