-- =====================================================================
-- Casol Express · Controle de ponto  |  Rode DEPOIS do schema.sql (é incremental e repetível)
-- Colaborador (operacional/ajudante) bate ponto só dentro do raio do local cadastrado.
-- RLS ligado: o colaborador NÃO lê as tabelas; só as funções abaixo, sempre no escopo dele.
-- O horário vem do servidor (now()); o dia é o de Brasília. A distância é recalculada aqui.
-- Limite honesto: o GPS vem do aparelho e pode ser falsificado. Isto barra o descuido e o
-- atalho óbvio, não uma fraude determinada.
-- =====================================================================

-- Novo papel
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('dono','motorista','colaborador'));

-- ---------- tabelas ----------------------------------------------------
create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  funcao text,
  ativo boolean not null default true,
  endereco text,                              -- texto de referência
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  raio_m integer not null default 100 check (raio_m between 20 and 1000),
  carga_min integer check (carga_min is null or carga_min between 1 and 1440),  -- carga diária, opcional
  bate_ponto boolean not null default true,    -- false: cadastro sem registro de ponto
  user_id uuid unique references auth.users(id) on delete set null
);

create table if not exists public.pontos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  em timestamptz not null default now(),
  tipo text not null check (tipo in ('entrada','saida_intervalo','volta_intervalo','saida')),
  dia date generated always as ((em at time zone 'America/Sao_Paulo')::date) stored,
  lat double precision, lng double precision,
  dist_m integer, precisao_m integer,
  origem text not null default 'gps' check (origem in ('gps','ajuste','dono')),
  unique (colaborador_id, dia, tipo)           -- no máximo uma batida de cada tipo por dia
);
create index if not exists pontos_colab_dia on public.pontos (colaborador_id, dia);

create table if not exists public.pedidos_ponto (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  dia date not null,
  tipo text not null check (tipo in ('entrada','saida_intervalo','volta_intervalo','saida')),
  hora time not null,
  motivo text not null check (length(btrim(motivo)) > 0),
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  resposta text
);
create index if not exists pedidos_ponto_status on public.pedidos_ponto (status, colaborador_id);

alter table public.colaboradores enable row level security;
alter table public.pontos        enable row level security;
alter table public.pedidos_ponto enable row level security;

do $$
declare t text;
begin
  foreach t in array array['colaboradores','pontos','pedidos_ponto'] loop
    execute format('drop policy if exists dono_total on public.%I', t);
    execute format('create policy dono_total on public.%I for all to authenticated using (public.eh_dono()) with check (public.eh_dono())', t);
  end loop;
end $$;

alter table public.colaboradores add column if not exists bate_ponto boolean not null default true;  -- para bancos que já rodaram a versão anterior

-- ---------- apoio -------------------------------------------------------
create or replace function public.colab_atual() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.colaboradores where user_id = auth.uid() and ativo;
$$;

create or replace function public.dist_metros(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 6371000 * 2 * asin(sqrt(least(1, power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))));
$$;

-- ---------- funções do colaborador -------------------------------------
create or replace function public.ponto_meus_dados(p_mes date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cid uuid; ini date; fim date;
begin
  cid := public.colab_atual();
  if cid is null then return jsonb_build_object('erro','colaborador_nao_vinculado'); end if;
  ini := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date))::date;
  fim := (ini + interval '1 month')::date;
  return jsonb_build_object(
    'colaborador', (select jsonb_build_object('id',c.id,'nome',c.nome,'funcao',c.funcao,'endereco',c.endereco,
                      'raio_m',c.raio_m,'carga_min',c.carga_min,'bate_ponto',c.bate_ponto,'tem_local',(c.lat is not null and c.lng is not null))
                    from public.colaboradores c where c.id = cid),
    'batidas', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'em',p.em,'tipo',p.tipo,'origem',p.origem,'dist_m',p.dist_m) order by p.em)
                         from public.pontos p where p.colaborador_id = cid and p.dia >= ini and p.dia < fim), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'dia',q.dia,'tipo',q.tipo,'hora',q.hora,'motivo',q.motivo,
                           'status',q.status,'resposta',q.resposta,'criado_em',q.criado_em) order by q.criado_em desc)
                         from public.pedidos_ponto q where q.colaborador_id = cid and q.criado_em > now() - interval '90 days'), '[]'::jsonb));
end $$;

