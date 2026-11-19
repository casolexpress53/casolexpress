-- Casol Express · Permissões da equipe  |  Rode DEPOIS de ponto.sql (incremental e repetível)
-- "Só bater ponto" = papel colaborador. "Operar o sistema" = papel operador, com abas liberadas pelo dono.
-- O operador mexe só nas tabelas de operação (empresas, motoristas, romaneios, paradas) e LÊ os ajustes.
-- Caixa, comissões, veículos, ponto dos outros e acessos continuam só do dono.

alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('dono','motorista','colaborador','operador'));
alter table public.perfis add column if not exists abas text[] not null default '{}';

alter table public.colaboradores add column if not exists permissao text not null default 'ponto';
alter table public.colaboradores drop constraint if exists colaboradores_permissao_check;
alter table public.colaboradores add constraint colaboradores_permissao_check check (permissao in ('ponto','operador'));
alter table public.colaboradores add column if not exists abas text[] not null default '{}';

create or replace function public.eh_operador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and papel = 'operador');
$$;
revoke all on function public.eh_operador() from public, anon;
grant execute on function public.eh_operador() to authenticated;

do $$ declare t text; begin
  foreach t in array array['empresas','motoristas','romaneios','paradas'] loop
    execute format('drop policy if exists operador_op on public.%I', t);
    execute format('create policy operador_op on public.%I for all to authenticated using ((select public.eh_operador())) with check ((select public.eh_operador()))', t);
  end loop;
end $$;
drop policy if exists operador_le on public.ajustes;
create policy operador_le on public.ajustes for select to authenticated using ((select public.eh_operador()));

-- Mantém o perfil (papel e abas do login) igual ao que o dono marcou no cadastro do funcionário.
create or replace function public.sincroniza_perfil_colab() returns trigger
language plpgsql security definer set search_path = public as $$
declare lista text[];
begin
  if new.user_id is null then return new; end if;
  lista := array(select a from unnest(new.abas) a where a in ('romaneio','entregas','motorista','sla'));
  update public.perfis
     set papel = case when new.permissao = 'operador' then 'operador' else 'colaborador' end,
         abas  = case when new.permissao = 'operador' then lista else '{}' end
   where id = new.user_id and papel in ('colaborador','operador');
  return new;
end $$;
revoke all on function public.sincroniza_perfil_colab() from public, anon, authenticated;
drop trigger if exists sincroniza_perfil_colab on public.colaboradores;
create trigger sincroniza_perfil_colab after insert or update of user_id, permissao, abas on public.colaboradores
  for each row execute function public.sincroniza_perfil_colab();
