-- =====================================================================
-- Casol Express · Endurecimento e desempenho  |  Rode depois do schema, ponto e sla (repetível)
-- Aplicado no projeto da Casol em 18/11/2026 após os avisos do Supabase (security e performance).
-- =====================================================================

-- O gatilho que cria o perfil não deve ser chamável pela API (anon nem logado).
revoke all on function public.novo_usuario() from public, anon, authenticated;

-- Índices das chaves estrangeiras (consultas e exclusões em cascata).
create index if not exists acertos_lancamento_id    on public.acertos (lancamento_id);
create index if not exists pedidos_ponto_colab      on public.pedidos_ponto (colaborador_id);
create index if not exists romaneios_empresa_id     on public.romaneios (empresa_id);
create index if not exists veiculos_motorista_id    on public.veiculos (motorista_id);

-- Políticas: avalia auth/eh_dono uma vez por consulta (initplan), não uma vez por linha.
drop policy if exists perfil_proprio on public.perfis;
create policy perfil_proprio on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select public.eh_dono()));
drop policy if exists perfil_dono_altera on public.perfis;
create policy perfil_dono_altera on public.perfis for update to authenticated
  using ((select public.eh_dono())) with check ((select public.eh_dono()));

do $$
declare t text;
begin
  foreach t in array array['empresas','motoristas','romaneios','paradas','lancamentos','acertos','veiculos','ajustes','colaboradores','pontos','pedidos_ponto'] loop
    execute format('drop policy if exists dono_total on public.%I', t);
    execute format('create policy dono_total on public.%I for all to authenticated using ((select public.eh_dono())) with check ((select public.eh_dono()))', t);
  end loop;
end $$;

-- Privilégios de tabela. Em projetos novos do Supabase as tabelas NÃO vêm liberadas para a API:
-- sem isto o app não lê nem grava. O RLS continua decidindo quem é dono; o anônimo não recebe nada.
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, delete on public.perfis from authenticated;          -- perfil nasce pelo gatilho; ninguém apaga pela API
grant all on all tables in schema public to service_role;           -- tarefas de servidor (backup); a chave nunca vai ao front
-- Tabelas criadas depois: repita os GRANTs acima para elas.
