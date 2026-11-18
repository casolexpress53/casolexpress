-- =====================================================================
-- Casol Express · Edição simultânea  |  Rode depois de sincronizacao.sql (repetível)
-- Cada linha tem uma `versao`. Quem salva em cima de uma versão desatualizada é barrado ('conflito_edicao')
-- em vez de sobrescrever o trabalho de outra pessoa; o app avisa e recarrega a versão mais nova.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['empresas','motoristas','romaneios','paradas','lancamentos','acertos','veiculos','ajustes','colaboradores'] loop
    execute format('alter table public.%I add column if not exists versao integer not null default 1', t);
  end loop;
end $$;

create or replace function public.controla_versao() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.versao is null or new.versao < 1 then new.versao := 1; end if;   -- no upsert, a versão enviada é a que o app leu
    return new;
  end if;
  if new.versao is distinct from old.versao then
    raise exception 'conflito_edicao' using detail = tg_table_name;
  end if;
  new.versao := old.versao + 1;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['empresas','motoristas','romaneios','paradas','lancamentos','acertos','veiculos','ajustes','colaboradores'] loop
    execute format('drop trigger if exists controla_versao on public.%I', t);
    execute format('create trigger controla_versao before insert or update on public.%I for each row execute function public.controla_versao()', t);
  end loop;
end $$;
