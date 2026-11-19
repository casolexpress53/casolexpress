-- =====================================================================
-- Casol Express · Metas (SLA) na tela do motorista  |  Rode depois de sincronizacao.sql (repetível)
-- O motorista recebe as paradas do mês (com o romaneio) e só o PRAZO das empresas, para ver o próprio SLA.
-- Nome e tarifa das empresas NÃO vão para o motorista.
-- =====================================================================
create or replace function public.motorista_meus_dados() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare mid uuid; res jsonb;
        hoje date := (now() at time zone 'America/Sao_Paulo')::date;
        ini date := (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date;   -- mês passado + atual: dá para ver a quinzena anterior
begin
  select id into mid from public.motoristas where user_id = auth.uid() and ativo;
  if mid is null then return jsonb_build_object('erro','motorista_nao_vinculado'); end if;
  with ps as (
    select p.*, r.empresa_id as emp_id, r.data as rdata
      from public.paradas p join public.romaneios r on r.id = p.romaneio_id
     where p.motorista_id = mid
       and (p.status = 'pendente' or r.data >= ini or (p.baixa_em at time zone 'America/Sao_Paulo')::date = hoje)
  ), rs as (
    select distinct romaneio_id as id, rdata as data, emp_id as empresa_id from ps
  ), es as (
    select e.id, e.prazo_dias from public.empresas e where e.id in (select empresa_id from rs)
  )
  select jsonb_build_object(
    'motorista', (select to_jsonb(m) - 'user_id' - 'extra' from public.motoristas m where m.id = mid),
    'sla_padrao', (select sla from public.ajustes where id = 1),
    'fechamento', (select extra->'fechamento' from public.ajustes where id = 1),
    'paradas', coalesce((select jsonb_agg(jsonb_build_object('id',ps.id,'romaneio_id',ps.romaneio_id,'endereco',ps.endereco,
                'bairro',ps.bairro,'cidade',ps.cidade,'cliente',ps.cliente,'pacotes',ps.pacotes,'status',ps.status,'baixa_em',ps.baixa_em) order by ps.seq) from ps), '[]'::jsonb),
    'romaneios', coalesce((select jsonb_agg(jsonb_build_object('id',rs.id,'data',rs.data,'empresa_id',rs.empresa_id)) from rs), '[]'::jsonb),
    'empresas', coalesce((select jsonb_agg(jsonb_build_object('id',es.id,'prazo_dias',es.prazo_dias)) from es), '[]'::jsonb)
  ) into res;
  return res;
end $$;
