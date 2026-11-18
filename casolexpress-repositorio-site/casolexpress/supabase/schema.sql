-- =====================================================================
-- Casol Express · Gestão  |  Esquema do Supabase (Postgres + RLS)
-- Rode inteiro no SQL Editor de um projeto NOVO e exclusivo da Casol.
-- RLS fica LIGADO em todas as tabelas. Nada é acessível sem login.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- perfis (quem é dono e quem é motorista) -------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  papel       text not null default 'motorista' check (papel in ('dono','motorista')),
  nome        text,
  criado_em   timestamptz not null default now()
);

-- Quem pode tudo? Função usada pelas políticas (SECURITY DEFINER evita recursão de RLS).
create or replace function public.eh_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'dono');
$$;

-- Todo usuário novo nasce como 'motorista' sem acesso a nada. O dono é promovido à mão (ver README).
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, papel, nome) values (new.id, 'motorista', split_part(new.email,'@',1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users for each row execute function public.novo_usuario();

-- ---------- tabelas de negócio ---------------------------------------
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tarifa integer not null default 0 check (tarifa >= 0),          -- centavos que a parceira paga por pacote
  prazo_dias integer not null default 1 check (prazo_dias >= 0)
);

create table if not exists public.motoristas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'pacote' check (tipo in ('pacote','fixo')),
  valor integer not null default 0 check (valor >= 0),            -- centavos por pacote, ou salário mensal se fixo
  ativo boolean not null default true,
  user_id uuid unique references auth.users(id) on delete set null -- login do motorista (opcional)
);

create table if not exists public.romaneios (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  empresa_id uuid not null references public.empresas(id),
  arquivo text,
  finalizado boolean not null default false
);

create table if not exists public.paradas (
  id uuid primary key default gen_random_uuid(),
  romaneio_id uuid not null references public.romaneios(id) on delete cascade,
  motorista_id uuid references public.motoristas(id) on delete set null,
  endereco text not null,
  bairro text,
  cidade text,
  cliente text,                        -- dado pessoal do destinatário: acesso mínimo
  pacotes text[] not null default '{}',
  status text not null default 'pendente'
    check (status in ('pendente','entregue','ausente','recusado','avaria','endereco_errado','reagendar')),
  baixa_em timestamptz,
  lat double precision,
  lng double precision
);
create index if not exists paradas_motorista_status on public.paradas (motorista_id, status);
create index if not exists paradas_romaneio on public.paradas (romaneio_id);

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo text not null check (tipo in ('entrada','saida')),
  categoria text not null,
  descricao text not null,
  valor integer not null check (valor >= 0),
  pago boolean not null default false,
  venc date,
  origem text
);

create table if not exists public.acertos (
  id uuid primary key default gen_random_uuid(),
  motorista_id uuid not null references public.motoristas(id) on delete cascade,
  ini date not null,
  fim date not null,
  descontos jsonb not null default '[]',
  aprovado_em timestamptz,
  lancamento_id uuid references public.lancamentos(id) on delete set null,
  unique (motorista_id, ini)
);

create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  motorista_id uuid references public.motoristas(id) on delete set null,
  rastreador_id text,
  instalado boolean not null default false
);

create table if not exists public.ajustes (
  id integer primary key default 1 check (id = 1),                -- uma única linha
  saldo_inicial integer not null default 0,
  valor_padrao integer not null default 0,
  meta integer not null default 0,
  categorias text[] not null default '{}'
);
insert into public.ajustes (id) values (1) on conflict do nothing;

-- ---------- RLS: ligado em tudo ---------------------------------------
alter table public.perfis      enable row level security;
alter table public.empresas    enable row level security;
alter table public.motoristas  enable row level security;
alter table public.romaneios   enable row level security;
alter table public.paradas     enable row level security;
alter table public.lancamentos enable row level security;
alter table public.acertos     enable row level security;
alter table public.veiculos    enable row level security;
alter table public.ajustes     enable row level security;

-- Dono: acesso total ao que é da operação.
do $$
declare t text;
begin
  foreach t in array array['empresas','motoristas','romaneios','paradas','lancamentos','acertos','veiculos','ajustes'] loop
    execute format('drop policy if exists dono_total on public.%I', t);
    execute format('create policy dono_total on public.%I for all to authenticated using (public.eh_dono()) with check (public.eh_dono())', t);
  end loop;
end $$;

-- Perfis: cada um lê só o próprio; o dono lê e altera todos. Ninguém se promove sozinho.
drop policy if exists perfil_proprio on public.perfis;
create policy perfil_proprio on public.perfis for select to authenticated using (id = auth.uid() or public.eh_dono());
drop policy if exists perfil_dono_altera on public.perfis;
create policy perfil_dono_altera on public.perfis for update to authenticated using (public.eh_dono()) with check (public.eh_dono());

-- Motorista NÃO lê as tabelas diretamente. Só as funções abaixo, que devolvem apenas as paradas dele.

-- ---------- funções do motorista (SECURITY DEFINER, escopo próprio) ----
create or replace function public.motorista_meus_dados() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare mid uuid;
begin
  select id into mid from public.motoristas where user_id = auth.uid() and ativo;
  if mid is null then return jsonb_build_object('erro','motorista_nao_vinculado'); end if;
  return jsonb_build_object(
    'motorista', (select to_jsonb(m) - 'user_id' from public.motoristas m where m.id = mid),
    'paradas', coalesce((
      select jsonb_agg(jsonb_build_object('id',p.id,'endereco',p.endereco,'bairro',p.bairro,'cidade',p.cidade,
                                          'cliente',p.cliente,'pacotes',p.pacotes,'status',p.status,'baixa_em',p.baixa_em))
      from public.paradas p
      where p.motorista_id = mid and (p.status = 'pendente' or p.baixa_em::date = current_date)
    ), '[]'::jsonb));
end $$;

create or replace function public.motorista_baixar(p_parada uuid, p_status text, p_lat double precision default null, p_lng double precision default null)
returns void language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if p_status not in ('entregue','ausente','recusado','avaria','endereco_errado','reagendar') then
    raise exception 'status inválido';
  end if;
  select id into mid from public.motoristas where user_id = auth.uid() and ativo;
  update public.paradas set status = p_status, baixa_em = now(), lat = p_lat, lng = p_lng
   where id = p_parada and motorista_id = mid;
  if not found then raise exception 'parada não encontrada para este motorista'; end if;
end $$;

create or replace function public.motorista_desfazer(p_parada uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  select id into mid from public.motoristas where user_id = auth.uid() and ativo;
  update public.paradas set status = 'pendente', baixa_em = null, lat = null, lng = null
   where id = p_parada and motorista_id = mid and baixa_em::date = current_date;
  if not found then raise exception 'não foi possível desfazer'; end if;
end $$;

-- Funções só para quem está logado (nunca para anônimos).
revoke all on function public.motorista_meus_dados() from public, anon;
revoke all on function public.motorista_baixar(uuid, text, double precision, double precision) from public, anon;
revoke all on function public.motorista_desfazer(uuid) from public, anon;
grant execute on function public.motorista_meus_dados() to authenticated;
grant execute on function public.motorista_baixar(uuid, text, double precision, double precision) to authenticated;
grant execute on function public.motorista_desfazer(uuid) to authenticated;
revoke all on function public.eh_dono() from public, anon;
grant execute on function public.eh_dono() to authenticated;

-- Tempo real só onde faz sentido.
alter publication supabase_realtime add table public.paradas;
