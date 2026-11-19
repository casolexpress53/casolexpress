-- Casol Express · Permissões por função (equipe) + Notas fiscais dos motoristas
-- Rode DEPOIS de equipe.sql (incremental e repetível).

-- ---------- permissões por aba ----------
create or replace function public.op_pode(p_aba text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and papel = 'operador' and p_aba = any(abas));
$$;
create or replace function public.op_algum(p_abas text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and papel = 'operador' and abas && p_abas);
$$;
revoke all on function public.op_pode(text), public.op_algum(text[]) from public, anon;
grant execute on function public.op_pode(text), public.op_algum(text[]) to authenticated;

-- troca as políticas grossas do operador por políticas por aba
do $$ declare t text; begin
  foreach t in array array['empresas','motoristas','romaneios','paradas'] loop
    execute format('drop policy if exists operador_op on public.%I', t);
    execute format('drop policy if exists operador_w on public.%I', t);
    execute format('drop policy if exists operador_r on public.%I', t);
    execute format('create policy operador_w on public.%I for all to authenticated using ((select public.op_algum(array[''romaneio'',''entregas'',''motorista'']))) with check ((select public.op_algum(array[''romaneio'',''entregas'',''motorista''])))', t);
    execute format('create policy operador_r on public.%I for select to authenticated using ((select public.op_algum(array[''painel'',''sla'',''comissao'',''caixa'',''ajustes''])))', t);
  end loop;
end $$;

drop policy if exists operador_w on public.lancamentos; drop policy if exists operador_r on public.lancamentos;
create policy operador_w on public.lancamentos for all to authenticated using ((select public.op_algum(array['caixa','comissao']))) with check ((select public.op_algum(array['caixa','comissao'])));
create policy operador_r on public.lancamentos for select to authenticated using ((select public.op_algum(array['painel'])));
drop policy if exists operador_w on public.acertos; drop policy if exists operador_r on public.acertos;
create policy operador_w on public.acertos for all to authenticated using ((select public.op_algum(array['comissao']))) with check ((select public.op_algum(array['comissao'])));
create policy operador_r on public.acertos for select to authenticated using ((select public.op_algum(array['painel','caixa'])));
drop policy if exists operador_w on public.veiculos;
create policy operador_w on public.veiculos for all to authenticated using ((select public.op_pode('rastreador'))) with check ((select public.op_pode('rastreador')));

drop policy if exists operador_le on public.ajustes; drop policy if exists operador_r on public.ajustes;
drop policy if exists operador_i on public.ajustes; drop policy if exists operador_u on public.ajustes;
create policy operador_r on public.ajustes for select to authenticated using ((select public.eh_operador()));
create policy operador_i on public.ajustes for insert to authenticated with check ((select public.op_algum(array['ajustes','caixa'])));
create policy operador_u on public.ajustes for update to authenticated using ((select public.op_algum(array['ajustes','caixa']))) with check ((select public.op_algum(array['ajustes','caixa'])));

-- gestão do ponto (aba Ponto): leitura + funções que decidem pedidos e ajustam dias
do $$ declare t text; begin
  foreach t in array array['colaboradores','pontos','pedidos_ponto'] loop
    execute format('drop policy if exists operador_r on public.%I', t);
    execute format('create policy operador_r on public.%I for select to authenticated using ((select public.op_pode(''ponto'')))', t);
  end loop;
end $$;

create or replace function public.ponto_decidir_ajuste(p_id uuid, p_aprovar boolean, p_resposta text default null) returns void
language plpgsql security definer set search_path = public as $$
declare q public.pedidos_ponto;
begin
  if not (public.eh_dono() or public.op_pode('ponto')) then raise exception 'sem_permissao'; end if;
  select * into q from public.pedidos_ponto where id = p_id and status = 'pendente' for update;
  if not found then raise exception 'pedido_nao_encontrado'; end if;
  if p_aprovar then
    insert into public.pontos (colaborador_id, em, tipo, origem)
    values (q.colaborador_id, (q.dia + q.hora) at time zone 'America/Sao_Paulo', q.tipo, 'ajuste')
    on conflict (colaborador_id, dia, tipo) do update set em = excluded.em, origem = 'ajuste', lat = null, lng = null, dist_m = null, precisao_m = null;
  end if;
  update public.pedidos_ponto set status = case when p_aprovar then 'aprovado' else 'recusado' end,
         decidido_em = now(), resposta = nullif(btrim(coalesce(p_resposta,'')), '') where id = p_id;