create or replace function public.ponto_bater(p_tipo text, p_lat double precision, p_lng double precision, p_precisao double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.colaboradores; hoje date; d double precision; tem_e boolean; tem_si boolean; tem_v boolean; tem_s boolean; ultimo timestamptz; novo timestamptz; valido boolean;
begin
  if p_tipo not in ('entrada','saida_intervalo','volta_intervalo','saida') then raise exception 'tipo_invalido'; end if;
  select * into c from public.colaboradores where user_id = auth.uid() and ativo;
  if not found then raise exception 'colaborador_nao_vinculado'; end if;
  if not c.bate_ponto then raise exception 'sem_ponto'; end if;
  if c.lat is null or c.lng is null then raise exception 'sem_local'; end if;
  if p_lat is null or p_lng is null or p_precisao is null or p_precisao > 150 then raise exception 'gps_fraco'; end if;
  d := public.dist_metros(p_lat, p_lng, c.lat, c.lng);
  if d > c.raio_m then raise exception 'fora_do_local:%', round(d); end if;

  perform pg_advisory_xact_lock(hashtext(c.id::text));
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  select bool_or(tipo = 'entrada'), bool_or(tipo = 'saida_intervalo'), bool_or(tipo = 'volta_intervalo'), bool_or(tipo = 'saida'), max(em)
    into tem_e, tem_si, tem_v, tem_s, ultimo
    from public.pontos where colaborador_id = c.id and dia = hoje;
  tem_e := coalesce(tem_e,false); tem_si := coalesce(tem_si,false); tem_v := coalesce(tem_v,false); tem_s := coalesce(tem_s,false);
  if ultimo is not null and ultimo > now() - interval '60 seconds' then raise exception 'muito_rapido'; end if;
  valido := case p_tipo
      when 'entrada'         then not tem_e
      when 'saida_intervalo' then tem_e and not tem_si and not tem_s
      when 'volta_intervalo' then tem_si and not tem_v and not tem_s
      else                        tem_e and not tem_s and (not tem_si or tem_v) end;
  if not valido then raise exception 'sequencia_invalida'; end if;

  insert into public.pontos (colaborador_id, tipo, lat, lng, dist_m, precisao_m, origem)
  values (c.id, p_tipo, p_lat, p_lng, round(d), round(p_precisao), 'gps') returning em into novo;
  return jsonb_build_object('ok', true, 'em', novo, 'dist_m', round(d));
end $$;

create or replace function public.ponto_pedir_ajuste(p_dia date, p_tipo text, p_hora time, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; hoje date; novo uuid;
begin
  cid := public.colab_atual();
  if cid is null then raise exception 'colaborador_nao_vinculado'; end if;
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  if p_tipo not in ('entrada','saida_intervalo','volta_intervalo','saida') then raise exception 'tipo_invalido'; end if;
  if p_dia is null or p_hora is null or p_dia > hoje or p_dia < hoje - 62 then raise exception 'data_invalida'; end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then raise exception 'motivo_obrigatorio'; end if;
  if exists (select 1 from public.pedidos_ponto where colaborador_id = cid and dia = p_dia and tipo = p_tipo and status = 'pendente') then
    raise exception 'pedido_ja_pendente';
  end if;
  insert into public.pedidos_ponto (colaborador_id, dia, tipo, hora, motivo) values (cid, p_dia, p_tipo, p_hora, btrim(p_motivo)) returning id into novo;
  return novo;
end $$;

-- ---------- funções do dono --------------------------------------------
create or replace function public.ponto_decidir_ajuste(p_id uuid, p_aprovar boolean, p_resposta text default null) returns void
language plpgsql security definer set search_path = public as $$
declare q public.pedidos_ponto;
begin
  if not public.eh_dono() then raise exception 'sem_permissao'; end if;
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

-- Dono ajusta um horário direto na folha. p_hora nulo = remove a batida daquele tipo/dia.
create or replace function public.ponto_salvar_dia(p_colab uuid, p_dia date, p_tipo text, p_hora time) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_dono() then raise exception 'sem_permissao'; end if;
  if p_tipo not in ('entrada','saida_intervalo','volta_intervalo','saida') then raise exception 'tipo_invalido'; end if;
  if p_hora is null then
    delete from public.pontos where colaborador_id = p_colab and dia = p_dia and tipo = p_tipo;
  else
    insert into public.pontos (colaborador_id, em, tipo, origem)
    values (p_colab, (p_dia + p_hora) at time zone 'America/Sao_Paulo', p_tipo, 'dono')
    on conflict (colaborador_id, dia, tipo) do update set em = excluded.em, origem = 'dono', lat = null, lng = null, dist_m = null, precisao_m = null;
  end if;
end $$;

-- Liga o login (criado em Authentication > Users) ao colaborador e dá o papel certo.
create or replace function public.definir_acesso_colaborador(p_colab uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; papel_atual text;
begin
  if not public.eh_dono() then raise exception 'sem_permissao'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'usuario_nao_encontrado'; end if;
  select papel into papel_atual from public.perfis where id = uid;
  if papel_atual = 'dono' then raise exception 'usuario_e_dono'; end if;
  update public.colaboradores set user_id = null where user_id = uid and id <> p_colab;
  update public.colaboradores set user_id = uid where id = p_colab;
  if not found then raise exception 'colaborador_nao_encontrado'; end if;
  insert into public.perfis (id, papel, nome) values (uid, 'colaborador', split_part(p_email,'@',1))
  on conflict (id) do update set papel = 'colaborador';
end $$;

-- Só quem está logado executa.
revoke all on function public.colab_atual() from public, anon;
revoke all on function public.ponto_meus_dados(date) from public, anon;
revoke all on function public.ponto_bater(text, double precision, double precision, double precision) from public, anon;
revoke all on function public.ponto_pedir_ajuste(date, text, time, text) from public, anon;
revoke all on function public.ponto_decidir_ajuste(uuid, boolean, text) from public, anon;
revoke all on function public.ponto_salvar_dia(uuid, date, text, time) from public, anon;
revoke all on function public.definir_acesso_colaborador(uuid, text) from public, anon;
grant execute on function public.ponto_meus_dados(date) to authenticated;
grant execute on function public.ponto_bater(text, double precision, double precision, double precision) to authenticated;
grant execute on function public.ponto_pedir_ajuste(date, text, time, text) to authenticated;
grant execute on function public.ponto_decidir_ajuste(uuid, boolean, text) to authenticated;
grant execute on function public.ponto_salvar_dia(uuid, date, text, time) to authenticated;
grant execute on function public.definir_acesso_colaborador(uuid, text) to authenticated;
