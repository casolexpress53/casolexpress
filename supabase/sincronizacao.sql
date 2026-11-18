-- =====================================================================
-- Casol Express · Sincronização do app com o banco  |  Rode depois de schema/ponto/sla/endurecimento (repetível)
-- =====================================================================

-- Coluna de segurança: qualquer campo novo do app que ainda não tenha coluna própria é guardado aqui, sem perda.
do $$
declare t text;
begin
  foreach t in array array['empresas','motoristas','romaneios','paradas','lancamentos','acertos','veiculos','ajustes'] loop
    execute format('alter table public.%I add column if not exists extra jsonb not null default ''{}''::jsonb', t);
  end loop;
end $$;

-- Funções do motorista: o "hoje" é o de Brasília (baixa às 22h não vira "amanhã") e a meta padrão vem junto.
create or replace function public.motorista_meus_dados() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare mid uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select id into mid from public.motoristas where user_id = auth.uid() and ativo;
  if mid is null then return jsonb_build_object('erro','motorista_nao_vinculado'); end if;
  return jsonb_build_object(
    'motorista', (select to_jsonb(m) - 'user_id' - 'extra' from public.motoristas m where m.id = mid),
    'sla_padrao', (select sla from public.ajustes where id = 1),
    'paradas', coalesce((
      select jsonb_agg(jsonb_build_object('id',p.id,'endereco',p.endereco,'bairro',p.bairro,'cidade',p.cidade,
                                          'cliente',p.cliente,'pacotes',p.pacotes,'status',p.status,'baixa_em',p.baixa_em))
      from public.paradas p
      where p.motorista_id = mid and (p.status = 'pendente' or (p.baixa_em at time zone 'America/Sao_Paulo')::date = hoje)
    ), '[]'::jsonb));
end $$;

create or replace function public.motorista_desfazer(p_parada uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  select id into mid from public.motoristas where user_id = auth.uid() and ativo;
  update public.paradas set status = 'pendente', baixa_em = null, lat = null, lng = null
   where id = p_parada and motorista_id = mid
     and (baixa_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date;
  if not found then raise exception 'não foi possível desfazer'; end if;
end $$;

-- Liga o login (criado em Authentication > Users) ao motorista.
create or replace function public.definir_acesso_motorista(p_motorista uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; papel_atual text;
begin
  if not public.eh_dono() then raise exception 'sem_permissao'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'usuario_nao_encontrado'; end if;
  select papel into papel_atual from public.perfis where id = uid;
  if papel_atual = 'dono' then raise exception 'usuario_e_dono'; end if;
  update public.motoristas set user_id = null where user_id = uid and id <> p_motorista;
  update public.motoristas set user_id = uid where id = p_motorista;
  if not found then raise exception 'motorista_nao_encontrado'; end if;
  insert into public.perfis (id, papel, nome) values (uid, 'motorista', split_part(p_email,'@',1))
  on conflict (id) do update set papel = 'motorista';
end $$;
revoke all on function public.definir_acesso_motorista(uuid, text) from public, anon;
grant execute on function public.definir_acesso_motorista(uuid, text) to authenticated;

-- Ordem de inserção preservada (o app lista na ordem em que os dados entraram; UUID é aleatório).
do $$
declare t text;
begin
  foreach t in array array['empresas','motoristas','romaneios','paradas','lancamentos','acertos','veiculos'] loop
    execute format('alter table public.%I add column if not exists seq bigint generated always as identity', t);
    execute format('create index if not exists %I on public.%I (seq)', t || '_seq', t);
  end loop;
end $$;