end $$;
create or replace function public.ponto_salvar_dia(p_colab uuid, p_dia date, p_tipo text, p_hora time) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.eh_dono() or public.op_pode('ponto')) then raise exception 'sem_permissao'; end if;
  if p_tipo not in ('entrada','saida_intervalo','volta_intervalo','saida') then raise exception 'tipo_invalido'; end if;
  if p_hora is null then
    delete from public.pontos where colaborador_id = p_colab and dia = p_dia and tipo = p_tipo;
  else
    insert into public.pontos (colaborador_id, em, tipo, origem)
    values (p_colab, (p_dia + p_hora) at time zone 'America/Sao_Paulo', p_tipo, 'dono')
    on conflict (colaborador_id, dia, tipo) do update set em = excluded.em, origem = 'dono', lat = null, lng = null, dist_m = null, precisao_m = null;
  end if;
end $$;

-- abas que o dono pode liberar (o cadastro/permissões/acessos da equipe ficam só com o dono)
create or replace function public.sincroniza_perfil_colab() returns trigger
language plpgsql security definer set search_path = public as $$
declare lista text[]; op boolean;
begin
  if new.user_id is null then return new; end if;
  op := new.permissao = 'operador' and new.ativo;
  lista := array(select a from unnest(new.abas) a where a in ('painel','romaneio','entregas','motorista','sla','comissao','caixa','notas','ponto','rastreador','ajustes'));
  update public.perfis set papel = case when op then 'operador' else 'colaborador' end, abas = case when op then lista else '{}' end
   where id = new.user_id and papel in ('colaborador','operador');
  return new;
end $$;
revoke all on function public.sincroniza_perfil_colab() from public, anon, authenticated;
-- reaplica nas contas que já existem
update public.perfis p set abas = array(select a from unnest(c.abas) a where a in ('painel','romaneio','entregas','motorista','sla','comissao','caixa','notas','ponto','rastreador','ajustes'))
  from public.colaboradores c where c.user_id = p.id and p.papel = 'operador';

-- ---------- notas fiscais ----------
create or replace function public.meu_motorista_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.motoristas where user_id = (select auth.uid()) and ativo limit 1;
$$;
revoke all on function public.meu_motorista_id() from public, anon;
grant execute on function public.meu_motorista_id() to authenticated;

create table if not exists public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  motorista_id uuid references public.motoristas(id) on delete set null,
  motorista_nome text not null default '',
  numero text,
  observacao text,
  arquivo text not null,                 -- caminho no bucket notas-fiscais: <motorista_id>/<arquivo>
  nome_arquivo text not null,
  mime text,
  tamanho integer,
  criado_em timestamptz not null default now(),
  visto_em timestamptz,
  visto_por uuid
);
create index if not exists notas_fiscais_criado_idx on public.notas_fiscais (criado_em desc);
create index if not exists notas_fiscais_motorista_idx on public.notas_fiscais (motorista_id);
alter table public.notas_fiscais enable row level security;
grant select, insert, update, delete on public.notas_fiscais to authenticated;
grant all on public.notas_fiscais to service_role;
drop policy if exists dono_total on public.notas_fiscais;
create policy dono_total on public.notas_fiscais for all to authenticated using ((select public.eh_dono())) with check ((select public.eh_dono()));
drop policy if exists operador_notas_r on public.notas_fiscais;
create policy operador_notas_r on public.notas_fiscais for select to authenticated using ((select public.op_pode('notas')));
drop policy if exists operador_notas_u on public.notas_fiscais;
create policy operador_notas_u on public.notas_fiscais for update to authenticated using ((select public.op_pode('notas'))) with check ((select public.op_pode('notas')));
drop policy if exists motorista_notas_r on public.notas_fiscais;
create policy motorista_notas_r on public.notas_fiscais for select to authenticated using (motorista_id is not null and motorista_id = (select public.meu_motorista_id()));
drop policy if exists motorista_notas_i on public.notas_fiscais;
create policy motorista_notas_i on public.notas_fiscais for insert to authenticated
  with check (motorista_id is not null and motorista_id = (select public.meu_motorista_id()) and visto_em is null and visto_por is null);
drop policy if exists motorista_notas_d on public.notas_fiscais;
create policy motorista_notas_d on public.notas_fiscais for delete to authenticated using (motorista_id = (select public.meu_motorista_id()) and visto_em is null);

-- arquivos (privados, até 10 MB, só PDF/imagem/XML)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas-fiscais', 'notas-fiscais', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp','application/xml','text/xml'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists nf_motorista_envia on storage.objects;
create policy nf_motorista_envia on storage.objects for insert to authenticated
  with check (bucket_id = 'notas-fiscais' and (storage.foldername(name))[1] = (select public.meu_motorista_id())::text);
drop policy if exists nf_le on storage.objects;
create policy nf_le on storage.objects for select to authenticated
  using (bucket_id = 'notas-fiscais' and ((select public.eh_dono()) or (select public.op_pode('notas')) or (storage.foldername(name))[1] = (select public.meu_motorista_id())::text));
drop policy if exists nf_apaga on storage.objects;
create policy nf_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'notas-fiscais' and ((select public.eh_dono()) or (storage.foldername(name))[1] = (select public.meu_motorista_id())::text));
